"use client";

import { useEffect, useRef, useState } from "react";
import { useVncSocket } from "@/hooks/useVncSocket";

interface VncViewerProps {
  vmId: string;
  onDisconnect?: () => void;
  token?: string;
}

type ViewerStatus = "connecting" | "ready" | "error" | "closed";

type RfbDisconnectDetail = {
  clean?: boolean;
  reason?: string;
};

type RfbDisconnectEvent = Event & { detail?: RfbDisconnectDetail };

type RfbClient = {
  scaleViewport: boolean;
  resizeSession: boolean;
  viewOnly: boolean;
  disconnect: () => void;
  addEventListener: (type: string, listener: (event: Event) => void) => void;
};

type FakeWebSocket = EventTarget & {
  readyState: number;
  binaryType: string;
  protocol: string;
  send: (data: ArrayBuffer | SharedArrayBuffer | string) => void;
  close: () => void;
};

export default function VncViewer({ vmId, onDisconnect, token }: VncViewerProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const rfbRef = useRef<RfbClient | null>(null);
  const wsAdapterRef = useRef<FakeWebSocket | null>(null);
  const sendDataRef = useRef<((data: Uint8Array) => void) | null>(null);
  // ── FIX: buffer vnc:data events that arrive before the fakeWs is ready ──
  const pendingDataRef = useRef<(ArrayBuffer | SharedArrayBuffer)[]>([]);
  const [status, setStatus] = useState<ViewerStatus>("connecting");
  const [errorMsg, setErrorMsg] = useState("");

  const initNoVnc = async () => {
    try {
      const { default: RFB } = await import("@novnc/novnc");
      if (!canvasRef.current) return;

      const fakeWs = createFakeWebSocket(
        (data) => sendDataRef.current?.(data),
        // ── FIX: flush any data that arrived before the adapter was set ──
        () => {
          const pending = pendingDataRef.current.splice(0);
          for (const buffered of pending) {
            fakeWs.dispatchEvent(new MessageEvent("message", { data: buffered }));
          }
        },
      );

      wsAdapterRef.current = fakeWs;

      const rfb = new RFB(canvasRef.current, fakeWs, {}) as RfbClient;
      rfb.scaleViewport = true;
      rfb.resizeSession = false;
      rfb.viewOnly = false;

      rfb.addEventListener("connect", () => setStatus("ready"));
      rfb.addEventListener("disconnect", (event: Event) => {
        const detail = (event as RfbDisconnectEvent).detail;
        const clean = Boolean(detail?.clean);
        const reason = detail?.reason || "Disconnected";
        setStatus(clean ? "closed" : "error");
        setErrorMsg(reason);
        onDisconnect?.();
      });

      rfbRef.current = rfb;
    } catch (error) {
      setStatus("error");
      setErrorMsg((error as Error).message);
    }
  };

  const { sendData } = useVncSocket({
    vmId,
    token,
    onReady: () => {
      initNoVnc();
    },
    onData: (data) => {
      const arrayBuffer = data.buffer.slice(
        data.byteOffset,
        data.byteOffset + data.byteLength,
      );

      if (wsAdapterRef.current) {
        // Adapter is ready — dispatch immediately
        const message = new MessageEvent("message", { data: arrayBuffer });
        wsAdapterRef.current.dispatchEvent(message);
      } else {
        // ── FIX: adapter not ready yet (dynamic import still loading) ──
        // Buffer the data; it will be flushed once createFakeWebSocket fires
        // its onOpen callback, which happens 50 ms after the adapter is created.
        pendingDataRef.current.push(arrayBuffer);
      }
    },
    onClose: () => {
      setStatus("closed");
      onDisconnect?.();
    },
    onError: (msg) => {
      setStatus("error");
      setErrorMsg(msg);
    },
  });

  sendDataRef.current = sendData;

  useEffect(() => {
    return () => {
      rfbRef.current?.disconnect();
      // Clear any buffered data on unmount
      pendingDataRef.current = [];
    };
  }, []);

  return (
    <div className="relative w-full h-full bg-black rounded-lg overflow-hidden">
      {status !== "ready" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-10 bg-black/80">
          {status === "connecting" && (
            <>
              <div className="w-8 h-8 border-2 border-cyber-cyan border-t-transparent rounded-full animate-spin mb-3" />
              <p className="text-white/70 text-sm">Connecting to desktop…</p>
            </>
          )}
          {status === "error" && (
            <>
              <span className="text-red-400 text-2xl mb-2">⚠</span>
              <p className="text-white font-medium">Connection failed</p>
              <p className="text-white/60 text-sm mt-1">{errorMsg}</p>
            </>
          )}
          {status === "closed" && (
            <p className="text-white/60 text-sm">Desktop session closed.</p>
          )}
        </div>
      )}

      <div ref={canvasRef} className="w-full h-full" />
    </div>
  );
}

/**
 * Creates a fake WebSocket adapter that bridges socket.io ↔ noVNC's RFB.
 *
 * @param sendData  Called when noVNC wants to send bytes to the VNC server.
 * @param onOpen    Called after the fake "open" event fires (50 ms delay).
 *                  Use this to flush any data buffered before the adapter
 *                  was wired up, so the initial RFB server greeting is not lost.
 */
function createFakeWebSocket(
  sendData: (data: Uint8Array) => void,
  onOpen?: () => void,
): FakeWebSocket {
  const et = new EventTarget() as FakeWebSocket;

  et.readyState = WebSocket.CONNECTING;
  et.binaryType = "arraybuffer";
  et.protocol = "binary";

  et.send = (data: ArrayBuffer | SharedArrayBuffer | string) => {
    const buf =
      typeof data === "string"
        ? new TextEncoder().encode(data)
        : new Uint8Array(data);
    sendData(buf);
  };

  // noVNC checks for these properties directly — must exist even if null.
  (et as unknown as Record<string, unknown>).onerror = null;
  (et as unknown as Record<string, unknown>).onopen = null;
  (et as unknown as Record<string, unknown>).onmessage = null;
  (et as unknown as Record<string, unknown>).onclose = null;

  et.close = () => {
    et.readyState = WebSocket.CLOSED;
    et.dispatchEvent(new CloseEvent("close", { wasClean: true }));
  };

  setTimeout(() => {
    et.readyState = WebSocket.OPEN;
    et.dispatchEvent(new Event("open"));
    // ── FIX: flush buffered server data AFTER "open" fires so RFB has
    // already registered its "message" listener before we replay the
    // VNC server's initial greeting bytes.
    onOpen?.();
  }, 50);

  return et;
}
