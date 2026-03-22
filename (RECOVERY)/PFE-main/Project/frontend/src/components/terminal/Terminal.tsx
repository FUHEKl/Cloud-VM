"use client";

import { useEffect, useRef, useCallback } from "react";
import { io, Socket } from "socket.io-client";
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
  const termRef = useRef<XTerminal | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const connectedRef = useRef(false);

  const connect = useCallback(
    (password: string) => {
      if (!socketRef.current || connectedRef.current) return;
      connectedRef.current = true;

      socketRef.current.emit("connect-ssh", { vmId, password });
      termRef.current?.writeln("\r\n\x1b[32m● Connecting to VM...\x1b[0m\r\n");
    },
    [vmId],
  );

  useEffect(() => {
    if (!containerRef.current) return;

    // Create terminal
    const term = new XTerminal({
      cursorBlink: true,
      fontFamily: '"JetBrains Mono", "Fira Code", monospace',
      fontSize: 14,
      lineHeight: 1.2,
      theme: {
        background: "#060b18",
        foreground: "#c0d0e8",
        cursor: "#00e87b",
        cursorAccent: "#060b18",
        selectionBackground: "rgba(0,232,123,0.25)",
        black: "#0a0f1e",
        red: "#ff4757",
        green: "#00e87b",
        yellow: "#ffb800",
        blue: "#00f0ff",
        magenta: "#b44dff",
        cyan: "#00f0ff",
        white: "#c0d0e8",
        brightBlack: "#4a5568",
        brightRed: "#ff6b7a",
        brightGreen: "#5fffb0",
        brightYellow: "#ffd666",
        brightBlue: "#66f5ff",
        brightMagenta: "#d17dff",
        brightCyan: "#66f5ff",
        brightWhite: "#ffffff",
      },
    });

    const fit = new FitAddon();
    const webLinks = new WebLinksAddon();
    term.loadAddon(fit);
    term.loadAddon(webLinks);
    term.open(containerRef.current);
    fit.fit();

    termRef.current = term;
    fitRef.current = fit;

    // Banner
    term.writeln("\x1b[36m╔══════════════════════════════════════╗\x1b[0m");
    term.writeln(
      "\x1b[36m║\x1b[0m   \x1b[32m⚡ CloudVM Web Terminal\x1b[0m            \x1b[36m║\x1b[0m",
    );
    term.writeln("\x1b[36m╚══════════════════════════════════════╝\x1b[0m");
    term.writeln("");
    term.writeln(`  \x1b[90mTarget:\x1b[0m ${ipAddress}`);
    term.writeln("");

    // Socket connection
    const token =
      typeof window !== "undefined"
        ? localStorage.getItem("access_token")
        : null;
    const socket = io(
      process.env.NEXT_PUBLIC_VM_WS_URL || "http://localhost:3004",
      {
        path: "/socket.io",
        transports: ["websocket"],
        auth: { token },
      },
    );
    socketRef.current = socket;

    socket.on("connect", () => {
      term.writeln("\x1b[32m● Connected to terminal server\x1b[0m");
      term.writeln("\x1b[90mEnter SSH password to connect:\x1b[0m");
      term.write("\r\n\x1b[33mPassword: \x1b[0m");

      // Password input
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

    socket.on("output", (data: string) => {
      term.write(data);
    });

    socket.on("error", (msg: string) => {
      term.writeln(`\r\n\x1b[31m✗ Error: ${msg}\x1b[0m`);
      connectedRef.current = false;
    });

    socket.on("disconnect", () => {
      term.writeln("\r\n\x1b[31m● Disconnected from terminal server\x1b[0m");
      connectedRef.current = false;
      onDisconnect?.();
    });

    // Forward input to server after SSH connected
    term.onData((data) => {
      if (connectedRef.current && socket.connected) {
        socket.emit("input", data);
      }
    });

    // Handle resize
    term.onResize(({ cols, rows }) => {
      if (connectedRef.current && socket.connected) {
        socket.emit("resize", { cols, rows });
      }
    });

    const handleResize = () => {
      fit.fit();
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      socket.disconnect();
      term.dispose();
      socketRef.current = null;
      termRef.current = null;
      fitRef.current = null;
      connectedRef.current = false;
    };
  }, [vmId, ipAddress, connect, onDisconnect]);

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
