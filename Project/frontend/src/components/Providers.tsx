"use client";

import { Toaster } from "react-hot-toast";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: {
            background: "#0a1628",
            color: "#e2e8f0",
            border: "1px solid #1a2a4a",
            borderRadius: "0.75rem",
            fontSize: "0.875rem",
          },
          success: {
            iconTheme: { primary: "#00e87b", secondary: "#060b18" },
          },
          error: {
            iconTheme: { primary: "#ff3b3b", secondary: "#060b18" },
          },
        }}
      />
    </>
  );
}
