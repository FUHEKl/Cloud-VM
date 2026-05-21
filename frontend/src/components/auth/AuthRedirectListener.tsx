"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";

export default function AuthRedirectListener() {
  const router = useRouter();
  const pathname = usePathname();
  const { forceLogout } = useAuth();

  useEffect(() => {
    const desiredOrigin = (() => {
      const configured = process.env.NEXT_PUBLIC_API_URL;
      if (!configured) return "";
      try {
        return new URL(configured).origin;
      } catch {
        return "";
      }
    })();
    if (typeof window !== "undefined") {
      const currentOrigin = window.location.origin;
      const targetOrigin = desiredOrigin || `https://${window.location.host}`;

      if (currentOrigin !== targetOrigin) {
        const targetUrl = `${targetOrigin}${window.location.pathname}${window.location.search}${window.location.hash}`;
        window.location.replace(targetUrl);
        return;
      }
    }

    const handleLogout = () => {
      forceLogout();
      if (pathname !== "/login") {
        router.replace("/login");
      }
    };

    window.addEventListener("auth:logout", handleLogout);
    return () => window.removeEventListener("auth:logout", handleLogout);
  }, [forceLogout, pathname, router]);

  return null;
}
