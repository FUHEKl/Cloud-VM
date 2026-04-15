# CloudVM Platform

CloudVM is a microservices-based platform for provisioning and managing virtual machines on OpenNebula with a modern web dashboard, role-based administration, secure authentication, and AI-assisted operations.

## 📌 Project Status

**Academic prototype (PFE)** — this repository is published for portfolio/review purposes and is not intended as a production-ready managed cloud service.

## ⚠️ Production Use Warning

This project is provided as an academic prototype. Before exposing it to the public internet or using it in production, additional hardening and operations controls are required (network isolation, secret management, least-privilege runtime policies, centralized monitoring, and formal security review).

## 🚀 Core Capabilities

- **User and admin authentication** (JWT + refresh tokens)
- **VM lifecycle management** (create, start, stop, restart, delete)
- **Quota and subscription enforcement**
- **SSH key management** per user
- **Web terminal access** for running VMs
- **Stripe billing flow** with webhook-based payment confirmation
- **AI assistant service** (provider routing, safety checks, action confirmation)
- **Event-driven orchestration** with NATS + Python worker

## 🧱 Architecture

- **Frontend:** Next.js + TypeScript + Tailwind (`frontend/`)
- **Gateway:** NestJS API gateway (`services/gateway/`)
- **Domain services:**
  - Auth (`services/auth/`)
  - User (`services/user/`)
  - VM (`services/vm/`)
  - Payment (`services/payment/`)
  - AI (`services/ai/`)
- **Worker:** Python OpenNebula orchestrator (`worker/`)
- **Infra:** PostgreSQL, Redis, NATS, Nginx

## 📁 Public Repository Scope

This public repository intentionally contains only production-relevant project code and infrastructure.

- Included: app and service source code, infra configs, OpenNebula setup scripts
- Excluded from tracking: internal handoff notes, TLS private keys/certs, generated SSH key artifacts, and report files

## 🛡️ Security Notes

- Never commit TLS keys/certs (`nginx/ssl/*.key`, `nginx/ssl/*.crt`)
- Never commit generated key materials (`derived_public_key.txt`, private SSH keys)
- Stripe payment confirmation is webhook-driven and idempotent
- VM creation enforces quota checks inside a DB transaction to prevent race-condition bypass

## ⚙️ Quick Start (Local)

### 1) Prerequisites

- Docker + Docker Compose
- Node.js 20+
- Python 3.11+ (for local worker development)

### 2) Configure environment

Create `.env` from `.env.example` and set required values (JWT secrets, DB credentials, Stripe keys if billing is enabled, OpenNebula credentials for worker).

### 3) Start stack

Use Docker Compose from the project root.

### 4) Access

- Frontend: `http://localhost:3000`
- Gateway API: `http://localhost:3001`

### 5) HTTPS for Web Terminal (Required)

The browser terminal uses secure WebSocket when the app runs over HTTPS. For local development, Nginx is exposed on:

- `https://localhost` (port 443)

At startup, Nginx auto-generates a local self-signed certificate if `nginx/ssl/server.crt` and `nginx/ssl/server.key` are missing.

If your browser warns about the certificate, trust/accept it for local development so terminal connections can proceed.

Notes:

- Do **not** commit generated TLS files.
- Keep `nginx/ssl/.gitkeep` only in version control.

## 💳 Billing Behavior

- Checkout sessions are created from fixed plan metadata.
- Payment status is updated by Stripe webhook events.
- Duplicate webhook events are ignored safely (idempotency table).
- User payment history reads from the local database (no per-load Stripe polling).

## 🤖 AI Service Overview

The AI service includes:

- Provider support for **Ollama** and **OpenRouter**
- Request-level abuse/risk protections (rate controls)
- Prompt/action safety checks
- VM action confirmation token flow before executing sensitive actions
- Real-time interaction support for assistant workflows

## 📜 License

This repository is released under an **All Rights Reserved** policy.

- See `LICENSE.md` for details.
- No permission is granted to copy, modify, distribute, or use this code outside explicit written authorization.

## 🤝 Contribution & Conduct

- Contribution policy: see `CONTRIBUTING.md` (currently read-only showcase).
- Community behavior expectations: see `CODE_OF_CONDUCT.md`.

## 🆘 Support

For usage questions and security reports, see `SUPPORT.md`.
