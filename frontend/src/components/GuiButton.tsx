"use client";

import { useState, useCallback } from "react";
import dynamic from "next/dynamic";

const VncViewer = dynamic(() => import("./VncViewer"), { ssr: false });

interface GuiButtonProps {
  vmId: string;
  guiReady: boolean;
}

export default function GuiButton({ vmId, guiReady }: GuiButtonProps) {
  const [open, setOpen] = useState(false);

  const handleOpen = useCallback(() => {
    if (guiReady) setOpen(true);
  }, [guiReady]);

  return (
    <>
      <div className="relative group inline-block">
        <button
          onClick={handleOpen}
          disabled={!guiReady}
          className={[
            "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
            guiReady
              ? "bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer shadow-md"
              : "bg-zinc-700 text-zinc-400 cursor-not-allowed opacity-60",
          ].join(" ")}
          aria-label={guiReady ? "Open desktop GUI" : "GUI is still installing…"}
        >
          <span aria-hidden>🖥️</span>
          {guiReady ? "Open GUI" : "GUI Installing…"}
        </button>

        {!guiReady && (
          <div
            className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-zinc-900 border border-zinc-700 text-zinc-300 text-xs rounded px-2 py-1 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
          >
            Desktop is being set up — please wait
          </div>
        )}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/95">
          <div className="flex items-center justify-between px-4 py-2 bg-zinc-900 border-b border-zinc-700 shrink-0">
            <div className="flex items-center gap-2 text-white text-sm font-medium">
              <span aria-hidden className="text-indigo-400">🖥️</span>
              Desktop — VM {vmId.slice(0, 8)}
            </div>
            <button
              onClick={() => setOpen(false)}
              className="text-zinc-400 hover:text-white transition-colors text-lg leading-none"
              aria-label="Close desktop"
            >
              ✕
            </button>
          </div>

          <div className="flex-1 overflow-hidden">
            <VncViewer vmId={vmId} onDisconnect={() => setOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
}
