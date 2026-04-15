# CloudVM Security Architecture

Last updated: 2026-04-12

This document describes the security controls implemented across CloudVM, mapped to OWASP Top 10, with verification and operations guidance.

---

## Security Contact / Vulnerability Reporting

If you discover a security issue, please report it privately:

- Email: `brahmi.mouhamedrayen@hotmail.com`
- Discord: `fuheki`

Please include:
- affected component/service,
- reproduction steps,
- impact summary,
- any suggested mitigation.

Do not open public issues for unpatched security vulnerabilities.

---

## Layer 1 — Authentication & Token Security

### 1.1 Access token fingerprinting

Implemented:
- Access token now includes `fp` claim (SHA-256 fingerprint of `client-ip|user-agent`).
- Fingerprint computed at token issuance in `services/auth/src/auth/auth.service.ts`.
- Fingerprint validated on every JWT-protected request in:
  - `services/auth/src/auth/strategies/jwt.strategy.ts`
  - `services/user/src/common/strategies/jwt.strategy.ts`
  - `services/vm/src/common/strategies/jwt.strategy.ts`
  - `services/ai/src/common/strategies/jwt.strategy.ts`
- WebSocket fingerprint validation added in:
  - `services/vm/src/terminal/terminal.gateway.ts`
  - `services/vm/src/vm/vm-events.gateway.ts`
  - `services/ai/src/ai/ai-chat.gateway.ts`

Why:
- Reduces token replay risk when access token is stolen and replayed from a different client context.

OWASP:
- A07: Identification and Authentication Failures
- A01: Broken Access Control

---

### 1.2 Refresh token rotation + reuse detection

Implemented:
- Refresh token is now signed JWT with `sub`, `jti`, and `type=refresh`.
- On refresh:
  - old token DB record deleted,
  - old token `jti` marked as used in Redis,
  - new token pair issued.
- Reuse detection:
  - if used refresh token appears again, all refresh tokens for that user are revoked immediately.
- Implemented in `services/auth/src/auth/auth.service.ts`.

Why:
- Detects refresh token theft and limits long-lived session hijack impact.

OWASP:
- A07: Identification and Authentication Failures

---

### 1.3 Brute-force protection on login

Implemented:
- Redis-backed failed-login tracking per email.
- Threshold: 5 failures in 15 minutes (configurable).
- Lockout response: HTTP 429 with retry guidance.
- Security event logging for failures and lockouts.
- Implemented in `services/auth/src/auth/auth.service.ts`.

Env vars:
- `AUTH_LOCK_MAX_ATTEMPTS`
- `AUTH_LOCK_WINDOW_MINUTES`
- `AUTH_LOCK_PROGRESSIVE_MULTIPLIER`
- `AUTH_LOCK_MAX_MINUTES`

OWASP:
- A07: Identification and Authentication Failures
- A04: Insecure Design

---

### 1.6 Optional CAPTCHA challenge hook (adaptive)

Implemented:
- Added adaptive CAPTCHA hook in auth login path.
- CAPTCHA is only evaluated when enabled and failed-attempt threshold is reached.
- Safe default is non-breaking (`AUTH_CAPTCHA_ENABLED=false`).
- Optional shared-secret verification mode for environments without third-party CAPTCHA provider integration.
- Security events logged for required/missing/invalid/passed CAPTCHA states.

Env vars:
- `AUTH_CAPTCHA_ENABLED`
- `AUTH_CAPTCHA_FAIL_THRESHOLD`
- `AUTH_CAPTCHA_SHARED_SECRET`

Why:
- Adds friction during probable credential-stuffing bursts while preserving smooth UX in normal conditions.

OWASP:
- A07: Identification and Authentication Failures
- A04: Insecure Design

---

### 1.4 Secure cookie flags

Implemented:
- Auth service now sets auth cookies with:
  - `HttpOnly: true`
  - `Secure: true`
  - `SameSite: Strict`
  - proper max-age according to remember-me policy.
- Implemented in `services/auth/src/auth/auth.controller.ts`.
- Frontend switched to server-managed auth cookies (no JS token cookie writes):
  - `frontend/src/lib/auth.ts`
  - `frontend/src/lib/api.ts`
  - `frontend/src/lib/session.ts`

OWASP:
- A07: Identification and Authentication Failures
- A05: Security Misconfiguration

---

### 1.5 JWT secret strength validation

Implemented:
- Startup validation rejects weak/default JWT secrets (<64 chars or placeholder values).
- Implemented in:
  - `services/auth/src/common/security/startup-security.util.ts`
  - called from `services/auth/src/main.ts`.

OWASP:
- A05: Security Misconfiguration
- A02: Cryptographic Failures

---

## Layer 2 — Authorization & Access Control

### 2.1 Resource ownership enforcement

Implemented:
- VM ownership checks enforced before read/action/delete in VM service.
- Non-admin users are denied with 403 when `vm.userId !== req.user.id`.
- Terminal websocket also validates VM ownership before SSH session open.
- Implemented in:
  - `services/vm/src/vm/vm.service.ts`
  - `services/vm/src/terminal/terminal.gateway.ts`

OWASP:
- A01: Broken Access Control

---

### 2.2 Quota enforcement before VM creation

Implemented:
- VM create checks quota and current aggregate usage before publishing `vm.create`.
- Exceeded limits now return 403 with clear reasons.
- Implemented in `services/vm/src/vm/vm.service.ts`.

OWASP:
- A01: Broken Access Control
- A04: Insecure Design

---

### 2.3 Admin route double-check

Implemented:
- Admin endpoints continue to use JWT + `RolesGuard`.
- Added explicit service-level admin assertions in controller methods (defense in depth), including `DELETE /users/:id`.
- Implemented in `services/user/src/user/user.controller.ts`.

OWASP:
- A01: Broken Access Control

---

## Layer 3 — API & Input Security

### 3.1 Global validation + strict DTOs

Implemented:
- Global `ValidationPipe` already active in all NestJS services with:
  - `whitelist: true`
  - `forbidNonWhitelisted: true`
  - `transform: true`
- Hardened DTO constraints for:
  - password complexity
  - names (length + no HTML tags)
  - VM names (alphanumeric + dash, max length)
  - SSH key format and length
- Updated files include:
  - `services/auth/src/auth/dto/*.ts`
  - `services/user/src/user/dto/*.ts`
  - `services/user/src/ssh-key/dto/create-ssh-key.dto.ts`
  - `services/vm/src/vm/dto/create-vm.dto.ts`
  - `services/vm/src/plan/dto/create-plan.dto.ts`

OWASP:
- A03: Injection
- A04: Insecure Design

---

### 3.2 Request size limits

Implemented:
- Nginx:
  - `/api/auth/*` limited to `1m`
  - all other `/api/*` limited to `512k`
  - in `nginx/conf.d/default.conf`
- Nest services explicit body limits in `main.ts`:
  - auth `1mb`
  - gateway/user/vm/ai `512kb`

OWASP:
- A04: Insecure Design
- A05: Security Misconfiguration

---

### 3.3 Global rate limiting with Redis at gateway

Implemented:
- Added `@nestjs/throttler` in gateway with Redis-backed storage (`RedisThrottlerStorage`).
- Added Redis middleware enforcement with explicit policies and `Retry-After`:
  - default: 60 req/min per IP
  - `POST /api/auth/login`: 10/min
  - `POST /api/auth/register`: 5/min
  - `POST /api/ai/chat`: 20/min
- Files:
  - `services/gateway/src/app.module.ts`
  - `services/gateway/src/security/redis-throttler.storage.ts`
  - `services/gateway/src/security/redis-rate-limit.middleware.ts`
  - `services/gateway/src/proxy/proxy.module.ts`

OWASP:
- A04: Insecure Design
- A05: Security Misconfiguration

---

### 3.4 SQL injection prevention audit

Audit result:
- No unsafe Prisma raw SQL calls (`$queryRaw` / `$executeRaw`) used in service code.
- Security audit comments added to Prisma services:
  - auth/user/vm/ai `src/prisma/prisma.service.ts`

OWASP:
- A03: Injection

---

### 3.5 Security HTTP headers

Implemented (gateway + all services):
- Helmet configured with:
  - CSP `default-src 'self'`
  - frameguard deny (`X-Frame-Options: DENY`)
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: no-referrer`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()` set explicitly.
- `X-Powered-By` disabled.

Files:
- `services/*/src/main.ts`

OWASP:
- A05: Security Misconfiguration

---

## Layer 4 — WebSocket & Terminal Security

### 4.1 WebSocket auth on connection

Implemented:
- WebSocket connection is rejected if JWT missing/invalid.
- Token accepted from handshake auth/header/cookie.
- Fingerprint check enforced in websocket auth path.
- Namespaces:
  - terminal
  - vm-events
  - ai-chat

OWASP:
- A01, A07

---

### 4.2 Terminal ownership check

Implemented:
- `connect-ssh` verifies VM exists and user owns VM (admin bypass).
- Implemented in `services/vm/src/terminal/terminal.gateway.ts`.

OWASP:
- A01: Broken Access Control

---

### 4.3 Terminal input sanitization

Implemented:
- Best-effort blocklist for high-risk command patterns:
  - `rm -rf /`
  - `dd if=/dev/zero`
  - common fork bomb signature
- Logs warning and blocks event.
- Disconnects after repeated violations.

Important limitation:
- This is heuristic detection, not full command sandboxing.
- Strong isolation should also enforce restricted VM users, minimal sudo, and host-level policy controls.

OWASP:
- A04: Insecure Design
- A09: Security Logging and Monitoring Failures (improved detection)

---

### 4.4 WebSocket rate limiting

Implemented:
- Terminal input events: max 100 events/second per socket.
- AI chat websocket messages: max 2 events/second per socket.
- Excess => warning + disconnect.

Files:
- `services/vm/src/terminal/terminal.gateway.ts`
- `services/ai/src/ai/ai-chat.gateway.ts`

OWASP:
- A04: Insecure Design

---

## Layer 5 — Worker & Infrastructure Security

### 5.1 NATS message validation

Implemented:
- Worker validates message shape/types for:
  - `vm.create`
  - `vm.action`
  - `vm.delete`
- Invalid payloads are rejected and logged without crashing worker.
- Implemented in `worker/main.py`.

OWASP:
- A04: Insecure Design
- A08: Software and Data Integrity Failures

---

### 5.2 OpenNebula credential isolation

Implemented:
- Explicit docker-compose comment documenting least-privilege scope:
  - `ONE_USERNAME` / `ONE_PASSWORD` only provided to worker.
- `docker-compose.yml` updated near worker service.

OWASP:
- A05: Security Misconfiguration

---

### 5.3 SSH key injection hardening

Implemented:
- Worker now sanitizes SSH keys before template injection:
  - strip whitespace/newlines
  - enforce allowed prefixes (`ssh-rsa`, `ssh-ed25519`, `ecdsa-sha2-nistp256`)
  - max length 4096
  - deduplicate
- Implemented in `worker/vm_handler.py`.

OWASP:
- A03: Injection
- A04: Insecure Design

---

### 5.4 Secrets never in logs

Implemented:
- Removed raw key-content logging in worker.
- Structured security logs avoid token/password/key dumps.
- Redacted behavior in worker message logs and security event logs.

OWASP:
- A09: Security Logging and Monitoring Failures
- A02: Cryptographic Failures

---

## Layer 6 — AI Service Security

### 6.1 Action confirmation token verification

Implemented:
- `POST /ai/actions/confirm` verifies signed confirmation token using `AI_ACTION_CONFIRM_SECRET`.
- Rejects invalid/expired tokens.
- Enforces subject-user match.
- Logs confirmation security event.

Files:
- `services/ai/src/ai/ai.service.ts`

OWASP:
- A01: Broken Access Control
- A07: Identification and Authentication Failures

---

### 6.2 Prompt injection detection

Implemented:
- Detects high-risk instruction-overwrite phrases.
- Logs warning event.
- Adds system-level warning note to model context when detected.

Important limitation:
- Detection is heuristic and cannot fully prevent prompt injection in LLM systems.

OWASP:
- A04: Insecure Design

---

### 6.3 AI structured action output validation

Implemented:
- Validates structured action fields before use:
  - `vmId` must be UUID
  - action must be in allowed set
  - userId must match authenticated user
- Applied before confirm execution and pending-action return path.

File:
- `services/ai/src/ai/ai.service.ts`

OWASP:
- A01: Broken Access Control
- A04: Insecure Design

---

## Layer 7 — Structured Security Audit Logging

Implemented events include:
- Auth:
  - login success/failure
  - token refresh success/reuse detection
  - logout
  - account lockout
- VM:
  - queued create/start/stop/restart/delete actions
  - permission denied
- Gateway:
  - rate-limit hits (429)
- WebSocket:
  - auth failures for terminal/vm-events/ai-chat
- AI:
  - action confirmations
  - prompt injection warning

Format includes:
- timestamp
- event type
- userId when available
- IP where available
- result

No secrets are intentionally logged.

---

## Secret Rotation Guide

### JWT / refresh secrets
1. Generate new strong secrets (>=64 chars random).
2. Update `.env` values:
   - `JWT_SECRET`
   - `JWT_REFRESH_SECRET`
3. Restart auth, gateway, user, vm, ai services.
4. Invalidate active sessions if required (clear refresh token table).

### AI confirmation secret
1. Rotate `AI_ACTION_CONFIRM_SECRET`.
2. Restart AI service.
3. Existing confirmation tokens become invalid (expected).

### OpenNebula credentials
1. Rotate `ONE_USERNAME`/`ONE_PASSWORD` in OpenNebula.
2. Update worker env only.
3. Restart worker.
4. Verify VM operations continue.

### OpenRouter/API keys
1. Rotate `OPENROUTER_API_KEY`.
2. Update AI service env.
3. Restart AI service.

---

## Verification Checklist

### Authentication
- [ ] Login returns secure Set-Cookie headers (`HttpOnly`, `Secure`, `SameSite=Strict`).
- [ ] Replayed refresh token triggers full-session revocation.
- [ ] 5 failed logins in 15min returns 429 lockout.
- [ ] Token replay from changed client fingerprint returns 401.

### Authorization
- [ ] User A cannot manage User B VM (403).
- [ ] VM create blocked when quota exceeded (403).
- [ ] Admin-only user routes deny non-admin (403).

### API security
- [ ] Unknown DTO fields rejected.
- [ ] Oversized payloads rejected at nginx/service levels.
- [ ] Gateway returns 429 + `Retry-After` under abuse.
- [ ] Helmet/security headers present.

### WebSockets
- [ ] Terminal/vm-events/ai-chat reject unauthenticated sockets.
- [ ] Terminal ownership checks enforced.
- [ ] Terminal dangerous command patterns are blocked and violations logged.
- [ ] WS rate limits disconnect abusive clients.

### Worker/infra
- [ ] Malformed NATS messages are rejected safely.
- [ ] Invalid SSH keys are rejected before injection.
- [ ] Worker logs do not expose keys/secrets.

### AI security
- [ ] Invalid confirmation tokens rejected.
- [ ] Prompt-injection warnings appear in logs.
- [ ] Invalid structured action payloads rejected.

---

## Known Limitations / Accepted Risks

1. Fingerprinting uses IP + User-Agent:
   - NAT/proxy changes or mobile network churn can invalidate sessions.
2. Terminal command blocklist is best-effort only:
   - not a substitute for OS-level sandboxing and least-privilege SSH accounts.
3. Prompt injection controls are detection/mitigation, not full prevention.
4. Some legacy TypeScript deprecation warnings may still appear in IDE diagnostics (project-level config), but service builds pass.

---

## Extra recommended security layers (next phase)

1. CSRF token protection for state-changing HTTP requests.
2. mTLS between internal services.
3. Redis AUTH/TLS and network segmentation for cache/message plane.
4. WAF rules at edge and anomaly detection.
5. SAST + dependency scanning in CI.
6. Signed, immutable audit log sink (SIEM).
7. Runtime container hardening:
   - read-only root FS,
   - non-root users,
   - seccomp/AppArmor profiles.
