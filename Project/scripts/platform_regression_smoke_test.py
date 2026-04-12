#!/usr/bin/env python3
"""CloudVM platform regression smoke test.

Non-destructive checks for core platform flows:
- registration and authenticated session restore
- SSH key CRUD
- VM read APIs (templates, list, stats)
- terminal API and socket route reachability

This script intentionally avoids VM create/action/delete operations.
"""

from __future__ import annotations

import argparse
import json
import random
import string
import sys
import time
import urllib.error
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
    def __init__(self, base_url: str, user_agent: str = "CloudVM-Platform-Smoke/1.0"):
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
                return (
                    resp.getcode(),
                    {k.lower(): v for k, v in resp.headers.items()},
                    resp.read().decode("utf-8", errors="replace"),
                )
        except urllib.error.HTTPError as e:
            return (
                e.code,
                {k.lower(): v for k, v in e.headers.items()},
                e.read().decode("utf-8", errors="replace"),
            )


class RawHttpClient(HttpClient):
    def __init__(self, base_url: str, user_agent: str = "CloudVM-Platform-Smoke/1.0"):
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


def register_with_retry(client: HttpClient, email: str, password: str) -> Tuple[int, Dict[str, str], str]:
    for _ in range(3):
        status, headers, body = client.request(
            "POST",
            "/api/auth/register",
            {
                "email": email,
                "password": password,
                "firstName": "Regression",
                "lastName": "Runner",
            },
        )
        if status != 429:
            return status, headers, body
        time.sleep(1)
    return status, headers, body


def run_tests(base_url: str) -> Tuple[list[TestResult], int]:
    results: list[TestResult] = []

    def add(test_id: str, description: str, passed: bool, detail: str) -> None:
        results.append(TestResult(test_id, description, passed, detail))

    session = HttpClient(base_url, user_agent="CloudVM-Platform-UA-A")
    anon = RawHttpClient(base_url, user_agent="CloudVM-Platform-UA-B")

    email = f"platform.{int(time.time())}.{rand_suffix()}@example.com"
    password = "Str0ng!Passw0rd#2026"

    # REG-01 registration and authenticated profile
    st_register, _, _ = register_with_retry(session, email, password)
    st_me, _, _ = session.request("GET", "/api/auth/me")
    add(
        "REG-01",
        "Register and authenticated /auth/me",
        st_register in (200, 201) and st_me == 200,
        f"register={st_register}, me={st_me}",
    )

    # REG-02 SSH key CRUD
    key_name = f"regress-key-{rand_suffix(4)}"
    key_value = "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQDc6vRegressionOnlyKey cloudvm@local"
    st_key_create, _, key_body = session.request(
        "POST",
        "/api/ssh-keys",
        {"name": key_name, "publicKey": key_value},
    )
    key_json = parse_json(key_body)
    key_id = key_json.get("id")

    st_key_list, _, key_list_body = session.request("GET", "/api/ssh-keys")
    key_list = parse_json(key_list_body)
    if isinstance(key_list, list):
        keys = key_list
    elif isinstance(key_list, dict):
        items = key_list.get("items")
        keys = items if isinstance(items, list) else []
    else:
        keys = []
    listed = any(isinstance(item, dict) and item.get("id") == key_id for item in keys) if key_id else False

    st_key_delete = 0
    if key_id:
        st_key_delete, _, _ = session.request("DELETE", f"/api/ssh-keys/{key_id}")

    add(
        "REG-02",
        "SSH key create/list/delete",
        st_key_create in (200, 201) and st_key_list == 200 and listed and st_key_delete == 200,
        (
            f"create={st_key_create}, list={st_key_list}, listed={listed}, "
            f"delete={st_key_delete if key_id else 'skipped'}"
        ),
    )

    # REG-03 VM read endpoints
    st_templates, _, _ = session.request("GET", "/api/vms/templates")
    st_vms, _, _ = session.request("GET", "/api/vms")
    st_stats, _, _ = session.request("GET", "/api/vms/stats")
    add(
        "REG-03",
        "VM read APIs (templates/list/stats)",
        st_templates == 200 and st_vms == 200 and st_stats == 200,
        f"templates={st_templates}, list={st_vms}, stats={st_stats}",
    )

    # REG-04 terminal auth/routing checks (non-destructive)
    st_metrics_user, _, _ = session.request("GET", "/api/terminal/metrics")
    st_socket, _, _ = anon.request(
        "GET",
        f"/terminal/socket.io/?EIO=4&transport=polling&t={int(time.time() * 1000)}",
    )
    add(
        "REG-04",
        "Terminal metrics auth and socket route availability",
        st_metrics_user == 403 and st_socket == 200,
        f"metrics_non_admin={st_metrics_user}, socket_route={st_socket}",
    )

    passed_count = sum(1 for r in results if r.passed)
    return results, passed_count


def print_report(results: list[TestResult], passed_count: int) -> None:
    total = len(results)
    print("\nCloudVM Platform Regression Report")
    print("=" * 34)
    for r in results:
        mark = "PASS" if r.passed else "FAIL"
        print(f"[{mark}] {r.id} - {r.description}")
        print(f"       {r.detail}")
    print("-" * 34)
    print(f"Summary: {passed_count}/{total} passed")


def main() -> int:
    parser = argparse.ArgumentParser(description="Run CloudVM platform regression smoke tests")
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
