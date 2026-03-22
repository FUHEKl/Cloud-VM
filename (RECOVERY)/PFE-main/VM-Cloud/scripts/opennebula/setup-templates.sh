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

echo "=============================================="
echo "  CloudVM - OpenNebula Template Setup"
echo "=============================================="
echo ""
echo "Using XML-RPC: $ONE_XMLRPC"
echo "Network ID:    $NETWORK_ID"
echo "Datastore ID:  $DATASTORE_ID"
echo ""

# ---------- 1. Create Ubuntu 22.04 Template ----------
echo "[1/3] Creating Ubuntu 22.04 LTS template..."

cat <<'TMPL_EOF' | onetemplate create
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
  SSH_PUBLIC_KEY = "$USER[SSH_PUBLIC_KEY]",
  USERNAME       = "cloudvm",
  SET_HOSTNAME   = "$NAME",
  START_SCRIPT_BASE64 = "IyEvYmluL2Jhc2gKIyBDbG91ZFZNIGluaXQgc2NyaXB0CnNldCAtZQoKIyBFbmFibGUgcGFzc3dvcmQgYXV0aCBmb3IgU1NIIChmb3Igd2ViIHRlcm1pbmFsKQpzZWQgLWkgJ3MvXlBhc3N3b3JkQXV0aGVudGljYXRpb24gbm8vUGFzc3dvcmRBdXRoZW50aWNhdGlvbiB5ZXMvJyAvZXRjL3NzaC9zc2hkX2NvbmZpZwpzZWQgLWkgJ3MvXiNQYXNzd29yZEF1dGhlbnRpY2F0aW9uLiovUGFzc3dvcmRBdXRoZW50aWNhdGlvbiB5ZXMvJyAvZXRjL3NzaC9zc2hkX2NvbmZpZwpzeXN0ZW1jdGwgcmVzdGFydCBzc2hkIHx8IHN5c3RlbWN0bCByZXN0YXJ0IHNzaAoKIyBTZXQgZGVmYXVsdCBwYXNzd29yZCBmb3IgY2xvdWR2bSB1c2VyCmlmIGlkICJjbG91ZHZtIiAmPi9kZXYvbnVsbDsgdGhlbgogIGVjaG8gImNsb3Vkdm06Y2xvdWR2bTEyMyIgfCBjaHBhc3N3ZAogIHVzZXJtb2QgLWFHIHN1ZG8gY2xvdWR2bQpmaQoKIyBJbnN0YWxsIGJhc2ljIHRvb2xzCmFwdC1nZXQgdXBkYXRlIC1xcSAmJiBhcHQtZ2V0IGluc3RhbGwgLXkgLXFxIGN1cmwgd2dldCBnaXQgdmltIG5hbm8gaHRvcAoKZWNobyAiQ2xvdWRWTSBpbml0IGNvbXBsZXRlIg=="
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

cat <<'TMPL_EOF' | onetemplate create
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
  SSH_PUBLIC_KEY = "$USER[SSH_PUBLIC_KEY]",
  USERNAME       = "cloudvm",
  SET_HOSTNAME   = "$NAME",
  START_SCRIPT_BASE64 = "IyEvYmluL2Jhc2gKc2V0IC1lCnNlZCAtaSAncy9eUGFzc3dvcmRBdXRoZW50aWNhdGlvbiBuby9QYXNzd29yZEF1dGhlbnRpY2F0aW9uIHllcy8nIC9ldGMvc3NoL3NzaGRfY29uZmlnCnNlZCAtaSAncy9eI1Bhc3N3b3JkQXV0aGVudGljYXRpb24uKi9QYXNzd29yZEF1dGhlbnRpY2F0aW9uIHllcy8nIC9ldGMvc3NoL3NzaGRfY29uZmlnCnN5c3RlbWN0bCByZXN0YXJ0IHNzaGQgfHwgc3lzdGVtY3RsIHJlc3RhcnQgc3NoCmlmIGlkICJjbG91ZHZtIiAmPi9kZXYvbnVsbDsgdGhlbgogIGVjaG8gImNsb3Vkdm06Y2xvdWR2bTEyMyIgfCBjaHBhc3N3ZAogIHVzZXJtb2QgLWFHIHN1ZG8gY2xvdWR2bQpmaQphcHQtZ2V0IHVwZGF0ZSAtcXEgJiYgYXB0LWdldCBpbnN0YWxsIC15IC1xcSBjdXJsIHdnZXQgZ2l0IHZpbSBuYW5vIGh0b3AKZWNobyAiQ2xvdWRWTSBpbml0IGNvbXBsZXRlIg=="
]

SCHED_REQUIREMENTS = "HYPERVISOR=\"kvm\""
TMPL_EOF

echo "   ✓ Debian 12 template created"

# ---------- 3. Create CentOS 9 Template ----------
echo "[3/3] Creating CentOS Stream 9 template..."

cat <<'TMPL_EOF' | onetemplate create
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
  SSH_PUBLIC_KEY = "$USER[SSH_PUBLIC_KEY]",
  USERNAME       = "cloudvm",
  SET_HOSTNAME   = "$NAME",
  START_SCRIPT_BASE64 = "IyEvYmluL2Jhc2gKc2V0IC1lCnNlZCAtaSAncy9eUGFzc3dvcmRBdXRoZW50aWNhdGlvbiBuby9QYXNzd29yZEF1dGhlbnRpY2F0aW9uIHllcy8nIC9ldGMvc3NoL3NzaGRfY29uZmlnCnNlZCAtaSAncy9eI1Bhc3N3b3JkQXV0aGVudGljYXRpb24uKi9QYXNzd29yZEF1dGhlbnRpY2F0aW9uIHllcy8nIC9ldGMvc3NoL3NzaGRfY29uZmlnCnN5c3RlbWN0bCByZXN0YXJ0IHNzaGQKaWYgaWQgImNsb3Vkdm0iICY+L2Rldi9udWxsOyB0aGVuCiAgZWNobyAiY2xvdWR2bTpjbG91ZHZtMTIzIiB8IGNocGFzc3dkCiAgdXNlcm1vZCAtYUcgd2hlZWwgY2xvdWR2bQpmaQpkbmYgaW5zdGFsbCAteSAtcSBjdXJsIHdnZXQgZ2l0IHZpbSBuYW5vIGh0b3AKZWNobyAiQ2xvdWRWTSBpbml0IGNvbXBsZXRlIg=="
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
echo "  3. Set your .env ONE_XMLRPC and ONE_AUTH_TOKEN"
echo ""
