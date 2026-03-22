"use client";

import { useEffect, useRef, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import Cookies from "js-cookie";
import { Terminal as XTerminal } from "xterm";
import { FitAddon } from "xterm-addon-fit";
import { WebLinksAddon } from "xterm-addon-web-links";
import "xterm/css/xterm.css";

interface TerminalProps {
  vmId: string;
  ipAddress: string;
  onDisconnect?: () => void;
}

export default function Terminal({
  vmId,
  ipAddress,
  onDisconnect,
}: TerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef      = useRef<XTerminal | null>(null);
  const socketRef    = useRef<Socket | null>(null);
  const fitRef       = useRef<FitAddon | null>(null);
  const connectedRef = useRef(false);

  const onDisconnectRef = useRef(onDisconnect);
  const vmIdRef         = useRef(vmId);
  useEffect(() => { onDisconnectRef.current = onDisconnect; }, [onDisconnect]);
  useEffect(() => { vmIdRef.current = vmId; }, [vmId]);

  const connect = useCallback((password: string) => {
    if (!socketRef.current || connectedRef.current) return;
    connectedRef.current = true;
    socketRef.current.emit("connect-ssh", {
      vmId: vmIdRef.current,
      password,
    });
    termRef.current?.writeln("\r\n\x1b[32m● Connecting to VM...\x1b[0m\r\n");
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;

    const term      = new XTerminal({
      cursorBlink: true,
      fontFamily: '"JetBrains Mono", "Fira Code", monospace',
      fontSize: 14,
      lineHeight: 1.2,
      theme: {
        background:         "#060b18",
        foreground:         "#c0d0e8",
        cursor:             "#00e87b",
        cursorAccent:       "#060b18",
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

      const token  = Cookies.get("accessToken") ?? null;
      const wsBase = process.env.NEXT_PUBLIC_VM_WS_URL || "http://localhost:3004";
      const socket = io(`${wsBase}/terminal`, {
        transports: ["websocket"],
        auth: { token },
      });
      socketRef.current = socket;

      socket.on("connect", () => {
        term.writeln("\x1b[32m● Connected to terminal server\x1b[0m");
        term.writeln("\x1b[90mEnter SSH password to connect:\x1b[0m");
        term.write("\r\n\x1b[33mPassword: \x1b[0m");

        let pw = "";
        const pwHandler = term.onData((data) => {
          if (data === "\r" || data === "\n") {
            term.write("\r\n");
            pwHandler.dispose();
            connect(pw);
          } else if (data === "\x7f") {
            if (pw.length > 0) {
              pw = pw.slice(0, -1);
              term.write("\b \b");
            }
          } else {
            pw += data;
            term.write("*");
          }
        });
      });

      // BUG 8 FIX: server emits "connected" with { message: string }
      socket.on("connected", (payload: { message: string }) => {
        term.writeln(`\x1b[32m● ${payload.message}\x1b[0m`);
      });

      socket.on("output", (data: string) => {
        term.write(data);
      });

      // BUG 8 FIX: server emits error as { message: string } object, not raw string
      socket.on("error", (payload: string | { message: string }) => {
        const msg = typeof payload === "object" ? payload.message : payload;
        term.writeln(`\r\n\x1b[31m✗ Error: ${msg}\x1b[0m`);
        connectedRef.current = false;
      });

      // BUG 8 FIX: server emits "disconnected" (custom event), not "disconnect"
      socket.on("disconnected", (payload: { message: string }) => {
        term.writeln(`\r\n\x1b[31m● ${payload.message}\x1b[0m`);
        connectedRef.current = false;
        onDisconnectRef.current?.();
      });

      // Keep built-in disconnect for network-level drops
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
      resizeObserver.observe(containerRef.current);

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
  }, [vmId, ipAddress]);

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
