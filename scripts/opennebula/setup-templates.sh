#!/bin/bash
# =================================================
# CloudVM Platform - OpenNebula VM Template Setup
# =================================================
# Run this script on your OpenNebula front-end server
# to create VM templates that work with the platform.
#
# Prerequisites:
#   - OpenNebula 6.x installed and running
#   - oneadmin credentials configured
#   - Network and datastore configured
# =================================================

set -e

# ---------- Configuration ----------
ONE_USER="${ONE_USER:-oneadmin}"
ONE_XMLRPC="${ONE_XMLRPC:-http://localhost:2633/RPC2}"
NETWORK_ID="${NETWORK_ID:-0}"           # Your virtual network ID
DATASTORE_ID="${DATASTORE_ID:-1}"       # Your image datastore ID

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INIT_SCRIPT="${INIT_SCRIPT:-$SCRIPT_DIR/vm-init.sh}"

if [ ! -f "$INIT_SCRIPT" ]; then
  echo "ERROR: vm-init script not found at: $INIT_SCRIPT"
  echo "Set INIT_SCRIPT=/absolute/path/to/vm-init.sh and retry."
  exit 1
fi

if base64 --help 2>/dev/null | grep -q -- '-w'; then
  START_SCRIPT_BASE64="$(base64 -w 0 "$INIT_SCRIPT")"
else
  START_SCRIPT_BASE64="$(base64 "$INIT_SCRIPT" | tr -d '\n')"
fi

echo "=============================================="
echo "  CloudVM - OpenNebula Template Setup"
echo "=============================================="
echo ""
echo "Using XML-RPC: $ONE_XMLRPC"
echo "Network ID:    $NETWORK_ID"
echo "Datastore ID:  $DATASTORE_ID"
echo "Init script:   $INIT_SCRIPT"
echo ""

# ---------- 1. Create Ubuntu 22.04 Template ----------
echo "[1/3] Creating Ubuntu 22.04 LTS template..."

cat <<TMPL_EOF | onetemplate create
NAME   = "ubuntu-22.04"
CPU    = "1"
VCPU   = "1"
MEMORY = "1024"

OS = [
  ARCH = "x86_64",
  BOOT = "disk0"
]

DISK = [
  IMAGE    = "Ubuntu 22.04",
  DRIVER   = "qcow2",
  DEV_PREFIX = "vd"
]

NIC = [
  NETWORK_ID = "$NETWORK_ID",
  MODEL      = "virtio"
]

GRAPHICS = [
  TYPE   = "VNC",
  LISTEN = "0.0.0.0"
]

CONTEXT = [
  NETWORK       = "YES",
  SSH_PUBLIC_KEY = "\$SSH_PUBLIC_KEY",
  USERNAME       = "cloudvm",
  SET_HOSTNAME   = "\$NAME",
  START_SCRIPT_BASE64 = "$START_SCRIPT_BASE64"
]

USER_INPUTS = [
  CPU    = "M|range||1,16|1" ,
  VCPU   = "M|range||1,16|1" ,
  MEMORY = "M|range||512,32768|1024"
]

SCHED_REQUIREMENTS = "HYPERVISOR=\"kvm\""
TMPL_EOF

echo "   ✓ Ubuntu 22.04 template created"

# ---------- 2. Create Debian 12 Template ----------
echo "[2/3] Creating Debian 12 template..."

cat <<TMPL_EOF | onetemplate create
NAME   = "debian-12"
CPU    = "1"
VCPU   = "1"
MEMORY = "1024"

OS = [
  ARCH = "x86_64",
  BOOT = "disk0"
]

DISK = [
  IMAGE    = "Debian 12",
  DRIVER   = "qcow2",
  DEV_PREFIX = "vd"
]

NIC = [
  NETWORK_ID = "$NETWORK_ID",
  MODEL      = "virtio"
]

GRAPHICS = [
  TYPE   = "VNC",
  LISTEN = "0.0.0.0"
]

CONTEXT = [
  NETWORK       = "YES",
  SSH_PUBLIC_KEY = "\$SSH_PUBLIC_KEY",
  USERNAME       = "cloudvm",
  SET_HOSTNAME   = "\$NAME",
  START_SCRIPT_BASE64 = "$START_SCRIPT_BASE64"
]

SCHED_REQUIREMENTS = "HYPERVISOR=\"kvm\""
TMPL_EOF

echo "   ✓ Debian 12 template created"

# ---------- 3. Create CentOS 9 Template ----------
echo "[3/3] Creating CentOS Stream 9 template..."

cat <<TMPL_EOF | onetemplate create
NAME   = "centos-9"
CPU    = "1"
VCPU   = "1"
MEMORY = "1024"

OS = [
  ARCH = "x86_64",
  BOOT = "disk0"
]

DISK = [
  IMAGE    = "CentOS Stream 9",
  DRIVER   = "qcow2",
  DEV_PREFIX = "vd"
]

NIC = [
  NETWORK_ID = "$NETWORK_ID",
  MODEL      = "virtio"
]

GRAPHICS = [
  TYPE   = "VNC",
  LISTEN = "0.0.0.0"
]

CONTEXT = [
  NETWORK       = "YES",
  SSH_PUBLIC_KEY = "\$SSH_PUBLIC_KEY",
  USERNAME       = "cloudvm",
  SET_HOSTNAME   = "\$NAME",
  START_SCRIPT_BASE64 = "$START_SCRIPT_BASE64"
]

SCHED_REQUIREMENTS = "HYPERVISOR=\"kvm\""
TMPL_EOF

echo "   ✓ CentOS Stream 9 template created"

echo ""
echo "=============================================="
echo "  All templates created successfully!"
echo "=============================================="
echo ""
echo "Next steps:"
echo "  1. Upload OS images to your datastore if not already done"
echo "  2. Adjust NETWORK_ID in templates to match your network"
echo "  3. Set your .env ONE_XMLRPC, ONE_USERNAME, and ONE_PASSWORD"
echo ""
