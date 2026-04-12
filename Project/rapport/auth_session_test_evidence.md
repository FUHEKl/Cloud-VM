# Auth & Session Management — Test Evidence (PFE)

Date: 2026-04-09  
Scope: Frontend auth/session behavior with Remember Me, logout navigation hardening, and protected-route reload policy.

| ID | Scenario | Steps | Expected Result | Observed Result | Status |
|---|---|---|---|---|---|
| AUTH-01 | Login without Remember Me | Open `/login` → keep **Remember me** unchecked → login with valid credentials | User accesses dashboard, but session is non-persistent | Session established with non-persistent cookies (`accessToken`, `refreshToken`, `rememberMe=0`) | ✅ Pass |
| AUTH-02 | Login with Remember Me | Open `/login` → check **Remember me** → login | Session persists across browser restarts/reloads | Persistent cookies written (`rememberMe=1` + token expirations) | ✅ Pass |
| AUTH-03 | Logout then browser Back | Login → go to dashboard → click **Sign Out** → browser Back | Protected pages must not reopen after logout | Redirect enforced to `/login`; protected UI blocked | ✅ Pass |
| AUTH-04 | Refresh token rotation preserves policy | Trigger a 401 flow (expired access token) while logged in | Access token refresh should keep same remember policy | Refresh rewrites cookies using current policy (`rememberMe` aware) | ✅ Pass |
| AUTH-05 | Home auto-redirect for remembered session | With `rememberMe=1` and valid token, open `http://localhost:3000` | User should be auto-routed to profile/dashboard | Redirect to `/dashboard/profile` executed | ✅ Pass |
| AUTH-06 | Project restart + reload with Remember Me OFF | Login with **Remember me unchecked** → restart stack → reload protected route or home | User should be signed out automatically | Reload policy clears auth cookies and sends user to `/login` | ✅ Pass |
| AUTH-07 | Protected route direct navigation unauthenticated | Open `/dashboard` without valid token | Access denied with redirect | Redirect to `/login` executed | ✅ Pass |

## Technical Controls Verified

- Centralized session cookie policy implemented in `frontend/src/lib/session.ts`.
- Login now explicitly captures remember-me choice in `frontend/src/app/(auth)/login/page.tsx`.
- Auth store token writes/clears standardized in `frontend/src/lib/auth.ts`.
- API refresh interceptor is remember-policy aware in `frontend/src/lib/api.ts`.
- Dashboard route guard hardening in `frontend/src/app/dashboard/layout.tsx`.
- Landing route redirect/cleanup gate in `frontend/src/components/auth/LandingRedirectGate.tsx` and `frontend/src/app/page.tsx`.

## Validation Summary

- `next lint`: passed.
- `next build`: passed.
- Type diagnostics for all changed auth/session files: no errors.

