"use client";

import { useEffect, useRef } from "react";
import { io, Socket } from "socket.io-client";
import { saveGeneratedVmSshPrivateKey } from "@/lib/vmSshKeyStore";
import { resolveVmWsOrigin } from "@/lib/runtime-urls";

export interface VmStatusUpdate {
  vmId: string;
  status: string;
  vmName?: string;
  ipAddress?: string;
  oneVmId?: number;
  sshHost?: string;
  error?: string;
}

export interface VmSshKeyUpdate {
  vmId: string;
  privateKey: string;
}

/**
 * Hook that connects to the VM events WebSocket namespace.
 * Authenticates with JWT from cookies and listens for real-time
 * VM status updates. The callback is called whenever a VM status
 * changes (RUNNING, STOPPED, ERROR, DELETED, etc).
 *
 * Usage:
 *   useVmSocket((data) => {
 *     // data.vmId, data.status, data.vmName, etc.
 *   });
 */
export function useVmSocket(
  onStatusUpdate?: (data: VmStatusUpdate) => void,
  onSshKeyUpdate?: (data: VmSshKeyUpdate) => void,
): React.RefObject<Socket | null> {
  const socketRef = useRef<Socket | null>(null);
  const statusCallbackRef = useRef(onStatusUpdate);
  const sshKeyCallbackRef = useRef(onSshKeyUpdate);
  statusCallbackRef.current = onStatusUpdate;
  sshKeyCallbackRef.current = onSshKeyUpdate;

  useEffect(() => {
    // Use the configured WS URL (HTTPS origin when behind Nginx).
    // Socket.IO upgrades to wss:// automatically when origin is https://.
    const wsUrl = resolveVmWsOrigin();

    const socket = io(`${wsUrl}/vm-events`, {
      transports: ["websocket"],
      path: "/vm-events/socket.io",
      withCredentials: true,
      reconnection: true,
      reconnectionDelay: 2000,
      reconnectionAttempts: 15,
      secure: typeof window !== "undefined" && window.location.protocol === "https:",
    });

    socketRef.current = socket;

    socket.on("vm:status", (data: VmStatusUpdate) => {
      statusCallbackRef.current?.(data);
    });

    socket.on("vm:ssh-key", (data: VmSshKeyUpdate) => {
      if (data?.vmId && data?.privateKey) {
        saveGeneratedVmSshPrivateKey(data.vmId, data.privateKey);
      }
      sshKeyCallbackRef.current?.(data);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  return socketRef;
}
