"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { io, Socket } from "socket.io-client";
import { Terminal as XTerminal } from "xterm";
import { FitAddon } from "xterm-addon-fit";
import { WebLinksAddon } from "xterm-addon-web-links";
import { resolveVmWsOrigin } from "@/lib/runtime-urls";
import api from "@/lib/api";
import "xterm/css/xterm.css";

interface TerminalProps {
  vmId: string;
  ipAddress: string;
  onDisconnect?: () => void;
}

function CredentialsPrompt({
  ipAddress,
  onConnect,
}: {
  ipAddress: string;
  onConnect: (username: string, password: string) => void;
}) {
  const [username, setUsername] = useState("cloudvm");
  const [password, setPassword] = useState("");
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    passwordRef.current?.focus();
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (username.trim() && password.trim()) {
      onConnect(username.trim(), password.trim());
    }
  };

  return (
    <div className="flex flex-col items-center justify-center h-[450px] bg-[#060b18] rounded-lg border border-cyber-border p-6">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center w-12 h-12 rounded-full bg-cyber-green/10 border border-cyber-green/30 mb-4 mx-auto">
          <svg
            className="w-6 h-6 text-cyber-green"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <rect x="3" y="11" width="18" height="11" rx="2" />
            <path d="M7 11V7a5 5 0 0110 0v4" />
          </svg>
        </div>

        <h3 className="text-center text-cyber-text font-semibold mb-1">
          Connect via SSH
        </h3>
        <p className="text-center text-cyber-text-dim text-xs mb-5">
          <span className="text-cyber-green font-mono">{ipAddress}</span>
        </p>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-cyber-text-dim mb-1">
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="cyber-input w-full"
              placeholder="cloudvm"
              autoComplete="username"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-cyber-text-dim mb-1">
              Password
            </label>
            <input
              ref={passwordRef}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="cyber-input w-full"
              placeholder="VM password"
              autoComplete="current-password"
            />
          </div>

          <button
            type="submit"
            disabled={!username.trim() || !password.trim()}
            className="cyber-btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Connect
          </button>
        </form>
      </div>
    </div>
  );
}

export default function Terminal({ vmId, ipAddress, onDisconnect }: TerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTerminal | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const connectedRef = useRef(false);

  const onDisconnectRef = useRef(onDisconnect);
  const vmIdRef = useRef(vmId);
  useEffect(() => {
    onDisconnectRef.current = onDisconnect;
  }, [onDisconnect]);
  useEffect(() => {
    vmIdRef.current = vmId;
  }, [vmId]);

  const [credentials, setCredentials] = useState<{ username: string; password: string } | null>(
    null,
  );

  const connect = useCallback((username: string, password: string) => {
    if (!socketRef.current || connectedRef.current) return;
    connectedRef.current = true;
    socketRef.current.emit("connect-ssh", {
      vmId: vmIdRef.current,
      username,
      password,
    });
    termRef.current?.writeln("\r\n\x1b[32m● Connecting to VM...\x1b[0m\r\n");
  }, []);

  useEffect(() => {
    if (!credentials || !containerRef.current) return;

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

    let resizeObserver: ResizeObserver | null = null;
    let handleResize: (() => void) | null = null;

    const safeFit = () => {
      const el = containerRef.current;
      if (el && el.offsetWidth > 0 && el.offsetHeight > 0) {
        fit.fit();
      }
    };

    const rafId = requestAnimationFrame(() => {
      if (!containerRef.current) return;

      term.open(containerRef.current);
      safeFit();
      termRef.current = term;

      term.writeln("\x1b[36m╔══════════════════════════════════════╗\x1b[0m");
      term.writeln("\x1b[36m║\x1b[0m   \x1b[32m⚡ CloudVM Web Terminal\x1b[0m            \x1b[36m║\x1b[0m");
      term.writeln("\x1b[36m╚══════════════════════════════════════╝\x1b[0m");
      term.writeln("");
      term.writeln(`  \x1b[90mTarget:\x1b[0m ${ipAddress}`);
      term.writeln("");

      (async () => {
        try {
          await api.get("/auth/me");
        } catch {
          term.writeln("\r\n\x1b[31m✗ Session expired. Please log in again.\x1b[0m");
          connectedRef.current = false;
          return;
        }

        const wsBase = resolveVmWsOrigin();
        const socket = io(`${wsBase}/terminal`, {
          transports: ["websocket"],
          path: "/terminal/socket.io",
          withCredentials: true,
          reconnection: true,
          reconnectionAttempts: 10,
          reconnectionDelay: 500,
          timeout: 15000,
          secure: typeof window !== "undefined" && window.location.protocol === "https:",
        });

        socketRef.current = socket;

        socket.on("connect", () => {
          term.writeln("\x1b[32m● Connected to terminal server\x1b[0m");
          connect(credentials.username, credentials.password);
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

        socket.on("error", (payload: { message?: string } | string) => {
          const msg = typeof payload === "string" ? payload : payload?.message ?? "Connection failed";
          term.writeln(`\r\n\x1b[31m✗ ${msg}\x1b[0m`);
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
      })();

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
      socketRef.current = null;
      termRef.current = null;
      connectedRef.current = false;
    };
  }, [connect, credentials, ipAddress]);

  if (!credentials) {
    return (
      <CredentialsPrompt
        ipAddress={ipAddress}
        onConnect={(username, password) => setCredentials({ username, password })}
      />
    );
  }

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
