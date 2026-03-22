# OpenNebula Setup Guide for CloudVM Platform

## Overview

The CloudVM platform communicates with OpenNebula via **XML-RPC** (using the `pyone` Python library).  
The Python worker (`worker/`) handles all OpenNebula operations asynchronously through NATS messages.

---

## Prerequisites

| Component       | Version    | Notes                                |
| --------------- | ---------- | ------------------------------------ |
| OpenNebula      | 6.x+       | Front-end with Sunstone              |
| KVM Hypervisor  | Host node  | At least 1 compute node              |
| Virtual Network | Configured | Bridge or VXLAN with DHCP/static IPs |
| Image Datastore | Configured | For OS disk images                   |

---

## Step 1 — Create an API User

Create a dedicated OpenNebula user for the platform (avoid using `oneadmin` in production):

```bash
# On the OpenNebula front-end server:
oneuser create cloudvm-api 'YourSecurePassword123!' --driver core
oneuser chgrp cloudvm-api oneadmin  # Give admin group access
```

Save the credentials — you'll need them for `.env`:

```
ONE_XMLRPC=http://<OPENNEBULA_IP>:2633/RPC2
ONE_AUTH_TOKEN=cloudvm-api:YourSecurePassword123!
```

---

## Step 2 — Upload OS Images

Download cloud-ready images and upload them to your datastore:

```bash
# Ubuntu 22.04 (cloud image)
wget https://cloud-images.ubuntu.com/jammy/current/jammy-server-cloudimg-amd64.img

oneimage create \
  --name "Ubuntu 22.04" \
  --path /path/to/jammy-server-cloudimg-amd64.img \
  --driver qcow2 \
  --prefix vd \
  --datastore $DATASTORE_ID \
  --type OS

# Debian 12
wget https://cloud.debian.org/images/cloud/bookworm/latest/debian-12-generic-amd64.qcow2

oneimage create \
  --name "Debian 12" \
  --path /path/to/debian-12-generic-amd64.qcow2 \
  --driver qcow2 \
  --prefix vd \
  --datastore $DATASTORE_ID \
  --type OS

# CentOS Stream 9
wget https://cloud.centos.org/centos/9-stream/x86_64/images/CentOS-Stream-GenericCloud-9-latest.x86_64.qcow2

oneimage create \
  --name "CentOS Stream 9" \
  --path /path/to/CentOS-Stream-GenericCloud-9-latest.x86_64.qcow2 \
  --driver qcow2 \
  --prefix vd \
  --datastore $DATASTORE_ID \
  --type OS
```

Wait for images to become `READY`:

```bash
oneimage list
```

---

## Step 3 — Create VM Templates

Run the provided setup script:

```bash
# Copy the script to your OpenNebula front-end:
scp scripts/opennebula/setup-templates.sh oneadmin@<ONE_SERVER>:~/

# SSH into the server and run it:
ssh oneadmin@<ONE_SERVER>
export NETWORK_ID=0       # Your virtual network ID
export DATASTORE_ID=1     # Your image datastore ID
bash setup-templates.sh
```

Or create templates manually via Sunstone (web UI) — use the same CONTEXT block from the script.

### Important: Contextualization

Each template includes a **START_SCRIPT** that runs at first boot:

- Enables SSH password authentication (required for the web terminal)
- Creates a `cloudvm` user with sudo access
- Default password: `cloudvm123`
- Injects SSH public keys from user profile

The base64-encoded script in the template is the content of `vm-init.sh`. If you need to customize it:

```bash
# Encode your modified init script:
base64 -w 0 scripts/opennebula/vm-init.sh
# Paste the output into the template's START_SCRIPT_BASE64 field
```

---

## Step 4 — Network Configuration

Ensure your virtual network provides:

- **IP assignment** (either DHCP or IP pool with AR ranges)
- **Internet access** (for package installation inside VMs)
- **Reachability from the platform server** (for SSH terminal access)

Example network creation:

```bash
cat <<EOF | onevnet create
NAME    = "cloudvm-net"
VN_MAD  = "bridge"
BRIDGE  = "br0"
AR = [
  TYPE = "IP4",
  IP   = "192.168.1.100",
  SIZE = "50"
]
DNS = "8.8.8.8"
GATEWAY = "192.168.1.1"
EOF
```

Note the network ID and update:

1. The VM templates (`NETWORK_ID`)
2. Your `.env` file if needed

---

## Step 5 — Configure the Platform

Update your `.env` file with OpenNebula connection details:

```env
# OpenNebula
ONE_XMLRPC=http://192.168.1.10:2633/RPC2
ONE_AUTH_TOKEN=cloudvm-api:YourSecurePassword123!
```

These values are used by the Python worker to connect to OpenNebula.

---

## Step 6 — Verify Connection

Test the connection from your development machine:

```python
import pyone
server = pyone.OneServer(
    "http://<ONE_IP>:2633/RPC2",
    session="cloudvm-api:YourSecurePassword123!"
)

# List templates
templates = server.templatepool.info(-2, -1, -1, -1)
for t in templates.VMTEMPLATE:
    print(f"  ID={t.ID} NAME={t.NAME}")

# Check host pool
hosts = server.hostpool.info()
for h in hosts.HOST:
    print(f"  Host: {h.NAME} State: {h.STATE}")
```

---

## Architecture Flow

```
User clicks "Create VM"
        │
        ▼
  Frontend (Next.js)
        │ POST /api/vms
        ▼
  API Gateway (:3001)
        │
        ▼
  VM Service (:3004)
        │ Saves to DB (status=CREATING)
        │ Publishes to NATS: vm.create
        ▼
  Python Worker
        │ pyone.OneServer.templatepool.instantiate(...)
        │ Polls for IP address
        │ Updates DB directly (status=RUNNING, ipAddress=...)
        ▼
  OpenNebula Front-end
        │ XML-RPC → KVM Host
        ▼
  VM runs on KVM hypervisor
        │
  User opens Terminal → Socket.IO → VM Service
        │ ssh2 connection → VM IP:22
        ▼
  Interactive shell in browser (xterm.js)
```

---

## Template-to-Code Mapping

The `osTemplate` field in the `POST /api/vms` request maps to OpenNebula template names:

| Platform Value | OpenNebula Template Name | Image Required    |
| -------------- | ------------------------ | ----------------- |
| `ubuntu-22.04` | `ubuntu-22.04`           | `Ubuntu 22.04`    |
| `ubuntu-20.04` | `ubuntu-20.04`           | `Ubuntu 20.04`    |
| `debian-12`    | `debian-12`              | `Debian 12`       |
| `centos-9`     | `centos-9`               | `CentOS Stream 9` |
| `rocky-9`      | `rocky-9`                | `Rocky Linux 9`   |
| `almalinux-9`  | `almalinux-9`            | `AlmaLinux 9`     |

The worker resolves the template by name:

```python
# worker/vm_handler.py
templates = self.one.templatepool.info(-2, -1, -1, -1)
for t in templates.VMTEMPLATE:
    if t.NAME == os_template:
        template_id = t.ID
        break
```

---

## Troubleshooting

| Problem                    | Solution                                                         |
| -------------------------- | ---------------------------------------------------------------- |
| `pyone` connection refused | Check `ONE_XMLRPC` URL and firewall (port 2633)                  |
| Auth error                 | Verify `ONE_AUTH_TOKEN` format: `user:password`                  |
| VM stuck in PENDING        | Check host resources: `onehost list`, check `SCHED_REQUIREMENTS` |
| No IP assigned             | Check virtual network AR + DHCP, run `onevm show <ID>`           |
| SSH timeout from terminal  | Ensure VM network reachable from platform, check `vm-init.sh`    |
| Template not found         | Verify template name matches exactly (case-sensitive)            |
| Image not READY            | Wait for upload: `oneimage list`, check datastore space          |
