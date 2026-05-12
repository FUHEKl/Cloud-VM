"use client";

import { useEffect, useRef, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import { Terminal as XTerminal } from "xterm";
import { FitAddon } from "xterm-addon-fit";
import { WebLinksAddon } from "xterm-addon-web-links";
import { resolveVmWsOrigin } from "@/lib/runtime-urls";
import "xterm/css/xterm.css";

interface TerminalProps {
  vmId: string;
  ipAddress: string;
  sshUsername?: string | null;
  onDisconnect?: () => void;
}

// ──────────────────────────────────────────────────────────────────────────────
// Main Terminal component
// ──────────────────────────────────────────────────────────────────────────────
export default function Terminal({ vmId, ipAddress, sshUsername, onDisconnect }: TerminalProps) {
  const containerRef  = useRef<HTMLDivElement>(null);
  const termRef       = useRef<XTerminal | null>(null);
  const socketRef     = useRef<Socket | null>(null);
  const fitRef        = useRef<FitAddon | null>(null);
  const connectedRef  = useRef(false);

  const onDisconnectRef = useRef(onDisconnect);
  const vmIdRef         = useRef(vmId);
  useEffect(() => { onDisconnectRef.current = onDisconnect; }, [onDisconnect]);
  useEffect(() => { vmIdRef.current = vmId; }, [vmId]);

  // Called once the socket is open; triggers the SSH connect-ssh event.
  const connect = useCallback(() => {
    if (!socketRef.current || connectedRef.current) return;
    connectedRef.current = true;
    socketRef.current.emit("connect-ssh", {
      vmId: vmIdRef.current,
      username: sshUsername?.trim() || undefined,
    });
    termRef.current?.writeln("\r\n\x1b[32m● Connecting to VM...\x1b[0m\r\n");
  }, [sshUsername]);

  // ── xterm + socket setup ──────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;

    const term      = new XTerminal({
      cursorBlink:  true,
      fontFamily:   '"JetBrains Mono", "Fira Code", monospace',
      fontSize:     14,
      lineHeight:   1.2,
      theme: {
        background:          "#060b18",
        foreground:          "#c0d0e8",
        cursor:              "#00e87b",
        cursorAccent:        "#060b18",
        selectionBackground: "rgba(0,232,123,0.25)",
        black:         "#0a0f1e",
        red:           "#ff4757",
        green:         "#00e87b",
        yellow:        "#ffb800",
        blue:          "#00f0ff",
        magenta:       "#b44dff",
        cyan:          "#00f0ff",
        white:         "#c0d0e8",
        brightBlack:   "#4a5568",
        brightRed:     "#ff6b7a",
        brightGreen:   "#5fffb0",
        brightYellow:  "#ffd666",
        brightBlue:    "#66f5ff",
        brightMagenta: "#d17dff",
        brightCyan:    "#66f5ff",
        brightWhite:   "#ffffff",
      },
    });

    const fit      = new FitAddon();
    const webLinks = new WebLinksAddon();
    term.loadAddon(fit);
    term.loadAddon(webLinks);

    let resizeObserver: ResizeObserver | null = null;
    let handleResize: (() => void) | null = null;

    const safeFit = () => {
      const el = containerRef.current;
      if (el && el.offsetWidth > 0 && el.offsetHeight > 0) fit.fit();
    };

    const rafId = requestAnimationFrame(() => {
      if (!containerRef.current) return;

      term.open(containerRef.current);
      safeFit();

      termRef.current = term;
      fitRef.current  = fit;

      term.writeln("\x1b[36m╔══════════════════════════════════════╗\x1b[0m");
      term.writeln(
        "\x1b[36m║\x1b[0m   \x1b[32m⚡ CloudVM Web Terminal\x1b[0m            \x1b[36m║\x1b[0m",
      );
      term.writeln("\x1b[36m╚══════════════════════════════════════╝\x1b[0m");
      term.writeln("");
      term.writeln(`  \x1b[90mTarget:\x1b[0m ${ipAddress}`);
      term.writeln("");

      // Use the configured WS URL (must be the HTTPS origin when behind Nginx).
      // Socket.IO will automatically upgrade to wss:// when the origin is https://.
      const wsBase = resolveVmWsOrigin();

      const socket = io(`${wsBase}/terminal`, {
        transports: ["websocket"],
        // Nginx proxies /terminal/ → gateway → vm service.
        // The namespace "/terminal" + path "/terminal/socket.io" are required.
        path: "/terminal/socket.io",
        withCredentials: true,
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 500,
        timeout: 15000,
        // Force secure transport when page is served over HTTPS
        secure: typeof window !== "undefined" && window.location.protocol === "https:",
      });
      socketRef.current = socket;

      socket.on("connect", () => {
        term.writeln("\x1b[32m● Connected to terminal server\x1b[0m");
        connect();
      });

      socket.on("connect_error", (err) => {
        term.writeln(`\r\n\x1b[31m✗ Connection error: ${err.message}\x1b[0m`);
        connectedRef.current = false;
      });

      socket.on("connected", (payload: { message: string }) => {
        term.writeln(`\x1b[32m● ${payload.message}\x1b[0m`);
      });

      socket.on("output", (data: string) => {
        term.write(data);
      });

      socket.on("error", () => {
        term.writeln("\r\n\x1b[31m✗ Error: Connection failed. Please retry.\x1b[0m");
        connectedRef.current = false;
      });

      socket.on("disconnected", (payload: { message: string }) => {
        term.writeln(`\r\n\x1b[31m● ${payload.message}\x1b[0m`);
        connectedRef.current = false;
        onDisconnectRef.current?.();
      });

      socket.on("disconnect", () => {
        if (connectedRef.current) {
          term.writeln("\r\n\x1b[31m● Connection lost\x1b[0m");
        }
        connectedRef.current = false;
        onDisconnectRef.current?.();
      });

      term.onData((data) => {
        if (connectedRef.current && socket.connected) {
          socket.emit("input", data);
        }
      });

      term.onResize(({ cols, rows }) => {
        if (connectedRef.current && socket.connected) {
          socket.emit("resize", { cols, rows });
        }
      });

      resizeObserver = new ResizeObserver(() => safeFit());
      resizeObserver.observe(containerRef.current!);

      handleResize = () => safeFit();
      window.addEventListener("resize", handleResize);
    });

    return () => {
      cancelAnimationFrame(rafId);
      resizeObserver?.disconnect();
      if (handleResize) window.removeEventListener("resize", handleResize);
      socketRef.current?.disconnect();
      term.dispose();
      socketRef.current  = null;
      termRef.current    = null;
      fitRef.current     = null;
      connectedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vmId, ipAddress, connect]);

  return (
    <div className="relative group">
      <div className="absolute inset-0 bg-gradient-to-b from-cyber-green/5 to-transparent rounded-lg pointer-events-none" />
      <div
        ref={containerRef}
        className="w-full rounded-lg overflow-hidden border border-cyber-border"
        style={{ height: "450px" }}
      />
    </div>
  );
}
