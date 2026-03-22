"use client";

import { useEffect, useRef } from "react";
import { io, Socket } from "socket.io-client";
import Cookies from "js-cookie";

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
): React.RefObject<Socket | null> {
  const socketRef = useRef<Socket | null>(null);
  const callbackRef = useRef(onStatusUpdate);
  callbackRef.current = onStatusUpdate;

  useEffect(() => {
    const token = Cookies.get("accessToken");
    if (!token) return;

    const wsUrl =
      process.env.NEXT_PUBLIC_VM_WS_URL || "http://localhost:3004";

    const socket = io(`${wsUrl}/vm-events`, {
      transports: ["websocket"],
      auth: { token },
      reconnection: true,
      reconnectionDelay: 2000,
      reconnectionAttempts: 15,
    });

    socketRef.current = socket;

    socket.on("vm:status", (data: VmStatusUpdate) => {
      callbackRef.current?.(data);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  return socketRef;
}
