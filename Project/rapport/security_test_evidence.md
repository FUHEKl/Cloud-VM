# Security Layers — Smoke Test Evidence (PFE)

Date: 2026-04-12  
Scope: Automated validation of implemented security layers using `scripts/security_smoke_test.py` against Dockerized localhost stack.

## Execution Context

- Stack: Docker Compose (`frontend`, `gateway`, `auth`, `user`, `vm`, `ai`, `redis`, `postgres`, `nats`)
- Command used:
  - `docker compose exec -T redis redis-cli FLUSHALL`
  - `python scripts/security_smoke_test.py`
- Reason for Redis reset: clear lockout/rate-limit counters from previous runs to avoid false negatives.

## Results Summary

| ID | Scenario | Expected Result | Observed Result | Status |
|---|---|---|---|---|
| SEC-01 | Gateway health + baseline security headers | `200` and headers present (`X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`) | `status=200`, `frame=True`, `nosniff=True`, `referrer=True` | ✅ Pass |
| SEC-02 | Auth cookies hardened at registration | Response sets auth cookies with `HttpOnly`, `SameSite=Strict`, and both auth cookies present | `status=201`, `cookie_flags_ok=True`, `has_access_cookie=True`, `has_refresh_cookie=True` | ✅ Pass |
| SEC-03 | Authenticated profile access | `/api/auth/me` succeeds with valid session | `status=200` | ✅ Pass |
| SEC-04 | DTO strictness / unknown field rejection | Extra field must be rejected (`400`) | `status=400`, message includes `property unexpectedField should not exist` | ✅ Pass |
| SEC-05 | Fingerprint replay protection | Token replay with different user-agent should be rejected | `status=401`, `token_present=True` | ✅ Pass |
| SEC-06 | Brute-force lockout | Repeated failed login attempts trigger lockout (`429`) | statuses: `[401, 401, 401, 401, 429, 429]` | ✅ Pass |
| SEC-07 | Gateway rate limiting on auth login | Burst login attempts eventually return `429` and include `Retry-After` | statuses include many `429`, `retry_after_seen=True` | ✅ Pass |
| SEC-08 | Logout session invalidation | After logout, session must not access `/api/auth/me` | `logout_status=200`, `me_after=401` | ✅ Pass |

## Final Verdict

- **Passed:** 8/8
- **Failed:** 0/8
- **Conclusion:** Implemented security layers covered by this smoke suite are functioning correctly in the current localhost Docker environment.

## Notes / Limitations

- This is a smoke-level automated suite (fast verification), not a full penetration test.
- WS abuse tests and malformed NATS payload tests should be run as separate targeted suites for deeper coverage.
- Rate-limit tests are stateful by design; run after clearing Redis counters or with controlled delays for reproducibility.
