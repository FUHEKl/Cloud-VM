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
  send: (data: ArrayBuffer | string) => void;
  close: () => void;
};

export default function VncViewer({ vmId, onDisconnect, token }: VncViewerProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const rfbRef = useRef<RfbClient | null>(null);
  const wsAdapterRef = useRef<FakeWebSocket | null>(null);
  const [status, setStatus] = useState<ViewerStatus>("connecting");
  const [errorMsg, setErrorMsg] = useState("");

  const initNoVnc = async () => {
    try {
      const { default: RFB } = await import("@novnc/novnc");
      if (!canvasRef.current) return;

      const fakeWs = createFakeWebSocket((data) => sendData(data));
      wsAdapterRef.current = fakeWs;

      const rfb = new RFB(canvasRef.current, fakeWs as unknown as string, {}) as RfbClient;
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
      const message = new MessageEvent("message", { data: data.buffer });
      wsAdapterRef.current?.dispatchEvent(message);
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

  useEffect(() => {
    return () => {
      rfbRef.current?.disconnect();
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

function createFakeWebSocket(sendData: (data: Uint8Array) => void): FakeWebSocket {
  const et = new EventTarget() as FakeWebSocket;

  et.readyState = WebSocket.CONNECTING;
  et.binaryType = "arraybuffer";

  et.send = (data: ArrayBuffer | string) => {
    const buf =
      typeof data === "string"
        ? new TextEncoder().encode(data)
        : new Uint8Array(data);
    sendData(buf);
  };

  et.close = () => {
    et.readyState = WebSocket.CLOSED;
  };

  setTimeout(() => {
    et.readyState = WebSocket.OPEN;
    et.dispatchEvent(new Event("open"));
  }, 50);

  return et;
}
