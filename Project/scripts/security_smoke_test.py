#!/usr/bin/env python3
"""
CloudVM security smoke tests (localhost/docker).

Runs quick, repeatable checks for critical security controls:
- auth/session cookie behavior
- logout invalidation
- strict DTO validation
- fingerprint mismatch rejection
- brute-force lockout
- gateway auth rate-limiting
- security headers presence
"""

from __future__ import annotations

import argparse
import json
import random
import string
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from http.cookiejar import CookieJar
from typing import Any, Dict, Optional, Tuple


@dataclass
class TestResult:
    id: str
    description: str
    passed: bool
    detail: str


class HttpClient:
    def __init__(self, base_url: str, user_agent: str = "CloudVM-Security-Smoke/1.0"):
        self.base_url = base_url.rstrip("/")
        self.cookie_jar = CookieJar()
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.cookie_jar))
        self.user_agent = user_agent

    def request(
        self,
        method: str,
        path: str,
        data: Optional[Dict[str, Any]] = None,
        headers: Optional[Dict[str, str]] = None,
        timeout: int = 20,
    ) -> Tuple[int, Dict[str, str], str]:
        url = f"{self.base_url}{path}"
        body = None
        req_headers: Dict[str, str] = {
            "User-Agent": self.user_agent,
            "Accept": "application/json",
        }
        if headers:
            req_headers.update(headers)

        if data is not None:
            body = json.dumps(data).encode("utf-8")
            req_headers.setdefault("Content-Type", "application/json")

        req = urllib.request.Request(url=url, data=body, headers=req_headers, method=method.upper())

        try:
            with self.opener.open(req, timeout=timeout) as resp:
                status = resp.getcode()
                response_headers = {k.lower(): v for k, v in resp.headers.items()}
                content = resp.read().decode("utf-8", errors="replace")
                return status, response_headers, content
        except urllib.error.HTTPError as e:
            status = e.code
            response_headers = {k.lower(): v for k, v in e.headers.items()}
            content = e.read().decode("utf-8", errors="replace")
            return status, response_headers, content


class RawHttpClient(HttpClient):
    """No cookie persistence; useful for replay/fingerprint tests."""

    def __init__(self, base_url: str, user_agent: str = "CloudVM-Security-Smoke/1.0"):
        self.base_url = base_url.rstrip("/")
        self.user_agent = user_agent
        self.opener = urllib.request.build_opener()


def rand_suffix(n: int = 8) -> str:
    alphabet = string.ascii_lowercase + string.digits
    return "".join(random.choice(alphabet) for _ in range(n))


def parse_json(text: str) -> Dict[str, Any]:
    try:
        return json.loads(text) if text else {}
    except json.JSONDecodeError:
        return {}


def run_tests(base_url: str) -> Tuple[list[TestResult], int]:
    results: list[TestResult] = []

    def add(test_id: str, description: str, passed: bool, detail: str) -> None:
        results.append(TestResult(test_id, description, passed, detail))

    # 1) Gateway health + security headers
    anon = RawHttpClient(base_url)
    status, headers, _ = anon.request("GET", "/health")
    has_frame = "x-frame-options" in headers
    has_nosniff = headers.get("x-content-type-options", "").lower() == "nosniff"
    has_referrer = "referrer-policy" in headers
    add(
        "SEC-01",
        "Gateway health and core security headers",
        status == 200 and has_frame and has_nosniff and has_referrer,
        f"status={status}, frame={has_frame}, nosniff={has_nosniff}, referrer={has_referrer}",
    )

    # 2) Register and validate cookie flags
    session = HttpClient(base_url, user_agent="CloudVM-UA-A")
    email = f"security.{int(time.time())}.{rand_suffix()}@example.com"
    password = "Str0ng!Passw0rd#2026"
    status, headers, body = session.request(
        "POST",
        "/api/auth/register",
        {
            "email": email,
            "password": password,
            "firstName": "Sec",
            "lastName": "Tester",
        },
    )
    register_body_j = parse_json(body)
    register_access_token = register_body_j.get("accessToken", "")
    set_cookie = headers.get("set-cookie", "")
    set_cookie_l = set_cookie.lower()
    cookie_names = {cookie.name for cookie in session.cookie_jar}
    has_access_cookie = "accessToken" in cookie_names
    has_refresh_cookie = "refreshToken" in cookie_names
    cookie_ok = (
        "httponly" in set_cookie_l
        and "samesite=strict" in set_cookie_l
        and has_access_cookie
        and has_refresh_cookie
    )
    add(
        "SEC-02",
        "Register issues auth cookies with hardened flags",
        status == 201 and cookie_ok,
        (
            f"status={status}, cookie_flags_ok={cookie_ok}, "
            f"has_access_cookie={has_access_cookie}, has_refresh_cookie={has_refresh_cookie}"
        ),
    )

    # 3) /auth/me works with authenticated session
    status, _, _ = session.request("GET", "/api/auth/me")
    add(
        "SEC-03",
        "Authenticated /auth/me succeeds",
        status == 200,
        f"status={status}",
    )

    # 4) DTO strictness (extra field must fail)
    email2 = f"strict.{int(time.time())}.{rand_suffix()}@example.com"
    status, _, body = anon.request(
        "POST",
        "/api/auth/register",
        {
            "email": email2,
            "password": password,
            "firstName": "Strict",
            "lastName": "Check",
            "unexpectedField": "boom",
        },
    )
    body_j = parse_json(body)
    msg = json.dumps(body_j.get("message", body_j), ensure_ascii=False)
    strict_ok = status == 400 and ("should not exist" in msg.lower() or "forbid" in msg.lower())
    add(
        "SEC-04",
        "DTO whitelist/forbidNonWhitelisted enforcement",
        strict_ok,
        f"status={status}, message={msg[:180]}",
    )

    # 5) Fingerprint mismatch using bearer token with different user-agent
    # Login with UA-A to get token, then call /auth/me with UA-B and bearer token only.
    # If login is temporarily rate-limited, fall back to register-issued access token.
    status, _, body = session.request("POST", "/api/auth/login", {"email": email, "password": password})
    body_j = parse_json(body)
    access_token = body_j.get("accessToken", "") or register_access_token

    ua_b = RawHttpClient(base_url, user_agent="CloudVM-UA-B")
    status2, _, _ = ua_b.request(
        "GET",
        "/api/auth/me",
        headers={"Authorization": f"Bearer {access_token}"} if access_token else {},
    )
    add(
        "SEC-05",
        "Fingerprint mismatch rejected",
        bool(access_token) and status2 == 401,
        f"token_present={bool(access_token)}, status={status2}",
    )

    # 6) Brute-force lockout on login (same email, wrong password repeatedly)
    victim_email = f"lock.{int(time.time())}.{rand_suffix()}@example.com"
    _ = anon.request(
        "POST",
        "/api/auth/register",
        {
            "email": victim_email,
            "password": password,
            "firstName": "Lock",
            "lastName": "Victim",
        },
    )

    statuses = []
    for _i in range(6):
        st, _, _ = anon.request(
            "POST",
            "/api/auth/login",
            {"email": victim_email, "password": "Wrong!Pass123"},
        )
        statuses.append(st)
    lockout_ok = 429 in statuses
    add(
        "SEC-06",
        "Brute-force protection triggers lockout",
        lockout_ok,
        f"statuses={statuses}",
    )

    # 7) Gateway auth/login route rate limiting (different emails to avoid per-account lockout)
    rl_statuses = []
    retry_after_seen = False
    for i in range(12):
        em = f"rl.{int(time.time())}.{i}.{rand_suffix(4)}@example.com"
        st, h, _ = anon.request(
            "POST",
            "/api/auth/login",
            {"email": em, "password": "Nope!123"},
        )
        rl_statuses.append(st)
        if st == 429 and "retry-after" in h:
            retry_after_seen = True
    rate_ok = 429 in rl_statuses
    add(
        "SEC-07",
        "Gateway rate-limit on /api/auth/login",
        rate_ok,
        f"statuses={rl_statuses}, retry_after_seen={retry_after_seen}",
    )

    # 8) CSRF defense-in-depth: reject unsafe cookie-auth request from untrusted Origin
    st_csrf, _, _ = session.request(
        "POST",
        "/api/auth/logout",
        headers={"Origin": "http://evil.local"},
    )
    add(
        "SEC-08",
        "Untrusted Origin blocked for unsafe cookie-auth request",
        st_csrf == 403,
        f"status={st_csrf}",
    )

    # 9) Logout invalidates session
    st_logout, _, _ = session.request("POST", "/api/auth/logout")
    st_me_after, _, _ = session.request("GET", "/api/auth/me")
    add(
        "SEC-09",
        "Logout invalidates authenticated session",
        st_logout == 200 and st_me_after == 401,
        f"logout_status={st_logout}, me_after={st_me_after}",
    )

    # 10) Logout-all revokes refresh tokens for other sessions/devices
    email3 = f"logoutall.{int(time.time())}.{rand_suffix()}@example.com"
    pwd3 = "Str0ng!Passw0rd#2026"

    s1 = HttpClient(base_url, user_agent="CloudVM-UA-C")
    s2 = HttpClient(base_url, user_agent="CloudVM-UA-D")

    s1.request(
        "POST",
        "/api/auth/register",
        {
            "email": email3,
            "password": pwd3,
            "firstName": "Sess",
            "lastName": "One",
        },
    )
    s2.request("POST", "/api/auth/login", {"email": email3, "password": pwd3})

    st_logout_all, _, _ = s1.request("POST", "/api/auth/logout-all")
    st_refresh_after, _, _ = s2.request("POST", "/api/auth/refresh", {})

    add(
        "SEC-10",
        "Logout-all revokes refresh tokens across sessions",
        st_logout_all == 200 and st_refresh_after == 401,
        f"logout_all={st_logout_all}, refresh_after={st_refresh_after}",
    )

    passed_count = sum(1 for r in results if r.passed)
    return results, passed_count


def print_report(results: list[TestResult], passed_count: int) -> None:
    total = len(results)
    print("\nCloudVM Security Smoke Report")
    print("=" * 34)
    for r in results:
        mark = "PASS" if r.passed else "FAIL"
        print(f"[{mark}] {r.id} - {r.description}")
        print(f"       {r.detail}")
    print("-" * 34)
    print(f"Summary: {passed_count}/{total} passed")


def main() -> int:
    parser = argparse.ArgumentParser(description="Run CloudVM security smoke tests")
    parser.add_argument(
        "--base-url",
        default="http://localhost:3001",
        help="Gateway base URL (default: http://localhost:3001)",
    )
    args = parser.parse_args()

    results, passed_count = run_tests(args.base_url)
    print_report(results, passed_count)

    return 0 if passed_count == len(results) else 1


if __name__ == "__main__":
    sys.exit(main())
