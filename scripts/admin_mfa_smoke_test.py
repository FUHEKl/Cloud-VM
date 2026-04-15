#!/usr/bin/env python3
"""Admin MFA smoke test.

Flow:
1) Register a user
2) Promote user to ADMIN in Postgres
3) Login and assert mfaRequired
4) Verify first MFA challenge (devOtp, provided code, or interactive prompt)
5) Assert /auth/me is authenticated
6) Setup TOTP, enable it, then validate TOTP login path
7) Disable MFA and ensure lifecycle endpoints work
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import hmac
import http.cookiejar
import json
import struct
import subprocess
import time
import urllib.error
import urllib.request


def call(opener, url: str, method: str = "GET", body: dict | None = None, timeout: int = 25):
    data = None
    headers = {}
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        headers["Content-Type"] = "application/json"

    req = urllib.request.Request(url=url, data=data, method=method, headers=headers)
    try:
        with opener.open(req, timeout=timeout) as resp:
            payload = resp.read().decode("utf-8")
            return resp.status, payload
    except urllib.error.HTTPError as exc:
        payload = exc.read().decode("utf-8", errors="ignore")
        return exc.code, payload
    except urllib.error.URLError as exc:
        reason = getattr(exc, "reason", exc)
        return 0, f"NETWORK_ERROR: {reason}"


def totp_code(secret: str, for_unix_time: int | None = None) -> str:
    now = int(time.time() if for_unix_time is None else for_unix_time)
    counter = now // 30
    key = base64.b32decode(secret, casefold=True)
    msg = struct.pack(">Q", counter)
    digest = hmac.new(key, msg, hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    binary = (
        ((digest[offset] & 0x7F) << 24)
        | ((digest[offset + 1] & 0xFF) << 16)
        | ((digest[offset + 2] & 0xFF) << 8)
        | (digest[offset + 3] & 0xFF)
    )
    return str(binary % 1_000_000).zfill(6)


def resolve_initial_mfa_code(login_json: dict, *, provided_code: str | None, non_interactive: bool) -> str | None:
    dev_otp = login_json.get("devOtp")
    if isinstance(dev_otp, str) and dev_otp.strip():
        return dev_otp.strip()

    if provided_code and provided_code.strip():
        return provided_code.strip()

    if non_interactive:
        return None

    challenge_id = login_json.get("challengeId")
    prompt = (
        "Enter MFA code for initial admin login"
        f" (challengeId={challenge_id}): "
    )
    entered = input(prompt).strip()
    return entered or None


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default="http://localhost:3001/api")
    parser.add_argument(
        "--initial-mfa-code",
        default="",
        help="Code for the first admin MFA challenge when devOtp is unavailable (production-like mode).",
    )
    parser.add_argument(
        "--non-interactive",
        action="store_true",
        help="Fail instead of prompting for MFA input when devOtp is unavailable.",
    )
    args = parser.parse_args()

    auth_base = f"{args.base_url.rstrip('/')}/auth"
    ts = int(time.time())
    email = f"adminmfa.{ts}@example.com"
    password = "Str0ng!Passw0rd#2026"

    jar = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))

    reg_status, _ = call(
        opener,
        f"{auth_base}/register",
        "POST",
        {
            "email": email,
            "password": password,
            "firstName": "Admin",
            "lastName": "Mfa",
        },
    )

    if reg_status == 0:
        print("[FAIL] Unable to reach API. Ensure gateway is running and --base-url is correct.")
        return 1

    if reg_status not in (200, 201):
        print(f"[FAIL] Register failed: {reg_status}")
        return 1

    sql = f"UPDATE users SET role='ADMIN' WHERE email='{email}';"
    subprocess.run(
        [
            "docker",
            "compose",
            "exec",
            "-T",
            "postgres",
            "psql",
            "-U",
            "cloudvm",
            "-d",
            "cloudvm",
            "-c",
            sql,
        ],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

    login_status, login_body = call(
        opener,
        f"{auth_base}/login",
        "POST",
        {
            "email": email,
            "password": password,
            "rememberMe": True,
        },
    )

    try:
        login_json = json.loads(login_body or "{}")
    except json.JSONDecodeError:
        login_json = {}

    print(f"REGISTER_STATUS={reg_status}")
    print(f"LOGIN_STATUS={login_status}")
    print(f"MFA_REQUIRED={login_json.get('mfaRequired')}")
    print(f"CHALLENGE_ID={login_json.get('challengeId')}")
    print(f"DEV_OTP_PRESENT={bool(login_json.get('devOtp'))}")

    if login_status != 200 or not login_json.get("mfaRequired"):
        print("[FAIL] Expected admin login to require MFA")
        return 1

    initial_mfa_code = resolve_initial_mfa_code(
        login_json,
        provided_code=args.initial_mfa_code,
        non_interactive=args.non_interactive,
    )
    if not initial_mfa_code:
        print(
            "[FAIL] No code available for initial MFA verification. "
            "Use --initial-mfa-code or run interactively to input the challenge code."
        )
        return 1

    verify_status, _ = call(
        opener,
        f"{auth_base}/mfa/verify",
        "POST",
        {
            "challengeId": login_json.get("challengeId"),
            "code": initial_mfa_code,
        },
    )

    me_status, _ = call(opener, f"{auth_base}/me", "GET")

    print(f"MFA_VERIFY_STATUS={verify_status}")
    print(f"ME_AFTER_MFA={me_status}")

    if verify_status != 200 or me_status != 200:
        print("[FAIL] MFA verification flow failed")
        return 1

    setup_status, setup_body = call(
        opener,
        f"{auth_base}/mfa/setup",
        "POST",
        {"password": password},
    )
    try:
        setup_json = json.loads(setup_body or "{}")
    except json.JSONDecodeError:
        setup_json = {}

    setup_secret = setup_json.get("secret")
    print(f"MFA_SETUP_STATUS={setup_status}")
    print(f"MFA_SETUP_SECRET_PRESENT={bool(setup_secret)}")

    if setup_status != 200 or not setup_secret:
        print("[FAIL] MFA setup endpoint failed")
        return 1

    enable_code = totp_code(setup_secret)
    enable_status, _ = call(
        opener,
        f"{auth_base}/mfa/enable",
        "POST",
        {"code": enable_code},
    )
    print(f"MFA_ENABLE_STATUS={enable_status}")

    if enable_status != 200:
        print("[FAIL] MFA enable endpoint failed")
        return 1

    call(opener, f"{auth_base}/logout", "POST", {})

    login2_status, login2_body = call(
        opener,
        f"{auth_base}/login",
        "POST",
        {
            "email": email,
            "password": password,
            "rememberMe": True,
        },
    )
    try:
        login2_json = json.loads(login2_body or "{}")
    except json.JSONDecodeError:
        login2_json = {}

    print(f"LOGIN2_STATUS={login2_status}")
    print(f"LOGIN2_MFA_REQUIRED={login2_json.get('mfaRequired')}")
    print(f"LOGIN2_DEV_OTP_PRESENT={bool(login2_json.get('devOtp'))}")

    if login2_status != 200 or not login2_json.get("mfaRequired"):
        print("[FAIL] Second login did not require MFA")
        return 1

    verify2_status, _ = call(
        opener,
        f"{auth_base}/mfa/verify",
        "POST",
        {
            "challengeId": login2_json.get("challengeId"),
            "code": totp_code(setup_secret),
        },
    )

    me2_status, _ = call(opener, f"{auth_base}/me", "GET")
    print(f"MFA_VERIFY2_STATUS={verify2_status}")
    print(f"ME_AFTER_MFA2={me2_status}")

    if verify2_status != 200 or me2_status != 200:
        print("[FAIL] TOTP login verification failed")
        return 1

    disable_status, _ = call(
        opener,
        f"{auth_base}/mfa/disable",
        "POST",
        {"password": password},
    )
    print(f"MFA_DISABLE_STATUS={disable_status}")
    if disable_status != 200:
        print("[FAIL] MFA disable endpoint failed")
        return 1

    print("[PASS] Admin MFA + TOTP lifecycle validated")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
