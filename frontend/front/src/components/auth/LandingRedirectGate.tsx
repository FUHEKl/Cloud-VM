"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Cookies from "js-cookie";
import { clearAuthCookies, isRememberMeEnabled } from "@/lib/session";

/**
 * Keeps landing page behavior deterministic for PFE demo requirements:
 * - rememberMe = true: users visiting / are redirected to dashboard profile.
 * - rememberMe = false: on full reload, auth cookies are cleared.
 */
export default function LandingRedirectGate() {
  const router = useRouter();

  useEffect(() => {
    const navEntries =
      typeof performance !== "undefined"
        ? performance.getEntriesByType("navigation")
        : [];

    const navigationType =
      navEntries.length > 0
        ? (navEntries[0] as PerformanceNavigationTiming).type
        : "navigate";

    const rememberMe = isRememberMeEnabled();

    if (!rememberMe && navigationType === "reload") {
      clearAuthCookies();
      return;
    }

    if (rememberMe && Cookies.get("accessToken")) {
      router.replace("/dashboard/profile");
    }
  }, [router]);

  return null;
}
