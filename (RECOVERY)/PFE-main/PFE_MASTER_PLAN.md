# PFE Master Plan — CloudVM Platform (Readdly Startup)

## ISET Mahdia — Final Year Project 2025–2026

**Project Name:** CloudVM — Cloud Virtual Machine Management Platform  
**Startup:** Readdly  
**Duration:** 8 Weeks (2 Months)  
**Methodology:** Agile / Scrum  
**Sprint Duration:** 1 week each (8 sprints total)

---

## 1. PROJECT OVERVIEW

### 1.1 Description

CloudVM is a web-based platform that allows users to create, manage, and monitor virtual machines on-demand — similar to Azure or AWS. The platform integrates OpenNebula for VM orchestration on the server side, with a modern web interface built using Next.js and NestJS, and a Python-based worker for asynchronous VM operations.

**VM Access — Two-Phase Approach:**

- **Phase 1 (v1 — Delivered):** Users access their VMs through a **web-based CLI terminal** (xterm.js + WebSocket SSH proxy). The user sees a command-line interface in the browser — like PuTTY/SSH but embedded in the web UI. Users manage SSH keys from their profile.
- **Phase 2 (v2 — Future Upgrade):** Full **graphical desktop streaming** via VNC/noVNC. Users will see the complete OS desktop (Windows/Linux GUI) streamed live in the browser, like a remote desktop experience.

### 1.2 Architecture

- **Architecture Style:** Microservices
- **Frontend:** Next.js 14+ (App Router) + Tailwind CSS
- **Backend (API Gateway + Services):** NestJS (TypeScript)
- **Worker:** Python + Redis + NATS JetStream
- **Server/Infra:** Ubuntu Server + OpenNebula + Firewall (iptables/nftables)
- **Containerization:** Docker & Docker Compose
- **Message Broker:** NATS JetStream
- **Cache/Queue:** Redis
- **Database:** PostgreSQL
- **Authentication:** JWT + Refresh Tokens

### 1.3 Team Roles

| Role            | Specialization          | Responsibilities                                                         |
| --------------- | ----------------------- | ------------------------------------------------------------------------ |
| **DSI Student** | Development (Web)       | Frontend, Backend, Worker, Docker, Database, API                         |
| **RSI Student** | Networks/Infrastructure | Ubuntu Server, OpenNebula, Firewall, Network Security, Server Deployment |

---

## 2. USER ROLES & PERMISSIONS

### 2.1 Visitor (Default — No Login)

- View landing page
- View pricing/offers
- Register / Login

### 2.2 Normal User (Authenticated)

- Create VM (within quota)
- Start / Stop / Reboot / Delete VM
- View VM dashboard (status, IP, resources)
- **Access VM via web terminal (CLI console — Phase 1)**
- **Manage SSH keys (add, delete)**
- View quota usage
- Upgrade plan (payment)
- Manage profile

### 2.3 Admin

- Manage users (CRUD)
- Manage VMs (CRUD + force actions)
- View all VMs across the platform
- Manage pricing plans
- View platform analytics/dashboard
- Manage quotas

---

## 3. MICROSERVICES BREAKDOWN

| #   | Service                  | Tech                | Description                                                         |
| --- | ------------------------ | ------------------- | ------------------------------------------------------------------- |
| 1   | **API Gateway**          | NestJS              | Routes requests, auth middleware, rate limiting                     |
| 2   | **Auth Service**         | NestJS              | Registration, login, JWT, refresh tokens, roles                     |
| 3   | **User Service**         | NestJS              | User CRUD, profile management                                       |
| 4   | **VM Service**           | NestJS              | VM CRUD operations, status tracking                                 |
| 5   | **Payment Service**      | NestJS              | Plans, quotas, payment processing (mock/Stripe)                     |
| 6   | **Worker Service**       | Python              | Async VM operations via JetStream, communicates with OpenNebula API |
| 7   | **Notification Service** | NestJS              | Email/in-app notifications (optional)                               |
| 8   | **OpenNebula Server**    | Ubuntu + OpenNebula | VM hypervisor orchestration                                         |
| 9   | **Firewall/Security**    | iptables/nftables   | Server-side network security                                        |

---

## 4. PRODUCT BACKLOG (USER STORIES)

### Epic 1: Authentication & User Management

| ID    | User Story                                                                           | Priority | Sprint   |
| ----- | ------------------------------------------------------------------------------------ | -------- | -------- |
| US-01 | As a visitor, I want to register an account so that I can access the platform        | High     | Sprint 2 |
| US-02 | As a visitor, I want to log in with my credentials so that I can access my dashboard | High     | Sprint 2 |
| US-03 | As a user, I want to log out securely so that my session is terminated               | High     | Sprint 2 |
| US-04 | As a user, I want to reset my password so that I can recover my account              | Medium   | Sprint 2 |
| US-05 | As an admin, I want to view all users so that I can manage the platform              | High     | Sprint 3 |
| US-06 | As an admin, I want to delete/ban a user so that I can moderate the platform         | High     | Sprint 3 |
| US-07 | As a user, I want to update my profile so that my information is current             | Medium   | Sprint 3 |

### Epic 2: Landing Page & UI

| ID    | User Story                                                                               | Priority | Sprint   |
| ----- | ---------------------------------------------------------------------------------------- | -------- | -------- |
| US-08 | As a visitor, I want to see a landing page so that I understand what the platform offers | High     | Sprint 1 |
| US-09 | As a visitor, I want to see pricing plans so that I can choose a plan                    | High     | Sprint 1 |
| US-10 | As a user, I want a responsive dashboard so that I can manage my VMs easily              | High     | Sprint 3 |

### Epic 3: VM Management

| ID    | User Story                                                                                       | Priority | Sprint   |
| ----- | ------------------------------------------------------------------------------------------------ | -------- | -------- |
| US-11 | As a user, I want to create a VM so that I can use cloud resources                               | High     | Sprint 4 |
| US-12 | As a user, I want to start a stopped VM so that I can resume work                                | High     | Sprint 4 |
| US-13 | As a user, I want to stop a running VM so that I can save resources                              | High     | Sprint 4 |
| US-14 | As a user, I want to reboot a VM so that I can fix issues                                        | High     | Sprint 4 |
| US-15 | As a user, I want to delete a VM so that I free my quota                                         | High     | Sprint 4 |
| US-16 | As a user, I want to see VM details (IP, status, resources) so that I can monitor usage          | High     | Sprint 5 |
| US-17 | As a user, I want to see all my VMs in a list so that I can manage them                          | High     | Sprint 4 |
| US-18 | As an admin, I want to manage all VMs so that I can oversee the platform                         | High     | Sprint 5 |
| US-19 | As a user, I want to be notified of VM status changes so that I stay informed                    | Medium   | Sprint 7 |
| US-29 | As a user, I want to manage SSH keys so that I can securely connect to my VMs                    | High     | Sprint 3 |
| US-30 | As a user, I want to access a web terminal (CLI) for my VM so that I can use it from the browser | High     | Sprint 5 |

### Epic 4: Payment & Quota Management

| ID    | User Story                                                                                           | Priority | Sprint   |
| ----- | ---------------------------------------------------------------------------------------------------- | -------- | -------- |
| US-20 | As a user, I want to see my current quota so that I know my limits                                   | High     | Sprint 5 |
| US-21 | As a user, I want to upgrade my plan so that I get more resources                                    | High     | Sprint 6 |
| US-22 | As a user, I want to see payment history so that I can track expenses                                | Medium   | Sprint 6 |
| US-23 | As an admin, I want to manage pricing plans so that the business model is flexible                   | High     | Sprint 6 |
| US-24 | As a user, I want the system to block VM creation when quota is exceeded so that limits are enforced | High     | Sprint 5 |

### Epic 5: Infrastructure & Security (RSI)

| ID    | User Story                                                                                      | Priority | Sprint     |
| ----- | ----------------------------------------------------------------------------------------------- | -------- | ---------- |
| US-25 | As an operator, I want OpenNebula installed and configured so that VMs can be provisioned       | High     | Sprint 2-3 |
| US-26 | As an operator, I want firewall rules configured so that the server is secure                   | High     | Sprint 3   |
| US-27 | As an operator, I want the server monitored so that I can detect issues                         | Medium   | Sprint 6   |
| US-28 | As an operator, I want the API server to communicate with OpenNebula so that VM operations work | High     | Sprint 4   |

---

## 5. SPRINT PLANNING (8 Sprints — 8 Weeks)

---

### SPRINT 0 — Pre-Sprint: Project Setup & Planning (Before Week 1)

**Goal:** Environment setup, tooling, design

| Day   | DSI Student (Web Dev)                                  | RSI Student (Infra)               |
| ----- | ------------------------------------------------------ | --------------------------------- |
| Day 1 | Install Node.js, Docker, VS Code, Git                  | Install Ubuntu Server on machine  |
| Day 2 | Initialize monorepo structure, Docker Compose skeleton | Configure network, SSH access     |
| Day 3 | Setup Figma, start wireframing                         | Research OpenNebula documentation |

**Checkpoint:** Dev environment ready. Server accessible via SSH. Figma wireframes started.

---

### SPRINT 1 — Week 1: Landing Page & Project Foundation

**Sprint Goal:** Deliver landing page + project skeleton + server base

#### DSI Student (Web Dev)

| Day | Task                              | Details                                                                            |
| --- | --------------------------------- | ---------------------------------------------------------------------------------- |
| Mon | Project scaffolding               | Create Next.js app, NestJS apps (gateway, auth, user, vm, payment), Docker Compose |
| Tue | Database setup                    | PostgreSQL container, Prisma/TypeORM setup, initial schemas                        |
| Wed | Landing page — Hero section       | Next.js landing page: hero, navbar, responsive                                     |
| Thu | Landing page — Features + Pricing | Features section, pricing cards (3 plans), footer                                  |
| Fri | Landing page — Polish + Review    | Animations, responsive testing, code review                                        |

#### RSI Student (Infrastructure)

| Day | Task                          | Details                                          |
| --- | ----------------------------- | ------------------------------------------------ |
| Mon | Ubuntu Server hardening       | User setup, SSH key auth, disable root login     |
| Tue | Network configuration         | Static IP, DNS, hostname, basic networking       |
| Wed | Docker installation on server | Install Docker + Docker Compose on Ubuntu Server |
| Thu | OpenNebula research           | Study OpenNebula architecture, plan installation |
| Fri | Documentation                 | Document server setup procedures                 |

**Checkpoint ✅:** Landing page deployed locally. Server hardened and Docker ready.

**Deliverables:**

- Landing page with hero, features, pricing, footer
- Docker Compose with all service containers (skeleton)
- Ubuntu Server hardened

**Report Section:** Chapter 2 — Sprint 1 (Landing Page)

---

### SPRINT 2 — Week 2: Authentication Service

**Sprint Goal:** Full auth system (register, login, JWT, roles)

#### DSI Student (Web Dev)

| Day | Task                                 | Details                                                       |
| --- | ------------------------------------ | ------------------------------------------------------------- |
| Mon | Auth service — Registration endpoint | POST /auth/register, password hashing (bcrypt), validation    |
| Tue | Auth service — Login endpoint        | POST /auth/login, JWT generation, refresh tokens              |
| Wed | Auth service — Guards & Middleware   | JWT guard, role guard (user/admin), API gateway integration   |
| Thu | Frontend — Auth pages                | Login page, Register page, form validation                    |
| Fri | Frontend — Auth integration          | Connect frontend to backend, error handling, protected routes |

#### RSI Student (Infrastructure)

| Day | Task                     | Details                                       |
| --- | ------------------------ | --------------------------------------------- |
| Mon | OpenNebula installation  | Install OpenNebula front-end on Ubuntu Server |
| Tue | OpenNebula configuration | Configure datastores, networking              |
| Wed | OpenNebula KVM setup     | Install KVM hypervisor, connect to OpenNebula |
| Thu | OpenNebula templates     | Create VM templates (Ubuntu, CentOS)          |
| Fri | Test VM creation         | Test creating/destroying VMs via Sunstone UI  |

**Checkpoint ✅:** User can register & login. JWT auth working. OpenNebula can create VMs via Sunstone.

**Deliverables:**

- Auth service with JWT + refresh tokens
- Login/Register pages
- OpenNebula operational with VM templates

**Report Section:** Chapter 2 — Sprint 2 (Auth Service), Chapter on OpenNebula Setup (RSI)

---

### SPRINT 3 — Week 3: User Management & Dashboard

**Sprint Goal:** User CRUD (admin), user dashboard, firewall

#### DSI Student (Web Dev)

| Day | Task                              | Details                                                 |
| --- | --------------------------------- | ------------------------------------------------------- |
| Mon | User service — CRUD endpoints     | GET/PUT/DELETE users, admin-only routes                 |
| Tue | Admin dashboard — User management | User list, delete user, view details                    |
| Wed | User dashboard — Layout           | Sidebar, header, main content area, responsive          |
| Thu | User dashboard — Profile page     | View/edit profile, change password, SSH key management  |
| Fri | NATS JetStream setup              | Install NATS, configure JetStream streams, test pub/sub |

#### RSI Student (Infrastructure)

| Day | Task                              | Details                                              |
| --- | --------------------------------- | ---------------------------------------------------- |
| Mon | Firewall — iptables rules         | Define ingress/egress rules, default deny policy     |
| Tue | Firewall — Service-specific rules | Allow SSH, HTTP/HTTPS, OpenNebula ports only         |
| Wed | Firewall — Testing                | Test firewall rules, port scanning                   |
| Thu | OpenNebula API                    | Enable and test XML-RPC API access                   |
| Fri | API security                      | TLS configuration, API authentication for OpenNebula |

**Checkpoint ✅:** Admin can manage users. Dashboard layout ready. Firewall configured. OpenNebula API accessible.

**Deliverables:**

- User service with full CRUD
- Admin user management page
- User dashboard (layout + profile)
- NATS JetStream connected
- Firewall rules active
- OpenNebula API accessible

**Report Section:** Chapter 3 — Sprint 3 (User Service + Dashboard)

---

### SPRINT 4 — Week 4: VM Management (Core Feature)

**Sprint Goal:** Create, start, stop, reboot, delete VMs through the platform

#### DSI Student (Web Dev)

| Day | Task                            | Details                                                           |
| --- | ------------------------------- | ----------------------------------------------------------------- |
| Mon | VM service — Create VM endpoint | POST /vms, validate quota, publish to JetStream                   |
| Tue | Worker — Python setup           | Python worker, Redis connection, NATS JetStream consumer          |
| Wed | Worker — VM operations          | Create, start, stop, reboot, delete via OpenNebula XML-RPC API    |
| Thu | VM service — Status sync        | Worker publishes status updates back, VM service updates DB       |
| Fri | Frontend — VM creation form     | VM creation wizard: name, OS template, resources (CPU, RAM, disk) |

#### RSI Student (Infrastructure)

| Day | Task                       | Details                                                      |
| --- | -------------------------- | ------------------------------------------------------------ |
| Mon | OpenNebula API integration | Test XML-RPC API calls for VM lifecycle from Python          |
| Tue | VM networking              | Configure virtual networks in OpenNebula for VM connectivity |
| Wed | Storage configuration      | Configure datastores, disk images                            |
| Thu | VM template refinement     | Optimize templates, add multiple OS options                  |
| Fri | Integration testing        | Test full flow: API → Worker → OpenNebula → VM created       |

**Checkpoint ✅:** User can create a VM from the web platform, and it gets provisioned in OpenNebula.

**Deliverables:**

- VM service with full CRUD
- Python worker processing VM operations via JetStream
- VM creation working end-to-end
- OpenNebula network + storage configured

**Report Section:** Chapter 3 — Sprint 4 (VM Service + Worker)

---

### SPRINT 5 — Week 5: VM Dashboard & Quota System

**Sprint Goal:** VM list/details UI, quota enforcement

#### DSI Student (Web Dev)

| Day | Task                                 | Details                                                                                             |
| --- | ------------------------------------ | --------------------------------------------------------------------------------------------------- |
| Mon | Frontend — VM list page              | Table with all user VMs, status badges, action buttons                                              |
| Tue | Frontend — VM detail page            | VM info: IP, status, OS, CPU, RAM, uptime, terminal button                                          |
| Wed | Frontend — VM actions + Web Terminal | Start/Stop/Reboot/Delete buttons + xterm.js web terminal (CLI access to VM via WebSocket SSH proxy) |
| Thu | Quota service — Implementation       | Track quota per user, enforce limits on VM creation                                                 |
| Fri | Admin — VM management                | Admin view: all VMs, filter by user, force actions                                                  |

#### RSI Student (Infrastructure)

| Day | Task                    | Details                                                  |
| --- | ----------------------- | -------------------------------------------------------- |
| Mon | Server monitoring setup | Install monitoring (Prometheus/node_exporter or similar) |
| Tue | OpenNebula monitoring   | Monitor VM resources, host resources                     |
| Wed | Backup strategy         | Configure VM snapshot/backup procedures                  |
| Thu | Network security audit  | Review and harden network configuration                  |
| Fri | Performance testing     | Load testing VM creation/deletion                        |

**Checkpoint ✅:** User sees VM list, can perform all actions. Web terminal (CLI) works. Quota blocks over-limit creation. Admin manages all VMs.

**Deliverables:**

- VM list + detail pages
- VM action buttons (start/stop/reboot/delete)
- **Web terminal (CLI) — Phase 1 VM access via xterm.js + WebSocket SSH proxy**
- Quota enforcement system
- Admin VM management
- Server monitoring active

**Report Section:** Chapter 4 — Sprint 5 (VM Dashboard + Quotas)

---

### SPRINT 6 — Week 6: Payment Service & Plan Management

**Sprint Goal:** Payment integration, plan management, upgrade flow

#### DSI Student (Web Dev)

| Day | Task                                      | Details                                              |
| --- | ----------------------------------------- | ---------------------------------------------------- |
| Mon | Payment service — Plans CRUD              | Define plans (Free, Pro, Enterprise), CRUD for admin |
| Tue | Payment service — Stripe/mock integration | Payment processing (mock or Stripe test mode)        |
| Wed | Frontend — Billing page                   | Current plan, usage stats, upgrade button            |
| Thu | Frontend — Checkout flow                  | Plan selection, payment form, confirmation           |
| Fri | Payment history                           | Transaction history page, invoices                   |

#### RSI Student (Infrastructure)

| Day | Task                    | Details                                   |
| --- | ----------------------- | ----------------------------------------- |
| Mon | Server redundancy       | Plan failover strategy (documentation)    |
| Tue | SSL/TLS certificates    | Configure HTTPS for API endpoints         |
| Wed | Log management          | Centralized logging (journald, syslog)    |
| Thu | OpenNebula optimization | Tune performance parameters               |
| Fri | Security documentation  | Document all security measures for report |

**Checkpoint ✅:** User can view plans, upgrade, and see payment history. Payment flow complete.

**Deliverables:**

- Payment service with Stripe/mock
- Billing page + checkout flow
- Admin plan management
- SSL/TLS configured
- Security documentation

**Report Section:** Chapter 4 — Sprint 6 (Payment Service)

---

### SPRINT 7 — Week 7: Notifications, Polish & Integration Testing

**Sprint Goal:** Notifications, error handling, full integration testing

#### DSI Student (Web Dev)

| Day | Task                 | Details                                                                |
| --- | -------------------- | ---------------------------------------------------------------------- |
| Mon | Notification service | VM status change notifications (in-app)                                |
| Tue | Error handling       | Global error handling, user-friendly error messages                    |
| Wed | UI polish            | Loading states, skeletons, animations, dark mode toggle                |
| Thu | Integration testing  | Test all flows end-to-end: register → login → create VM → manage → pay |
| Fri | Bug fixes            | Fix all bugs found in integration testing                              |

#### RSI Student (Infrastructure)

| Day | Task                      | Details                               |
| --- | ------------------------- | ------------------------------------- |
| Mon | End-to-end server testing | Full VM lifecycle testing through API |
| Tue | Firewall stress testing   | Verify security under load            |
| Wed | Disaster recovery test    | Test backup/restore procedures        |
| Thu | Documentation             | Finalize infrastructure documentation |
| Fri | Server optimization       | Final performance tuning              |

**Checkpoint ✅:** All features working. No critical bugs. Platform ready for demo.

**Deliverables:**

- Notification system
- Polished UI
- All integration tests passing
- Infrastructure documentation complete

**Report Section:** Chapter 5 — Sprint 7 (Notifications + Testing)

---

### SPRINT 8 — Week 8: Deployment, Documentation & Presentation

**Sprint Goal:** Deploy, write final report, prepare presentation

#### DSI Student (Web Dev)

| Day | Task                     | Details                                      |
| --- | ------------------------ | -------------------------------------------- |
| Mon | Docker production build  | Optimize Dockerfiles, multi-stage builds     |
| Tue | Deploy all services      | Deploy with Docker Compose on Ubuntu Server  |
| Wed | Final testing on server  | Smoke tests on deployed platform             |
| Thu | Report writing           | Finalize LaTeX report, diagrams, screenshots |
| Fri | Presentation preparation | Create slides, rehearse demo                 |

#### RSI Student (Infrastructure)

| Day | Task                            | Details                                   |
| --- | ------------------------------- | ----------------------------------------- |
| Mon | Production deployment           | Final server configuration for production |
| Tue | Deployment verification         | Verify all services running on server     |
| Wed | Security final audit            | Final security review                     |
| Thu | Report writing (infra sections) | Write server/OpenNebula/firewall sections |
| Fri | Presentation preparation        | Prepare infrastructure demo               |

**Checkpoint ✅:** Platform deployed and running. Report complete. Presentation ready.

**Deliverables:**

- Deployed platform
- Complete LaTeX report
- Presentation slides
- Demo script

---

## 6. DIAGRAMS NEEDED

### 6.1 General Diagrams

1. **General Use Case Diagram** — All actors (Visitor, User, Admin) and their use cases
2. **Global Architecture Diagram** — Microservices, server, network topology
3. **Deployment Diagram** — Docker containers, server, client

### 6.2 Per-Sprint / Per-Service Diagrams

#### Sprint 1 — Landing Page

- Mockup / Wireframe (from Figma)

#### Sprint 2 — Auth Service

- **Use Case Diagram** — Auth (register, login, logout, reset password)
- **Sequence Diagram** — Registration flow
- **Sequence Diagram** — Login flow (JWT)
- **Class Diagram** — User entity, Auth DTOs

#### Sprint 3 — User Service & Dashboard

- **Use Case Diagram** — User management (CRUD)
- **Sequence Diagram** — Admin deletes user
- **Class Diagram** — User, Role entities

#### Sprint 4 — VM Service & Worker

- **Use Case Diagram** — VM operations (create, start, stop, reboot, delete)
- **Sequence Diagram** — VM creation (Frontend → API → JetStream → Worker → OpenNebula)
- **Sequence Diagram** — VM stop/start
- **Activity Diagram** — VM lifecycle
- **Class Diagram** — VM entity, VMTemplate, Worker

#### Sprint 5 — VM Dashboard & Quotas

- **Use Case Diagram** — Quota management
- **Sequence Diagram** — Quota check on VM creation
- **Sequence Diagram** — Web terminal connection flow (User → Frontend → WebSocket → SSH Proxy → VM)
- **Class Diagram** — Quota, Plan, SSHKey entities

#### Sprint 6 — Payment Service

- **Use Case Diagram** — Payment (upgrade plan, view history)
- **Sequence Diagram** — Payment/upgrade flow
- **Class Diagram** — Payment, Invoice, Plan entities

#### Sprint 7 — Notifications

- **Sequence Diagram** — Notification flow (VM status → user)

#### Infrastructure Diagrams (RSI)

- **Network Topology Diagram** — Server, firewall, OpenNebula, client
- **Deployment Diagram** — Physical/virtual server layout
- **Firewall Rules Diagram** — Traffic flow with iptables rules
- **OpenNebula Architecture Diagram** — Front-end, host, datastores, networks

### 6.3 Global Diagrams (for Report)

- **Entity-Relationship Diagram (ERD)** — Full database schema
- **Component Diagram** — All microservices and their communication
- **Global Class Diagram** — All entities
- **Sprint Burndown Charts** — One per sprint (can be mocked)

---

## 7. SPRINT BACKLOG DETAILS

### Sprint Backlog Format

Each sprint backlog contains:

- Sprint Goal
- User Stories assigned to the sprint
- Tasks broken down from user stories
- Estimated hours per task
- Assignee (DSI/RSI)
- Status tracking

---

### Sprint 1 Backlog

| Task ID | User Story | Task                                                        | Assignee | Estimated Hours | Status |
| ------- | ---------- | ----------------------------------------------------------- | -------- | --------------- | ------ |
| T-1.1   | US-08      | Scaffold Next.js project                                    | DSI      | 2h              | -      |
| T-1.2   | US-08      | Scaffold NestJS services (gateway, auth, user, vm, payment) | DSI      | 4h              | -      |
| T-1.3   | US-08      | Setup Docker Compose                                        | DSI      | 3h              | -      |
| T-1.4   | US-08      | Setup PostgreSQL + ORM                                      | DSI      | 3h              | -      |
| T-1.5   | US-08      | Create landing page hero section                            | DSI      | 4h              | -      |
| T-1.6   | US-09      | Create pricing section                                      | DSI      | 4h              | -      |
| T-1.7   | US-08      | Create features + footer section                            | DSI      | 3h              | -      |
| T-1.8   | US-08      | Responsive design + polish                                  | DSI      | 4h              | -      |
| T-1.9   | —          | Ubuntu Server hardening                                     | RSI      | 4h              | -      |
| T-1.10  | —          | Network configuration                                       | RSI      | 3h              | -      |
| T-1.11  | —          | Docker install on server                                    | RSI      | 2h              | -      |
| T-1.12  | —          | OpenNebula research                                         | RSI      | 6h              | -      |

---

### Sprint 2 Backlog

| Task ID | User Story | Task                                        | Assignee | Estimated Hours | Status |
| ------- | ---------- | ------------------------------------------- | -------- | --------------- | ------ |
| T-2.1   | US-01      | Registration endpoint (POST /auth/register) | DSI      | 4h              | -      |
| T-2.2   | US-02      | Login endpoint (POST /auth/login)           | DSI      | 4h              | -      |
| T-2.3   | US-02      | JWT + Refresh token implementation          | DSI      | 4h              | -      |
| T-2.4   | US-03      | Logout endpoint + token blacklist           | DSI      | 2h              | -      |
| T-2.5   | US-04      | Password reset flow                         | DSI      | 3h              | -      |
| T-2.6   | US-02      | Auth guards (JWT, Role)                     | DSI      | 3h              | -      |
| T-2.7   | US-01      | Register page (frontend)                    | DSI      | 4h              | -      |
| T-2.8   | US-02      | Login page (frontend)                       | DSI      | 3h              | -      |
| T-2.9   | US-02      | Auth state management (frontend)            | DSI      | 3h              | -      |
| T-2.10  | US-25      | OpenNebula installation                     | RSI      | 6h              | -      |
| T-2.11  | US-25      | OpenNebula configuration                    | RSI      | 6h              | -      |
| T-2.12  | US-25      | KVM setup + VM templates                    | RSI      | 6h              | -      |

---

### Sprint 3 Backlog

| Task ID | User Story | Task                               | Assignee | Estimated Hours | Status |
| ------- | ---------- | ---------------------------------- | -------- | --------------- | ------ |
| T-3.1   | US-05      | User service CRUD endpoints        | DSI      | 4h              | -      |
| T-3.2   | US-06      | Admin user management endpoints    | DSI      | 3h              | -      |
| T-3.3   | US-10      | Dashboard layout (sidebar, header) | DSI      | 6h              | -      |
| T-3.4   | US-07      | Profile page (view/edit)           | DSI      | 4h              | -      |
| T-3.11  | US-29      | SSH key management (CRUD + UI)     | DSI      | 5h              | -      |
| T-3.5   | US-05      | Admin — user list page             | DSI      | 4h              | -      |
| T-3.6   | —          | NATS JetStream setup               | DSI      | 4h              | -      |
| T-3.7   | US-26      | Firewall rules (iptables)          | RSI      | 6h              | -      |
| T-3.8   | US-26      | Firewall testing                   | RSI      | 4h              | -      |
| T-3.9   | US-28      | OpenNebula API access              | RSI      | 6h              | -      |

---

### Sprint 4 Backlog

| Task ID | User Story  | Task                                  | Assignee | Estimated Hours | Status |
| ------- | ----------- | ------------------------------------- | -------- | --------------- | ------ |
| T-4.1   | US-11       | VM service — Create VM endpoint       | DSI      | 5h              | -      |
| T-4.2   | US-11       | Python worker setup (Redis + NATS)    | DSI      | 5h              | -      |
| T-4.3   | US-11       | Worker — Create VM via OpenNebula API | DSI      | 5h              | -      |
| T-4.4   | US-12,13,14 | Worker — Start/Stop/Reboot operations | DSI      | 4h              | -      |
| T-4.5   | US-15       | Worker — Delete VM operation          | DSI      | 2h              | -      |
| T-4.6   | US-11       | VM creation form (frontend)           | DSI      | 5h              | -      |
| T-4.7   | US-17       | VM list page (frontend)               | DSI      | 4h              | -      |
| T-4.8   | US-28       | OpenNebula API integration testing    | RSI      | 6h              | -      |
| T-4.9   | —           | VM networking (virtual networks)      | RSI      | 6h              | -      |
| T-4.10  | —           | Storage + disk image configuration    | RSI      | 4h              | -      |

---

### Sprint 5 Backlog

| Task ID | User Story     | Task                             | Assignee | Estimated Hours | Status |
| ------- | -------------- | -------------------------------- | -------- | --------------- | ------ |
| T-5.1   | US-16          | VM detail page (frontend)        | DSI      | 5h              | -      |
| T-5.10  | US-30          | Web terminal (xterm.js + WS SSH) | DSI      | 6h              | -      |
| T-5.2   | US-12,13,14,15 | VM action buttons + confirmation | DSI      | 4h              | -      |
| T-5.3   | US-20          | Quota tracking implementation    | DSI      | 4h              | -      |
| T-5.4   | US-24          | Quota enforcement on VM creation | DSI      | 3h              | -      |
| T-5.5   | US-18          | Admin VM management page         | DSI      | 5h              | -      |
| T-5.6   | US-20          | Quota display on dashboard       | DSI      | 3h              | -      |
| T-5.7   | US-27          | Server monitoring setup          | RSI      | 6h              | -      |
| T-5.8   | —              | Backup procedures                | RSI      | 4h              | -      |
| T-5.9   | —              | Network security audit           | RSI      | 4h              | -      |

---

### Sprint 6 Backlog

| Task ID | User Story | Task                             | Assignee | Estimated Hours | Status |
| ------- | ---------- | -------------------------------- | -------- | --------------- | ------ |
| T-6.1   | US-23      | Plans CRUD (backend)             | DSI      | 4h              | -      |
| T-6.2   | US-21      | Payment processing (Stripe/mock) | DSI      | 5h              | -      |
| T-6.3   | US-21      | Billing page (frontend)          | DSI      | 4h              | -      |
| T-6.4   | US-21      | Checkout flow (frontend)         | DSI      | 5h              | -      |
| T-6.5   | US-22      | Payment history page             | DSI      | 3h              | -      |
| T-6.6   | US-23      | Admin plan management page       | DSI      | 3h              | -      |
| T-6.7   | —          | SSL/TLS configuration            | RSI      | 4h              | -      |
| T-6.8   | —          | Log management                   | RSI      | 4h              | -      |
| T-6.9   | —          | OpenNebula optimization          | RSI      | 4h              | -      |

---

### Sprint 7 Backlog

| Task ID | User Story | Task                                       | Assignee | Estimated Hours | Status |
| ------- | ---------- | ------------------------------------------ | -------- | --------------- | ------ |
| T-7.1   | US-19      | Notification service (backend)             | DSI      | 4h              | -      |
| T-7.2   | US-19      | In-app notification UI                     | DSI      | 3h              | -      |
| T-7.3   | —          | Error handling improvements                | DSI      | 4h              | -      |
| T-7.4   | —          | UI polish (loading, animations, dark mode) | DSI      | 5h              | -      |
| T-7.5   | —          | Integration testing                        | DSI      | 6h              | -      |
| T-7.6   | —          | Bug fixes                                  | DSI      | 4h              | -      |
| T-7.7   | —          | Server end-to-end testing                  | RSI      | 6h              | -      |
| T-7.8   | —          | Security stress testing                    | RSI      | 4h              | -      |
| T-7.9   | —          | Infrastructure documentation               | RSI      | 4h              | -      |

---

### Sprint 8 Backlog

| Task ID | User Story | Task                     | Assignee | Estimated Hours | Status |
| ------- | ---------- | ------------------------ | -------- | --------------- | ------ |
| T-8.1   | —          | Production Docker builds | DSI      | 4h              | -      |
| T-8.2   | —          | Deploy all services      | DSI      | 4h              | -      |
| T-8.3   | —          | Final testing            | DSI      | 4h              | -      |
| T-8.4   | —          | Report finalization      | DSI      | 6h              | -      |
| T-8.5   | —          | Presentation preparation | DSI      | 4h              | -      |
| T-8.6   | —          | Production server config | RSI      | 4h              | -      |
| T-8.7   | —          | Deployment verification  | RSI      | 4h              | -      |
| T-8.8   | —          | Report (infra sections)  | RSI      | 6h              | -      |
| T-8.9   | —          | Presentation preparation | RSI      | 4h              | -      |

---

## 8. REPORT STRUCTURE (LATEX)

The report follows the ISET PFE report format based on the PDF provided:

### Chapter 1: General Context

- Introduction
- Presentation of Host Organization (Readdly) — _to be filled by student_
- Study of the Existing System
- Proposed Solution
- Methodology (Agile/Scrum)
- Product Backlog
- Development Environment & Tools
- Conclusion

### Chapter 2: Sprint 1 & Sprint 2 — Foundation & Authentication

- Sprint 1: Landing Page
  - Sprint backlog
  - Wireframes/mockups
  - Implementation screenshots
- Sprint 2: Authentication Service
  - Sprint backlog
  - Use case diagram
  - Sequence diagrams (register, login)
  - Class diagram
  - Implementation screenshots
- Conclusion

### Chapter 3: Sprint 3 & Sprint 4 — Users, Dashboard & VM Management

- Sprint 3: User Management & Dashboard
  - Sprint backlog
  - Use case diagram
  - Diagrams
  - Implementation screenshots
- Sprint 4: VM Service & Worker
  - Sprint backlog
  - Use case diagram
  - Sequence diagrams (VM creation flow)
  - Activity diagram (VM lifecycle)
  - Class diagram
  - Architecture diagram (Worker + JetStream)
  - Implementation screenshots
- Conclusion

### Chapter 4: Sprint 5 & Sprint 6 — Quotas & Payments

- Sprint 5: VM Dashboard & Quota System
  - Sprint backlog
  - Diagrams
  - Implementation screenshots
- Sprint 6: Payment Service
  - Sprint backlog
  - Use case diagram
  - Sequence diagram (payment flow)
  - Class diagram
  - Implementation screenshots
- Conclusion

### Chapter 5: Sprint 7 & Sprint 8 — Polish, Testing & Deployment

- Sprint 7: Notifications & Testing
  - Sprint backlog
  - Integration test results
  - Screenshots
- Sprint 8: Deployment & Finalization
  - Deployment diagram
  - Network topology
  - Final screenshots
- Conclusion

### General Conclusion

---

## 9. CHECKPOINTS SUMMARY

| Week   | Checkpoint                          | What to Verify                                              |
| ------ | ----------------------------------- | ----------------------------------------------------------- |
| Week 1 | ✅ Landing page + Dev environment   | Landing page responsive, Docker containers up               |
| Week 2 | ✅ Auth service                     | Register/Login working, JWT validated, OpenNebula installed |
| Week 3 | ✅ User management + Dashboard      | CRUD users, dashboard layout, firewall active               |
| Week 4 | ✅ VM management (core)             | Create/Start/Stop/Delete VM end-to-end                      |
| Week 5 | ✅ VM dashboard + Quotas            | VM list/detail UI, quota enforcement                        |
| Week 6 | ✅ Payment service                  | Plan upgrade, payment processing, billing page              |
| Week 7 | ✅ All features + Testing           | Integration tests pass, no critical bugs                    |
| Week 8 | ✅ Deployed + Report + Presentation | Platform live, report done, slides ready                    |

---

## 10. WHAT'S MISSING / RECOMMENDATIONS

To make this a complete PFE project, also consider:

1. **Phase 2 — Full Desktop Streaming:** Upgrade VM access from CLI terminal to full graphical desktop streaming using VNC/noVNC, allowing users to interact with the VM's GUI (Windows desktop, Linux desktop environment) directly in the browser
2. **README.md** for the project repository with setup instructions
3. **API Documentation** (Swagger/OpenAPI) — NestJS has built-in Swagger support
4. **Unit Tests** — At least for critical paths (auth, VM operations, quota checks)
5. **CI/CD Pipeline** — Even a basic GitHub Actions workflow
6. **Monitoring Dashboard** — Grafana + Prometheus for production metrics
7. **Rate Limiting** — On the API Gateway to prevent abuse
8. **Logging** — Structured logging across all services
9. **Environment Variables** — Proper .env management with validation
10. **Database Migrations** — Versioned migrations for schema changes
11. **Security Audit Checklist** — Document all security measures taken

---

## 11. TECHNOLOGY SUMMARY

| Category         | Technology                                                              |
| ---------------- | ----------------------------------------------------------------------- |
| Frontend         | Next.js 14+, Tailwind CSS, React Query/SWR, xterm.js (web terminal)     |
| Backend          | NestJS, TypeScript, Prisma/TypeORM                                      |
| Worker           | Python 3.11+, Redis, NATS JetStream, pyone (OpenNebula Python bindings) |
| Database         | PostgreSQL 16                                                           |
| Message Broker   | NATS with JetStream                                                     |
| Cache            | Redis                                                                   |
| Containerization | Docker, Docker Compose                                                  |
| Server OS        | Ubuntu Server 22.04/24.04 LTS                                           |
| VM Orchestration | OpenNebula 6.x                                                          |
| Firewall         | iptables / nftables                                                     |
| Design           | Figma                                                                   |
| Version Control  | Git + GitHub/GitLab                                                     |
| CI/CD            | GitHub Actions (optional)                                               |
| Documentation    | LaTeX (Overleaf)                                                        |

---

_This document is the master reference for the CloudVM PFE project. Update it as tasks are completed and new decisions are made._
