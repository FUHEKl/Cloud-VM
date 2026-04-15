# DB Isolation — Phased Rollout (Safe Path)

## Why phased

Current services still contain cross-domain reads/writes (e.g., `user` reads `virtual_machines` and `payments`, `payment` reads VM usage). A hard one-shot split to isolated DBs will break runtime flows.

This repository now includes **Phase-1 scaffolding**:

- `docker-compose.yml` supports service-specific `*_DATABASE_URL` env vars
- `scripts/postgres/init-microservice-databases.sql` creates:
  - `cloudvm_auth`
  - `cloudvm_user`
  - `cloudvm_vm`
  - `cloudvm_payment`
  - `cloudvm_ai`
- `.env.example` documents `AUTH_DATABASE_URL`, `USER_DATABASE_URL`, `VM_DATABASE_URL`, `PAYMENT_DATABASE_URL`, `AI_DATABASE_URL`

By default, services still fall back to shared `DATABASE_URL` for non-breaking behavior.

## Phase-2 requirements before flipping DB URLs

1. Remove cross-service DB coupling from code:
   - `user` must stop querying VM/payment tables directly
   - `payment` must stop querying VM tables directly
   - Replace with API/event-based projections

2. Define service ownership boundaries:
   - auth: `users`, `refresh_tokens`, `mfa_audit_logs`
   - user: `ssh_keys`, `user_quotas`, `notifications` (+ local profile projection)
   - vm: `virtual_machines` (+ local quota projection)
   - payment: `payments`, `stripe_webhook_events` (+ local quota projection)
   - ai: `ai_conversations`, `ai_messages`

3. Backfill / projection sync per service before cutover.

4. Flip one service at a time by setting its `*_DATABASE_URL` and validating:
   - migrations apply
   - health checks pass
   - integration tests pass

## Operational note

Postgres init scripts run only on first container init. If `pgdata` already exists, create DBs manually once:

```sql
CREATE DATABASE cloudvm_auth;
CREATE DATABASE cloudvm_user;
CREATE DATABASE cloudvm_vm;
CREATE DATABASE cloudvm_payment;
CREATE DATABASE cloudvm_ai;
```
