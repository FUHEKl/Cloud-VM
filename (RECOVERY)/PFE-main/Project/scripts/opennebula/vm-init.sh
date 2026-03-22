#!/bin/bash
# =================================================
# CloudVM - VM Init Script (Contextualization)
# =================================================
# This script runs inside each VM at first boot via
# OpenNebula contextualization. It:
#   1. Enables SSH password auth (for web terminal)
#   2. Creates the 'cloudvm' user with sudo
#   3. Injects SSH public keys from OpenNebula context
#   4. Installs basic development tools
# =================================================

set -e

echo "=== CloudVM Init Script Starting ==="

# ---------- 1. Enable SSH Password Auth ----------
# Required for web terminal (xterm.js → ssh2)
SSHD_CONFIG="/etc/ssh/sshd_config"
if [ -f "$SSHD_CONFIG" ]; then
    sed -i 's/^PasswordAuthentication no/PasswordAuthentication yes/' "$SSHD_CONFIG"
    sed -i 's/^#PasswordAuthentication.*/PasswordAuthentication yes/' "$SSHD_CONFIG"
    sed -i 's/^ChallengeResponseAuthentication no/ChallengeResponseAuthentication yes/' "$SSHD_CONFIG"

    # Restart SSH daemon
    if systemctl is-active sshd &>/dev/null; then
        systemctl restart sshd
    elif systemctl is-active ssh &>/dev/null; then
        systemctl restart ssh
    fi
    echo "  ✓ SSH password authentication enabled"
fi

# ---------- 2. Create cloudvm User ----------
USERNAME="cloudvm"
DEFAULT_PASS="cloudvm123"  # Users should change this via the platform

if ! id "$USERNAME" &>/dev/null; then
    useradd -m -s /bin/bash "$USERNAME"
    echo "  ✓ User '$USERNAME' created"
fi

echo "$USERNAME:$DEFAULT_PASS" | chpasswd
echo "  ✓ Password set for '$USERNAME'"

# Add to sudo/wheel group
if getent group sudo &>/dev/null; then
    usermod -aG sudo "$USERNAME"
elif getent group wheel &>/dev/null; then
    usermod -aG wheel "$USERNAME"
fi
echo "  ✓ Sudo access granted"

# ---------- 3. Inject SSH Keys ----------
USER_HOME="/home/$USERNAME"
SSH_DIR="$USER_HOME/.ssh"
AUTH_KEYS="$SSH_DIR/authorized_keys"

mkdir -p "$SSH_DIR"
chmod 700 "$SSH_DIR"

# From OpenNebula context
if [ -n "$SSH_PUBLIC_KEY" ]; then
    echo "$SSH_PUBLIC_KEY" >> "$AUTH_KEYS"
    echo "  ✓ SSH public key injected from context"
fi

# Also check context CD-ROM
CONTEXT_DEV="/dev/sr0"
CONTEXT_MNT="/mnt/context"
if [ -b "$CONTEXT_DEV" ]; then
    mkdir -p "$CONTEXT_MNT"
    mount -o ro "$CONTEXT_DEV" "$CONTEXT_MNT" 2>/dev/null || true
    if [ -f "$CONTEXT_MNT/context.sh" ]; then
        source "$CONTEXT_MNT/context.sh" 2>/dev/null || true
        if [ -n "$SSH_PUBLIC_KEY" ]; then
            echo "$SSH_PUBLIC_KEY" >> "$AUTH_KEYS"
            echo "  ✓ SSH key from context CD injected"
        fi
    fi
    umount "$CONTEXT_MNT" 2>/dev/null || true
fi

if [ -f "$AUTH_KEYS" ]; then
    sort -u "$AUTH_KEYS" -o "$AUTH_KEYS"
    chmod 600 "$AUTH_KEYS"
    chown -R "$USERNAME:$USERNAME" "$SSH_DIR"
fi

# ---------- 4. Install Dev Tools ----------
echo "  Installing development tools..."
if command -v apt-get &>/dev/null; then
    # Debian/Ubuntu
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -qq
    apt-get install -y -qq curl wget git vim nano htop net-tools unzip build-essential
elif command -v dnf &>/dev/null; then
    # CentOS/Rocky/Alma
    dnf install -y -q curl wget git vim nano htop net-tools unzip gcc gcc-c++ make
elif command -v yum &>/dev/null; then
    yum install -y -q curl wget git vim nano htop net-tools unzip gcc gcc-c++ make
fi
echo "  ✓ Development tools installed"

# ---------- 5. Set Hostname ----------
if [ -n "$SET_HOSTNAME" ]; then
    hostnamectl set-hostname "$SET_HOSTNAME" 2>/dev/null || hostname "$SET_HOSTNAME"
    echo "  ✓ Hostname set to $SET_HOSTNAME"
fi

echo ""
echo "=== CloudVM Init Script Complete ==="
echo "  User: $USERNAME"
echo "  Default Password: $DEFAULT_PASS"
echo "  SSH: Enabled (password + key auth)"
echo ""
