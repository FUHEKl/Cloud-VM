"use client";

import { useEffect, useRef, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import { resolveVmWsOrigin } from "@/lib/runtime-urls";

interface UseVncSocketOptions {
  vmId: string;
  onReady: () => void;
  onData: (data: Uint8Array) => void;
  onClose: () => void;
  onError: (msg: string) => void;
  token?: string;
}

export function useVncSocket({
  vmId,
  onReady,
  onData,
  onClose,
  onError,
  token,
}: UseVncSocketOptions) {
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const wsUrl = resolveVmWsOrigin();

    const socket = io(`${wsUrl}/vnc`, {
      transports: ["websocket"],
      path: "/vnc/socket.io",
      withCredentials: true,
      auth: token ? { token } : undefined,
      query: { vmId },
      secure: typeof window !== "undefined" && window.location.protocol === "https:",
    });

    socketRef.current = socket;

    socket.on("vnc:ready", onReady);
    socket.on("vnc:close", onClose);
    socket.on("vnc:error", (msg: string) => onError(msg));

    socket.on("vnc:data", (data: ArrayBuffer | Buffer) => {
      const buffer = data instanceof ArrayBuffer ? data : data.buffer;
      onData(new Uint8Array(buffer));
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vmId, token]);

  const sendData = useCallback((data: Uint8Array) => {
    socketRef.current?.emit("vnc:data", data);
  }, []);

  return { sendData };
}
