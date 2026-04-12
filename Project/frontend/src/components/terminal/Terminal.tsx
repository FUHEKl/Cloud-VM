"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { io, Socket } from "socket.io-client";
import Cookies from "js-cookie";
import { Terminal as XTerminal } from "xterm";
import { FitAddon } from "xterm-addon-fit";
import { WebLinksAddon } from "xterm-addon-web-links";
import { getGeneratedVmSshPrivateKey } from "@/lib/vmSshKeyStore";
import "xterm/css/xterm.css";

interface TerminalProps {
  vmId: string;
  ipAddress: string;
  onDisconnect?: () => void;
}

// ──────────────────────────────────────────────────────────────────────────────
// Password prompt overlay — shown when no generated SSH private key is found
// in localStorage (cleared browser data, different device, etc.).
// ──────────────────────────────────────────────────────────────────────────────
function PasswordPrompt({
  ipAddress,
  onConnect,
}: {
  ipAddress: string;
  onConnect: (password: string) => void;
}) {
  const [password, setPassword] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password.trim()) onConnect(password);
  };

  return (
    <div className="flex flex-col items-center justify-center h-[450px] bg-[#060b18] rounded-lg border border-cyber-border p-6">
      <div className="w-full max-w-sm">
        {/* Icon */}
        <div className="flex items-center justify-center w-12 h-12 rounded-full bg-cyber-orange/10 border border-cyber-orange/30 mb-4 mx-auto">
          <svg
            className="w-6 h-6 text-cyber-orange"
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
          SSH Key Not Found
        </h3>
        <p className="text-center text-cyber-text-dim text-xs mb-5">
          No stored key for this VM.{" "}
          <span className="text-cyber-green font-mono">{ipAddress}</span>
          <br />
          Enter the VM password to connect.
        </p>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-cyber-text-dim mb-1">
              Password
            </label>
            <input
              ref={inputRef}
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
            disabled={!password.trim()}
            className="cyber-btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Connect
          </button>
        </form>

        <p className="text-center text-cyber-text-dim text-xs mt-4">
          Tip: regenerate your VM to get a new SSH key pair.
        </p>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Main Terminal component
// ──────────────────────────────────────────────────────────────────────────────
export default function Terminal({ vmId, ipAddress, onDisconnect }: TerminalProps) {
  const containerRef  = useRef<HTMLDivElement>(null);
  const termRef       = useRef<XTerminal | null>(null);
  const socketRef     = useRef<Socket | null>(null);
  const fitRef        = useRef<FitAddon | null>(null);
  const connectedRef  = useRef(false);

  const onDisconnectRef = useRef(onDisconnect);
  const vmIdRef         = useRef(vmId);
  useEffect(() => { onDisconnectRef.current = onDisconnect; }, [onDisconnect]);
  useEffect(() => { vmIdRef.current = vmId; }, [vmId]);

  // When no private key is found, we show a password prompt overlay
  // instead of rendering the xterm terminal directly.
  const [needsPassword, setNeedsPassword] = useState(false);

  // Called once the socket is open; triggers the SSH connect-ssh event.
  const connect = useCallback(
    (params: { privateKey?: string; password?: string; username?: string }) => {
      if (!socketRef.current || connectedRef.current) return;
      connectedRef.current = true;
      socketRef.current.emit("connect-ssh", {
        vmId: vmIdRef.current,
        ...params,
      });
      termRef.current?.writeln("\r\n\x1b[32m● Connecting to VM...\x1b[0m\r\n");
    },
    [],
  );

  // Called from PasswordPrompt after the user submits a password.
  const handlePasswordConnect = useCallback((password: string) => {
    setNeedsPassword(false);
    // connect() is called inside the xterm useEffect once the socket opens.
    // We store the password so the socket.on("connect") handler can pick it up.
    pendingPasswordRef.current = password;
  }, []);

  const pendingPasswordRef = useRef<string | null>(null);

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

      const token = Cookies.get("accessToken") ?? null;
      if (!token) {
        term.writeln(
          "\x1b[31m✗ Authentication token missing. Please login again.\x1b[0m",
        );
        return;
      }

      // Decide auth method up-front so we can show the password prompt
      // BEFORE opening the socket (avoids a double-render flash).
      const privateKey = getGeneratedVmSshPrivateKey(vmIdRef.current);
      if (!privateKey && !pendingPasswordRef.current) {
        // No key and no pending password — show the password overlay.
        setNeedsPassword(true);
        return;
      }

      // Use the configured WS URL (must be the HTTPS origin when behind Nginx).
      // Socket.IO will automatically upgrade to wss:// when the origin is https://.
      const wsBase =
        process.env.NEXT_PUBLIC_VM_WS_URL ||
        process.env.NEXT_PUBLIC_API_URL ||
        (typeof window !== "undefined" ? window.location.origin : "http://localhost:3001");

      const socket = io(`${wsBase}/terminal`, {
        transports: ["websocket"],
        // Nginx proxies /terminal/ → gateway → vm service.
        // The namespace "/terminal" + path "/terminal/socket.io" are required.
        path: "/terminal/socket.io",
        auth: { token },
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

        const pk = getGeneratedVmSshPrivateKey(vmIdRef.current);
        if (pk) {
          term.writeln("\x1b[90mUsing generated VM SSH key...\x1b[0m");
          connect({ privateKey: pk, username: "cloudvm" });
        } else if (pendingPasswordRef.current) {
          term.writeln("\x1b[90mUsing password authentication...\x1b[0m");
          connect({ password: pendingPasswordRef.current, username: "cloudvm" });
          pendingPasswordRef.current = null;
        } else {
          // Edge-case: key was removed after the effect ran
          term.writeln(
            "\x1b[31m✗ No SSH credentials available. Please refresh and try again.\x1b[0m",
          );
          connectedRef.current = false;
        }
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

      socket.on("error", (payload: string | { message: string }) => {
        const msg = typeof payload === "object" ? payload.message : payload;
        term.writeln(`\r\n\x1b[31m✗ Error: ${msg}\x1b[0m`);
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
  }, [vmId, ipAddress, needsPassword]);

  // When the user submits a password, flip needsPassword → false,
  // which causes the effect to re-run and open the xterm + socket.
  if (needsPassword) {
    return (
      <PasswordPrompt
        ipAddress={ipAddress}
        onConnect={handlePasswordConnect}
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
