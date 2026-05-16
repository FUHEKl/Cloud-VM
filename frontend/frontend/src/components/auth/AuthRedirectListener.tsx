"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";

export default function AuthRedirectListener() {
  const router = useRouter();
  const pathname = usePathname();
  const { forceLogout } = useAuth();

  useEffect(() => {
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
