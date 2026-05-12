"use client";

import { useEffect, useRef } from "react";
import { io, Socket } from "socket.io-client";
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
  onGuiReady?: (data: { vmId: string }) => void,
): React.RefObject<Socket | null> {
  const socketRef = useRef<Socket | null>(null);
  const statusCallbackRef = useRef(onStatusUpdate);
  statusCallbackRef.current = onStatusUpdate;
  const guiReadyCallbackRef = useRef(onGuiReady);
  guiReadyCallbackRef.current = onGuiReady;

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

    socket.on("vm:gui-ready", (data: { vmId: string }) => {
      guiReadyCallbackRef.current?.(data);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  return socketRef;
}
