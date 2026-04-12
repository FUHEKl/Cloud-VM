# CloudVM — Master Project Plan

This document is the canonical step-by-step guide for understanding, rebuilding, and extending this project from zero.
It is written as a practical implementation plan, not as a prompt.

## 1) What this project is

CloudVM is a cloud virtual machine management platform with:

- a Next.js frontend for users and admins,
- an API gateway that routes requests to backend services,
- separate NestJS services for authentication, users, VM management, plans, and AI,
- a Python worker that talks to OpenNebula through XML-RPC,
- PostgreSQL, Redis, and NATS for persistence and async orchestration,
- Nginx as the reverse proxy for the public entry point,
- real-time WebSocket terminals and VM status events.

The goal is to let a user:

1. register or log in,
2. manage profile and SSH keys,
3. create and control virtual machines,
4. open a browser terminal into a running VM,
5. use an AI assistant to help with VM actions,
6. let an admin manage users and plans.

## 2) Important repository note

The workspace contains two similar trees:

- the active root project folders: `frontend/`, `services/`, `worker/`, `nginx/`, `scripts/`, `rapport/`
- a mirrored copy under `projettt/`

For a clean rebuild from zero, use the root folders as the source of truth.
Treat `projettt/` as a duplicate snapshot unless you intentionally need to compare files.

## 3) Architecture at a glance

### Main layers

1. **Browser / frontend**
   - Next.js app in `frontend/`
   - pages for landing, login, register, dashboard, VMs, SSH keys, profile, assistant, admin users
   - uses JWT cookies and Socket.IO for live updates

2. **Gateway**
   - NestJS gateway in `services/gateway/`
   - exposes `/api/*`
   - proxies requests to backend services
   - forwards WebSocket traffic for terminal and VM status streams

3. **Business services**
   - `services/auth/` → login, register, refresh, logout, current user
   - `services/user/` → profile, password, admin user management, SSH keys
   - `services/vm/` → VM CRUD, actions, templates, plans, stats, terminal and VM events gateways
   - `services/ai/` → chat, conversations, streaming assistant, safe action confirmation

4. **Background worker**
   - `worker/`
   - consumes NATS jobs
   - connects to OpenNebula with `pyone`
   - creates VMs, changes VM state, deletes VMs, resolves templates, updates the database

5. **Infrastructure**
   - PostgreSQL for application data
   - Redis for status cache and transient state
   - NATS JetStream for async VM commands
   - OpenNebula for actual VM provisioning
   - Nginx for public routing and TLS

## 4) Runtime flow

### Login flow

1. User opens the frontend.
2. User registers or logs in through `/auth/register` or `/auth/login`.
3. Auth service returns access and refresh tokens plus the user object.
4. Frontend stores tokens in cookies.
5. Frontend fetches `/auth/me` to restore session on refresh.

### VM creation flow

1. User submits the VM creation form.
2. Frontend calls `POST /api/vms`.
3. Gateway proxies the request to the VM service.
4. VM service stores the VM in the database with a pending state.
5. VM service publishes a `vm.create` event to NATS.
6. Python worker receives the job.
7. Worker selects the OpenNebula template.
8. Worker injects SSH keys from:
   - the server-level extra key file,
   - saved user SSH keys,
   - the generated key from the creation request.
9. Worker instantiates the VM through OpenNebula XML-RPC.
10. Worker updates the database and emits VM status updates.
11. Frontend receives real-time events through the VM events socket.
12. When the VM is running and has an IP, the browser shows the terminal and action buttons.

### Terminal flow

1. User opens a running VM detail page.
2. Frontend mounts the terminal component.
3. Browser connects to the gateway at `/terminal/socket.io`.
4. Gateway forwards the WebSocket upgrade to the VM service.
5. VM service opens the SSH session to the VM.
6. User types into the browser terminal and output streams back in real time.

### AI assistant flow

1. User opens the assistant page.
2. Frontend loads conversations and messages from `/api/ai/*`.
3. User sends a message.
4. AI service responds using the configured provider.
5. If needed, the assistant returns a pending action that must be confirmed manually.
6. Confirmed actions are sent back through `/ai/actions/confirm`.

## 5) Tech stack summary

- **Frontend**: Next.js 14, React 18, TypeScript, Tailwind CSS, Zustand, Axios, Socket.IO client, xterm
- **Services**: NestJS, Prisma, Passport JWT, Socket.IO, http-proxy-middleware
- **Worker**: Python, asyncio, NATS, Redis, psycopg2, pyone, python-dotenv
- **Database**: PostgreSQL 16
- **Async messaging**: NATS with JetStream
- **Reverse proxy**: Nginx
- **Virtualization backend**: OpenNebula

## 6) Local environment variables

The root `.env` file contains the default local values.
The sample file is also available as `.env.example`.

The important variables are:

- database: `DATABASE_URL`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`
- auth: `JWT_SECRET`, `JWT_REFRESH_SECRET`, `JWT_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN`
- messaging: `REDIS_HOST`, `REDIS_PORT`, `NATS_URL`
- OpenNebula: `ONE_XMLRPC`, `ONE_USERNAME`, `ONE_PASSWORD`, `ONE_IP_OFFSET`
- frontend/gateway URLs: `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_VM_WS_URL`, `CORS_ORIGIN`
- AI provider config: `AI_PROVIDER`, `AI_FALLBACK_ENABLED`, `AI_RATE_LIMIT_PER_MIN`, `AI_ACTION_CONFIRM_SECRET`, `OLLAMA_BASE_URL`, `OLLAMA_MODEL`, `OPENROUTER_API_KEY`, `OPENROUTER_BASE_URL`, `OPENROUTER_MODEL`

## 7) Rebuild the project from zero

### Step 1 — Set the foundation

1. Install the required tooling: Node.js, npm, Python 3, Docker, and Docker Compose.
2. Copy the root `.env.example` values into `.env` and adjust them for your machine.
3. Decide whether OpenNebula is local, remote, or mocked.
4. Make sure the database, Redis, and NATS values are reachable.

### Step 2 — Start infrastructure first

Bring up the shared infrastructure before any app service:

1. PostgreSQL
2. Redis
3. NATS
4. optional Ollama
5. OpenNebula connectivity

Reason: the backend services and the worker depend on these components.

### Step 3 — Prepare the database

1. Confirm the auth and VM services can connect to PostgreSQL.
2. Run Prisma migrations for the auth side first.
3. Seed plans or initial data if the project expects them.
4. Verify the schema has users, SSH keys, VMs, plans, conversations, and assistant messages.

### Step 4 — Start the backend services

Start the services in this order:

1. auth service on port `3002`
2. user service on port `3003`
3. vm service on port `3004`
4. ai service on port `3006`
5. gateway on port `3001`

Why this order matters:

- auth/user/vm/ai all need PostgreSQL
- gateway depends on the individual services being available
- frontend should point to the gateway, not directly to the services

### Step 5 — Start the worker

1. Start the Python worker after NATS and Redis are up.
2. Verify it can connect to OpenNebula.
3. Verify it loads OpenNebula templates.
4. Verify it can reconcile pending VMs on startup.

### Step 6 — Start the frontend

1. Run the Next.js frontend on port `3000`.
2. Point the frontend API URL to the gateway.
3. Confirm the landing page loads.
4. Confirm login redirects into the dashboard.

### Step 7 — Put Nginx in front

1. Configure Nginx to expose the public site.
2. Route browser traffic to the frontend.
3. Route `/api/*` and WebSocket namespaces to the gateway.
4. Enable TLS if the deployment uses HTTPS.

## 8) Service responsibilities and API surface

### Auth service

Main endpoints:

- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/logout`
- `GET /auth/me`

Responsibility:

- create accounts
- verify credentials
- issue and refresh JWTs
- return the authenticated user profile

### User service

Main endpoints:

- `GET /users/profile`
- `PATCH /users/profile`
- `PATCH /users/profile/password`
- `GET /users/stats`
- `GET /users`
- `GET /users/:id`
- `PATCH /users/:id`
- `DELETE /users/:id`

SSH key endpoints:

- `GET /ssh-keys`
- `POST /ssh-keys`
- `DELETE /ssh-keys/:id`

Responsibility:

- profile management
- password updates
- admin user administration
- SSH public key storage for VM bootstrapping

### VM service

Main endpoints:

- `POST /vms`
- `GET /vms`
- `GET /vms/:id`
- `POST /vms/:id/action`
- `DELETE /vms/:id`
- `GET /vms/templates`
- `GET /vms/stats`

Plans endpoints:

- `GET /plans`
- `POST /plans`
- `PATCH /plans/:id`
- `DELETE /plans/:id`

Responsibility:

- persist VM requests
- publish jobs to NATS
- expose VM status and stats
- proxy terminal and real-time VM event sockets

### AI service

Main endpoints:

- `POST /ai/conversations`
- `GET /ai/conversations`
- `GET /ai/conversations/:conversationId/messages`
- `POST /ai/chat`
- `POST /ai/chat/stream`
- `POST /ai/actions/confirm`

Responsibility:

- multi-turn assistant conversations
- streaming responses
- action safety confirmation before VM operations
- provider fallback between Ollama and OpenRouter when configured

## 9) Frontend pages and what each one does

### Public pages

- `/` → marketing landing page
- `/login` → user login
- `/register` → account creation

### Dashboard pages

- `/dashboard` → overview cards and recent VMs
- `/dashboard/vms` → VM list, search, filters, actions
- `/dashboard/vms/create` → VM creation form and SSH key modal
- `/dashboard/vms/[id]` → VM details, power actions, terminal, status refresh
- `/dashboard/ssh-keys` → SSH key management
- `/dashboard/profile` → profile update and password change
- `/dashboard/assistant` → AI assistant chat
- `/dashboard/admin/users` → admin-only user management

### Client behavior to remember

- tokens are stored in cookies
- the auth store restores sessions through `/auth/me`
- VM status updates are live through Socket.IO
- the terminal uses `xterm` and the VM SSH key cache in browser storage

## 10) Real-time channels

### VM status stream

- browser path: `/vm-events/socket.io`
- gateway forwards to the VM service
- used to update VM cards, VM detail pages, and deletion events

### Terminal stream

- browser path: `/terminal/socket.io`
- gateway forwards to the VM service
- used for interactive SSH sessions in the browser

## 11) Worker behavior in detail

The worker is the bridge between the application and OpenNebula.

### It must do the following

1. connect to NATS
2. connect to Redis
3. ensure the JetStream stream exists
4. load OpenNebula templates
5. reconcile pending VMs on startup
6. consume `vm.create`, `vm.action`, and `vm.delete`
7. respond to `templates.list`
8. publish `vm.status.update` whenever VM state changes

### VM creation logic

1. find the OpenNebula template by name
2. collect SSH keys from:
   - the host-level injected key file
   - the user’s saved SSH keys
   - the request payload SSH key
3. deduplicate the keys
4. instantiate the VM with CPU, RAM, and disk settings
5. persist `PENDING` state and the OpenNebula VM ID
6. poll until the VM becomes `RUNNING`
7. extract the IP address
8. optionally apply `ONE_IP_OFFSET`
9. update the database and cache
10. publish the final status event

### VM action logic

Supported actions:

- `start`
- `stop`
- `restart`
- `delete`

Each action maps to an OpenNebula operation and a resulting application status.

## 12) OpenNebula setup expectations

Before the platform can provision real VMs, OpenNebula needs to be ready.

### Required pieces

1. a valid XML-RPC endpoint
2. an API user with the right permissions
3. at least one VM template per supported OS
4. a datastore for images
5. a usable virtual network
6. a KVM-capable host

### Template expectations

- templates should match the names used in the app
- each template should be able to inject SSH public keys through contextualization
- the startup script should create the `cloudvm` user and enable SSH access

### VM access expectations

- the guest must have a reachable IP address
- SSH must be allowed from the platform network
- the terminal service must be able to connect to port `22`

## 13) Build and verify sequence

After rebuilding from zero, validate in this order:

1. frontend landing page renders
2. login works and cookies are set
3. dashboard loads stats and VM list
4. SSH key CRUD works
5. VM creation creates a pending VM record
6. worker receives the NATS event
7. VM status updates arrive in the UI
8. VM detail page can open the terminal
9. AI assistant can create a conversation and answer
10. admin pages are restricted to admin users
11. run `python scripts/platform_regression_smoke_test.py` for a non-destructive API regression pass (registration, SSH key CRUD, VM read APIs, terminal route/auth checks)

## 14) Common failure points

### Database issues

- bad `DATABASE_URL`
- migrations not run
- Prisma client out of sync

### Messaging issues

- NATS not running
- JetStream stream missing
- worker not connected when a VM create request is emitted

### OpenNebula issues

- wrong XML-RPC URL
- wrong user or password
- template name mismatch
- image not ready
- network not configured
- guest IP not reachable

### Terminal issues

- WebSocket path mismatch
- gateway upgrade handling not registered
- VM has no IP yet
- SSH credentials missing in browser storage

### AI issues

- Ollama not running
- OpenRouter key missing
- rate limit too low
- provider fallback disabled

## 15) If you extend the project

When adding a new feature, follow this order:

1. define the user story
2. update the data model if needed
3. add or extend the backend service
4. expose the API through the gateway
5. add the frontend page or component
6. add live updates if the feature changes state often
7. update Docker or environment variables if the feature needs new infrastructure
8. update this master plan so the next AI has the latest map

## 16) Files that matter most

If an AI needs to understand the code quickly, these are the first files to read:

- `docker-compose.yml`
- `.env.example`
- `frontend/src/lib/api.ts`
- `frontend/src/lib/auth.ts`
- `frontend/src/hooks/useVmSocket.ts`
- `frontend/src/components/terminal/Terminal.tsx`
- `frontend/src/components/assistant/AssistantChat.tsx`
- `services/gateway/src/main.ts`
- `services/gateway/src/proxy/proxy.module.ts`
- `services/auth/src/auth/auth.controller.ts`
- `services/user/src/user/user.controller.ts`
- `services/user/src/ssh-key/ssh-key.controller.ts`
- `services/vm/src/vm/vm.controller.ts`
- `services/vm/src/plan/plan.controller.ts`
- `services/ai/src/ai/ai.controller.ts`
- `worker/main.py`
- `worker/vm_handler.py`
- `worker/db_updater.py`
- `scripts/opennebula/SETUP_GUIDE.md`

## 17) Final rule for rebuilding from zero

Do not start by building the UI first.
Start with:

1. environment variables
2. infrastructure services
3. database
4. backend services
5. worker and OpenNebula integration
6. frontend
7. reverse proxy
8. end-to-end validation

That sequence prevents the usual “the app is up but nothing can talk to anything” trap. Classic distributed-systems comedy, one would say.
