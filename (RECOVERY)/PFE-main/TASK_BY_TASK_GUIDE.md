# Task-by-Task Guide — What to Do & What to Expect

## How This Works

For **each task** below, I tell you:

1. **What to do** (step-by-step)
2. **What result you should see** (how to verify it works)
3. **When to add it to the report** (which LaTeX chapter/section)
4. **What diagram to include** (if any)

After completing each **checkpoint** (end of sprint), you add the corresponding LaTeX chapter code to your `main.tex` by uncommenting the `\input{chapters/chapterX}` line.

---

## Sprint 0 — Pre-Sprint Setup

### Task: Install Development Tools (DSI)

**What to do:**

- Install Node.js 20+ LTS
- Install Docker Desktop
- Install VS Code with extensions (ESLint, Prettier, Prisma, Tailwind IntelliSense)
- Install Git, create GitHub/GitLab repo
- Install Postman
- Create a Figma account

**Result:** All tools accessible from terminal. `node -v`, `docker -v`, `git --version` all return versions.

---

### Task: Install Server OS (RSI)

**What to do:**

- Install Ubuntu Server 22.04 or 24.04 LTS on a dedicated machine
- Configure SSH access from dev machine
- Note down the server IP

**Result:** Can SSH into the server from dev machine: `ssh user@server-ip`

---

### Task: Start Figma Wireframes (DSI)

**What to do:**

- Create a new Figma project "CloudVM"
- Design wireframes for: Landing Page, Login, Register, Dashboard, VM List, VM Create, VM Detail, Billing, Admin Users, Admin VMs
- Use a consistent design system (colors, fonts, spacing)

**Result:** Figma file with at least landing page, auth pages, and dashboard wireframes.

---

## Sprint 1 — Week 1

### Task T-1.1: Scaffold Next.js Project

**What to do:**

```bash
npx create-next-app@latest frontend --typescript --tailwind --app --src-dir
cd frontend
npm install
npm run dev
```

**Result:** Next.js dev server running at `http://localhost:3000` showing default page.

---

### Task T-1.2: Scaffold NestJS Microservices

**What to do:**

```bash
# Install NestJS CLI
npm i -g @nestjs/cli

# Create services
nest new gateway --strict
nest new auth-service --strict
nest new user-service --strict
nest new vm-service --strict
nest new payment-service --strict
```

**Result:** Each service has its own directory with NestJS boilerplate. `npm run start:dev` works for each.

---

### Task T-1.3: Setup Docker Compose

**What to do:**

- Create `docker-compose.yml` at project root
- Add services: frontend, gateway, auth, user, vm, payment, postgres, redis, nats
- Create `.env` file with all environment variables
- Create Dockerfile for each service

**Result:** `docker-compose up -d` starts all containers. `docker ps` shows all running.

---

### Task T-1.4: Setup PostgreSQL + ORM

**What to do:**

- In each NestJS service: `npm install prisma @prisma/client`
- Run `npx prisma init`
- Define initial schema (User model at minimum)
- Run `npx prisma migrate dev`

**Result:** Database tables created. Can connect to PostgreSQL and see tables.

---

### Task T-1.5–T-1.8: Landing Page

**What to do:**

- Create `app/page.tsx` — landing page
- Hero section: headline, subtitle, CTA button, illustration/animation
- Features section: 3-4 feature cards (VMs, Security, Simple Pricing, API)
- Pricing section: 3 plan cards (Free, Pro, Enterprise) with features list
- Footer: links, social media, copyright
- Make everything responsive (mobile, tablet, desktop)

**Result:** Beautiful landing page at `/` with all sections. Responsive on all screen sizes.

**Screenshot needed for report:** Take screenshots of hero, features, pricing sections.

---

### Sprint 1 Checkpoint ✅

**Verify:**

- [ ] Landing page loads at localhost:3000
- [ ] Docker containers all running
- [ ] PostgreSQL accessible
- [ ] Server SSH works (RSI)

**Report Action:** Uncomment `\input{chapters/chapter2}` in `main.tex`. Insert screenshots into the chapter2.tex placeholder figures.

---

## Sprint 2 — Week 2

### Task T-2.1: Registration Endpoint

**What to do:**

- In auth-service, create `auth.controller.ts`, `auth.service.ts`
- `POST /auth/register` endpoint
- Accept: `{ email, password, firstName, lastName }`
- Hash password with bcrypt before saving
- Validate email format, password strength
- Return JWT + refresh token

**Result:** Postman POST to `/auth/register` with valid body returns 201 + tokens.

---

### Task T-2.2: Login Endpoint

**What to do:**

- `POST /auth/login` endpoint
- Accept: `{ email, password }`
- Find user by email, compare passwords with bcrypt
- Generate JWT (15min expiry) + refresh token (7 days)
- Return both tokens

**Result:** Postman POST to `/auth/login` with valid credentials returns 200 + tokens.

---

### Task T-2.3: JWT + Refresh Tokens

**What to do:**

- Install `@nestjs/jwt`, `@nestjs/passport`, `passport-jwt`
- Create JWT strategy
- `POST /auth/refresh` endpoint — accepts refresh token, returns new JWT
- Store refresh tokens in database with expiry

**Result:** JWT decodes correctly showing user ID and role. Refresh endpoint generates new access token.

---

### Task T-2.4: Logout + Token Blacklist

**What to do:**

- `POST /auth/logout` endpoint
- Revoke refresh token in database (set `isRevoked = true`)

**Result:** After logout, refresh token no longer works.

---

### Task T-2.5: Password Reset

**What to do:**

- `POST /auth/forgot-password` — generates reset token
- `POST /auth/reset-password` — accepts token + new password
- (For now, log the reset token to console; email integration optional)

**Result:** Can reset password using the token, then login with new password.

---

### Task T-2.6: Auth Guards

**What to do:**

- Create `JwtAuthGuard` — validates JWT on protected routes
- Create `RolesGuard` — checks user role (USER/ADMIN)
- Create `@Roles()` decorator
- Apply guards to API gateway

**Result:** Protected endpoints return 401 without token, 403 without proper role.

---

### Task T-2.7–T-2.9: Frontend Auth Pages

**What to do:**

- Create `/login` page with email/password form
- Create `/register` page with email/password/name form
- Form validation (required fields, email format, password match)
- API integration (call backend endpoints)
- Store JWT in httpOnly cookie or secure storage
- Create auth context/provider for state management
- Redirect to dashboard after login

**Result:** Can register a new user from the UI, then login and be redirected to `/dashboard`.

**Screenshots needed:** Login page, Register page

---

### Sprint 2 Checkpoint ✅

**Verify:**

- [ ] Register from UI → user created in DB
- [ ] Login from UI → JWT received, redirected to dashboard
- [ ] Protected routes return 401 without token
- [ ] Admin routes return 403 for regular users
- [ ] OpenNebula Sunstone UI accessible (RSI)
- [ ] Can create VM from Sunstone (RSI)

**Report Action:** Add screenshots to chapter2.tex. The diagrams are already included.

---

## Sprint 3 — Week 3

### Task T-3.1: User Service CRUD

**What to do:**

- `GET /users` — list all users (admin only)
- `GET /users/:id` — get user details
- `PUT /users/:id` — update user
- `DELETE /users/:id` — delete user (admin only)
- Add pagination to list endpoint

**Result:** Postman shows all CRUD operations working with proper auth.

---

### Task T-3.2: Admin User Management

**What to do:**

- Add `PATCH /users/:id/ban` — ban/unban user
- Add user search/filter endpoints
- Return user's VM count and plan info

**Result:** Admin can list, search, and ban users via API.

---

### Task T-3.3: Dashboard Layout

**What to do:**

- Create `/dashboard` layout with:
  - Sidebar (nav links: Dashboard, VMs, Billing, Profile, Admin)
  - Top header (user name, notifications bell, logout)
  - Main content area
- Make sidebar collapsible on mobile
- Create dashboard home with stats cards (Total VMs, Active VMs, Plan name, Quota usage)

**Result:** Dashboard loads with sidebar + header + stats. Responsive design works.

**Screenshot needed:** Dashboard layout

---

### Task T-3.4: Profile Page

**What to do:**

- Create `/dashboard/profile` page
- Display user info (name, email, join date)
- Edit form (first name, last name)
- Change password form
- API integration

**Result:** User can view and edit their profile.

---

### Task T-3.11: SSH Key Management

**What to do:**

- Create `ssh_keys` table in Prisma schema:
  ```prisma
  model SshKey {
    id        String   @id @default(uuid())
    name      String
    publicKey String
    userId    String
    user      User     @relation(fields: [userId], references: [id])
    createdAt DateTime @default(now())
  }
  ```
- Backend endpoints:
  - `GET /users/me/ssh-keys` — list user's SSH keys
  - `POST /users/me/ssh-keys` — add new SSH key (name + public key)
  - `DELETE /users/me/ssh-keys/:id` — delete an SSH key
- Frontend: Add "SSH Keys" tab/section on the profile page
  - List existing keys (name, fingerprint, created date, delete button)
  - "Add SSH Key" button → modal with name + public key textarea
  - Validate key format (must start with `ssh-rsa`, `ssh-ed25519`, etc.)
- When a VM is created, the worker injects the user's SSH keys into the VM via cloud-init or OpenNebula contextualization

**Result:** User can add SSH keys from their profile. Keys are stored in DB. When creating a VM, keys are injected into the VM so the user can connect.

**Screenshot needed:** SSH key management page (list + add modal)

---

### Task T-3.5: Admin User List Page

**What to do:**

- Create `/dashboard/admin/users` page
- Table with columns: Name, Email, Role, Plan, VMs count, Status, Actions
- Actions: View, Ban, Delete (with confirmation modal)
- Search bar + filters

**Result:** Admin sees user list, can ban/delete users.

**Screenshot needed:** Admin user management page

---

### Task T-3.6: NATS JetStream Setup

**What to do:**

- Add NATS container to Docker Compose with JetStream enabled
- Install `nats` npm package in NestJS services
- Create JetStream streams: `VM_OPERATIONS`, `VM_STATUS`
- Test publish/subscribe between services

**Result:** Can publish a message from VM service and receive it in worker (test with console.log).

---

### Sprint 3 Checkpoint ✅

**Verify:**

- [ ] Admin can manage users from the web UI
- [ ] Dashboard layout renders correctly
- [ ] Profile page works
- [ ] NATS JetStream pub/sub working
- [ ] **SSH key CRUD works from profile page**
- [ ] Firewall rules active (RSI) — port scan shows only allowed ports
- [ ] OpenNebula API responds to XML-RPC calls (RSI)

**Report Action:** Uncomment `\input{chapters/chapter3}` in `main.tex`. Add screenshots.

---

## Sprint 4 — Week 4

### Task T-4.1: VM Service — Create VM Endpoint

**What to do:**

- `POST /vms` endpoint
- Accept: `{ name, templateId, vcpu, ram, disk }`
- Validate user quota (check count vs plan limit)
- Save VM to DB with status `PENDING`
- Publish `vm.create` event to JetStream with VM details
- Return 202 Accepted

**Result:** Postman POST creates a VM record in DB with status PENDING and publishes event.

---

### Task T-4.2: Python Worker Setup

**What to do:**

- Create Python project in `worker/` directory
- Install: `nats-py`, `redis`, `pyone`, `python-dotenv`
- Connect to NATS JetStream as consumer
- Connect to Redis for state caching
- Subscribe to `VM_OPERATIONS` stream

**Result:** Worker starts, connects to NATS and Redis, logs "Worker ready. Listening for events..."

---

### Task T-4.3: Worker — Create VM via OpenNebula

**What to do:**

- On `vm.create` event:
  - Call OpenNebula XML-RPC API to instantiate template
  - Pass CPU, RAM, disk parameters
  - Get back VM ID and IP
  - Publish `vm.status.update` event (status: RUNNING, ipAddress, oneId)
- Handle errors — publish ERROR status if creation fails

**Result:** When event published, worker creates VM in OpenNebula, and VM status updates to RUNNING in DB.

---

### Task T-4.4: Worker — Start/Stop/Reboot

**What to do:**

- On `vm.start` → call `one.vm.action('resume', vm_id)`
- On `vm.stop` → call `one.vm.action('poweroff', vm_id)`
- On `vm.reboot` → call `one.vm.action('reboot', vm_id)`
- Publish status updates after each operation

**Result:** VM operations reflect in OpenNebula Sunstone and in the database.

---

### Task T-4.5: Worker — Delete VM

**What to do:**

- On `vm.delete` → call `one.vm.action('terminate-hard', vm_id)`
- Update DB status to DELETED
- Update user quota (decrement)

**Result:** VM removed from OpenNebula and marked as deleted in DB.

---

### Task T-4.6: VM Creation Form

**What to do:**

- Create `/dashboard/vms/create` page
- Form fields: VM name, OS template (dropdown), CPU cores (1-4), RAM (512MB-4GB), Disk (10-100GB)
- Show estimated quota impact
- Submit button calls API
- Show loading state while VM is being created
- Redirect to VM list after creation

**Result:** User fills form, submits, sees loading, then redirected to VM list showing new VM.

**Screenshot needed:** VM creation form

---

### Task T-4.7: VM List Page

**What to do:**

- Create `/dashboard/vms` page
- Table with: Name, Status (badge), OS, CPU, RAM, IP, Created, Actions
- Status badges with colors (Running=green, Stopped=yellow, Pending=blue, Error=red)
- Actions: Start, Stop, Reboot, Delete

**Result:** User sees all their VMs in a table with status and action buttons.

**Screenshot needed:** VM list page

---

### Sprint 4 Checkpoint ✅ (MAJOR)

**Verify:**

- [ ] Create VM from web UI → VM appears in OpenNebula
- [ ] Stop VM from web UI → VM stops in OpenNebula
- [ ] Start VM from web UI → VM starts in OpenNebula
- [ ] Delete VM from web UI → VM removed from OpenNebula
- [ ] Status updates reflected in real-time

**Report Action:** Add screenshots and verify chapter3.tex diagrams match your implementation.

---

## Sprint 5 — Week 5

### Task T-5.1: VM Detail Page

**What to do:**

- Create `/dashboard/vms/[id]` page
- Show: VM name, status, IP address, OS, CPU, RAM, disk, created date, uptime
- Stats cards at the top
- Action buttons (Start/Stop/Reboot/Delete)
- **"Terminal" button** that opens the web-based CLI console (Phase 1)

**Result:** Clicking a VM in the list shows the detail page with all info and a terminal access button.

**Screenshot needed:** VM detail page

---

### Task T-5.2: VM Action Buttons with Confirmation

**What to do:**

- Add confirmation modals for destructive actions (Stop, Reboot, Delete)
- Show loading spinners during operations
- Toast notifications on success/failure
- Disable buttons for invalid state transitions (e.g., can't stop an already stopped VM)

**Result:** Actions show confirmation, execute, and show toast feedback.

---

### Task T-5.10: Web Terminal (CLI Access — Phase 1)

**What to do:**

This is the **Phase 1** VM access method — users get a command-line terminal in the browser.

**Backend (WebSocket SSH Proxy):**

- Install `ssh2` npm package in the gateway/VM service
- Create a WebSocket endpoint: `WS /vms/:id/terminal`
- On connection:
  1. Verify JWT token from the WebSocket handshake
  2. Look up the VM's IP address from the database
  3. Fetch the user's SSH keys from the database
  4. Open an SSH connection to the VM using `ssh2` library with the user's private key or the platform's injected key
  5. Pipe the SSH session's stdin/stdout bidirectionally through the WebSocket

```typescript
// Simplified WebSocket SSH proxy (NestJS gateway)
@WebSocketGateway({ path: "/vms/terminal" })
export class TerminalGateway {
  @SubscribeMessage("connect")
  async handleConnect(client: Socket, payload: { vmId: string }) {
    const vm = await this.vmService.findOne(payload.vmId);
    const conn = new Client(); // ssh2 Client
    conn.connect({
      host: vm.ipAddress,
      username: "root",
      privateKey: platformPrivateKey,
    });
    conn.on("ready", () => {
      conn.shell((err, stream) => {
        // Pipe WebSocket ↔ SSH stream
        client.on("data", (data) => stream.write(data));
        stream.on("data", (data) => client.emit("data", data));
      });
    });
  }
}
```

**Frontend (xterm.js):**

- Install: `npm install xterm @xterm/addon-fit @xterm/addon-web-links socket.io-client`
- Create `/dashboard/vms/[id]/terminal` page (or modal)
- Initialize xterm.js terminal instance
- Connect to WebSocket endpoint
- Pipe terminal input → WebSocket → SSH → VM
- Pipe VM output → SSH → WebSocket → terminal display

```typescript
// Simplified xterm.js setup
import { Terminal } from "xterm";
import { FitAddon } from "@xterm/addon-fit";
import { io } from "socket.io-client";

const term = new Terminal({
  cursorBlink: true,
  theme: { background: "#1e1e1e" },
});
const fitAddon = new FitAddon();
term.loadAddon(fitAddon);
term.open(document.getElementById("terminal"));
fitAddon.fit();

const socket = io("/vms/terminal", { auth: { token: jwt } });
socket.emit("connect", { vmId });
socket.on("data", (data) => term.write(data));
term.onData((data) => socket.emit("data", data));
```

**OpenNebula VM prep (RSI):**

- Ensure VMs have SSH server (openssh-server) installed and running
- Configure OpenNebula contextualization to inject the platform's public key into VMs on creation
- Ensure VM network allows SSH connections from the platform server

**Result:** User clicks "Terminal" on a VM detail page → a black terminal appears in the browser → user can type Linux commands and see output in real time. It's like using PuTTY/SSH but inside the web browser.

**Screenshot needed:** Web terminal showing a command being run inside a VM

**Note:** This is Phase 1. Phase 2 (future) will upgrade this to full desktop streaming via VNC/noVNC where users see the entire graphical OS (like Windows desktop or Linux with GNOME/KDE).

---

### Task T-5.3–T-5.4: Quota System

**What to do:**

- Create `user_quotas` table
- Track: usedVMs, usedCPU, usedRAM, usedDisk per user
- On VM creation: check quota limits before proceeding
- On VM deletion: decrement quota usage
- Return 403 with "Quota exceeded" if limit reached

**Result:** User with Free plan (max 2 VMs) cannot create a 3rd VM. Gets error message.

---

### Task T-5.5: Admin VM Management

**What to do:**

- Create `/dashboard/admin/vms` page
- Table showing ALL VMs across ALL users
- Columns: VM Name, Owner, Status, CPU, RAM, IP
- Filter by user, status
- Admin can force-delete any VM

**Result:** Admin sees all platform VMs, can filter and take action.

---

### Task T-5.6: Quota Display

**What to do:**

- Add quota usage bar to dashboard home
- Show: "VMs: 2/3 used", "CPU: 4/8 cores", "RAM: 2048/4096 MB"
- Color code: green (<50%), yellow (50-80%), red (>80%)

**Result:** Dashboard shows visual quota bars with usage percentages.

**Screenshot needed:** Quota display on dashboard

---

### Sprint 5 Checkpoint ✅

**Verify:**

- [ ] VM detail page shows correct info
- [ ] VM actions with confirmation work
- [ ] **Web terminal (CLI) connects to VM and shows shell**
- [ ] Quota blocks over-limit VM creation
- [ ] Admin can see and manage all VMs
- [ ] Quota bars display on dashboard

**Report Action:** Uncomment `\input{chapters/chapter4}` in `main.tex`. Add screenshots.

---

## Sprint 6 — Week 6

### Task T-6.1: Plans CRUD

**What to do:**

- Create plans table and seed with:
  - Free: 2 VMs, 2 CPU, 2GB RAM, 20GB disk, $0/mo
  - Pro: 5 VMs, 8 CPU, 8GB RAM, 100GB disk, $19/mo
  - Enterprise: 20 VMs, 32 CPU, 32GB RAM, 500GB disk, $79/mo
- Admin CRUD endpoints: `GET/POST/PUT/DELETE /plans`

**Result:** Plans exist in DB and accessible via API.

---

### Task T-6.2: Payment Processing

**What to do:**

- Option A (Stripe): Install `stripe` npm package, create checkout sessions
- Option B (Mock): Create mock payment endpoint that always succeeds
- `POST /payments/checkout` — create payment session
- Webhook/callback endpoint to process payment result
- On success: update user's plan and quota limits

**Result:** Payment flow completes and user's plan gets upgraded.

---

### Task T-6.3: Billing Page

**What to do:**

- Create `/dashboard/billing` page
- Show current plan name, price, features
- Quota usage summary
- "Upgrade" button

**Result:** User sees their plan info and can initiate upgrade.

**Screenshot needed:** Billing page

---

### Task T-6.4: Checkout Flow

**What to do:**

- Plan comparison page (all 3 plans side by side)
- Highlight current plan
- "Select" button on upgradeable plans
- Payment form (Stripe Elements or mock form)
- Success/failure page after payment

**Result:** Full flow from plan selection to payment to upgraded plan.

**Screenshot needed:** Checkout flow

---

### Task T-6.5: Payment History

**What to do:**

- Create `/dashboard/billing/history` page
- Table: Date, Amount, Plan, Status, Invoice link
- Pagination

**Result:** User sees their past payments.

**Screenshot needed:** Payment history

---

### Task T-6.6: Admin Plan Management

**What to do:**

- Create `/dashboard/admin/plans` page
- CRUD interface for plans
- Edit plan features, prices
- Activate/deactivate plans

**Result:** Admin can manage plans from the UI.

---

### Sprint 6 Checkpoint ✅

**Verify:**

- [ ] Plans exist and display correctly
- [ ] Payment checkout flow works (mock or Stripe test)
- [ ] User's plan upgrades after payment
- [ ] Quota limits update after plan change
- [ ] Payment history shows transactions

**Report Action:** Add screenshots to chapter4.tex.

---

## Sprint 7 — Week 7

### Task T-7.1–T-7.2: Notification Service

**What to do:**

- Create notification service (NestJS)
- Subscribe to JetStream VM status events
- Save notifications to DB
- `GET /notifications` — user's notifications
- `PATCH /notifications/:id/read` — mark as read
- Frontend: notification bell in header, dropdown with unread count

**Result:** When VM status changes, user sees notification in the bell dropdown.

**Screenshot needed:** Notification panel

---

### Task T-7.3: Error Handling

**What to do:**

- Global exception filter in each NestJS service
- Frontend: error boundary component
- User-friendly error messages (not raw errors)
- Toast notifications for errors

**Result:** Errors show user-friendly messages, no crashes.

---

### Task T-7.4: UI Polish

**What to do:**

- Add loading skeletons to all pages
- Add page transitions/animations
- Add dark mode toggle (optional but impressive)
- Review all pages for consistency
- Fix any responsive issues

**Result:** Smooth, professional-looking UI with no layout issues.

---

### Task T-7.5–T-7.6: Integration Testing + Bug Fixes

**What to do:**

- Test every flow end-to-end manually
- Use the test scenarios from chapter5.tex table (16 scenarios now including terminal + SSH keys)
- Document any bugs, fix them
- Re-test after fixes

**Result:** All 16+ test scenarios pass. No critical bugs.

---

### Sprint 7 Checkpoint ✅

**Verify:**

- [ ] Notifications working for VM status changes
- [ ] All pages have loading states
- [ ] No visual bugs or broken layouts
- [ ] All integration tests pass

**Report Action:** Uncomment `\input{chapters/chapter5}` in `main.tex`. Add screenshots.

---

## Sprint 8 — Week 8

### Task T-8.1: Production Docker Builds

**What to do:**

- Create multi-stage Dockerfiles for each service:
  - Build stage + Production stage (smaller image)
- Optimize Next.js build (`next build` + standalone mode)
- Create `docker-compose.prod.yml` with production settings

**Result:** `docker-compose -f docker-compose.prod.yml build` succeeds. Images are small.

---

### Task T-8.2: Deploy All Services

**What to do:**

- Copy project to server (or git pull)
- Run `docker-compose -f docker-compose.prod.yml up -d`
- Configure Nginx as reverse proxy (optional)
- Set up proper environment variables

**Result:** All services running on the server. Platform accessible from browser.

---

### Task T-8.3: Final Testing

**What to do:**

- Run all integration tests against the deployed platform
- Test from a different machine/browser
- Verify all features work in production

**Result:** Platform fully functional in production.

**Screenshot needed:** Docker containers running, final dashboard

---

### Task T-8.4–T-8.5: Report & Presentation

**What to do:**

- Review all LaTeX chapters, fix any issues
- Add all remaining screenshots
- Write general conclusion
- Create presentation slides (10-15 slides)
- Prepare demo script (5 min walkthrough)

**Result:** Complete report PDF, presentation slides, demo ready.

---

### Sprint 8 Checkpoint ✅ (FINAL)

**Verify:**

- [ ] Platform deployed and accessible
- [ ] All features working in production
- [ ] Report complete (all 5 chapters)
- [ ] Presentation slides ready
- [ ] Demo script rehearsed

---

## Summary: What to Do After Each Sprint

| Sprint       | What to Add to Report                                              |
| ------------ | ------------------------------------------------------------------ |
| Sprint 0     | Nothing yet (setup phase)                                          |
| Sprint 1 + 2 | Uncomment `\input{chapters/chapter2}`, add screenshots, export PDF |
| Sprint 3 + 4 | Uncomment `\input{chapters/chapter3}`, add screenshots             |
| Sprint 5 + 6 | Uncomment `\input{chapters/chapter4}`, add screenshots             |
| Sprint 7 + 8 | Uncomment `\input{chapters/chapter5}`, add conclusion, finalize    |

Each time you add a chapter, just uncomment the `\input` line in `main.tex` and replace the placeholder boxes with your actual screenshots using:

```latex
\includegraphics[width=\textwidth]{images/your-screenshot.png}
```

Put all screenshots in an `images/` folder inside `rapport_latex/`.
