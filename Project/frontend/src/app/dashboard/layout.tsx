"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import clsx from "clsx";
import AssistantChat from "@/components/assistant/AssistantChat";

const navItems = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: (
      <svg
        className="w-5 h-5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    ),
  },
  {
    label: "Virtual Machines",
    href: "/dashboard/vms",
    icon: (
      <svg
        className="w-5 h-5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <rect x="2" y="3" width="20" height="14" rx="2" />
        <path d="M8 21h8M12 17v4" />
      </svg>
    ),
  },
  {
    label: "SSH Keys",
    href: "/dashboard/ssh-keys",
    icon: (
      <svg
        className="w-5 h-5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
      </svg>
    ),
  },
  {
    label: "Profile",
    href: "/dashboard/profile",
    icon: (
      <svg
        className="w-5 h-5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    ),
  },
  {
    label: "AI Assistant",
    href: "/dashboard/assistant",
    icon: (
      <svg
        className="w-5 h-5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <rect x="4" y="5" width="16" height="12" rx="2" />
        <path d="M9 10h6M12 17v3" />
        <circle cx="8" cy="11" r="1" />
        <circle cx="16" cy="11" r="1" />
      </svg>
    ),
  },
  {
    label: "Billing",
    href: "/dashboard/billing",
    icon: (
      <svg
        className="w-5 h-5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <rect x="2" y="5" width="20" height="14" rx="2" />
        <path d="M2 10h20" />
        <path d="M7 15h3" />
      </svg>
    ),
  },
];

const adminItems = [
  {
    label: "Manage Users",
    href: "/dashboard/admin/users",
    icon: (
      <svg
        className="w-5 h-5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
      </svg>
    ),
  },
  {
    label: "Admin Billing",
    href: "/dashboard/admin/billing",
    icon: (
      <svg
        className="w-5 h-5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <rect x="2" y="5" width="20" height="14" rx="2" />
        <path d="M2 10h20" />
        <path d="M7 15h3" />
        <path d="M16 14v4M14 16h4" />
      </svg>
    ),
  },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, isLoading, isAuthenticated, fetchUser, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const isAssistantRoute = pathname?.startsWith("/dashboard/assistant");

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace("/login");
    }
  }, [isLoading, isAuthenticated, router]);

  useEffect(() => {
    if (isAssistantRoute && assistantOpen) {
      setAssistantOpen(false);
    }
  }, [isAssistantRoute, assistantOpen]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <svg
            className="animate-spin w-8 h-8 text-cyber-green"
            viewBox="0 0 24 24"
            fill="none"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
          <span className="text-cyber-text-dim text-sm">Loading...</span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) return null;

  const baseNavItems =
    user?.role === "ADMIN"
      ? navItems.filter((item) => item.href !== "/dashboard/billing")
      : navItems;

  const allNavItems =
    user?.role === "ADMIN" ? [...baseNavItems, ...adminItems] : baseNavItems;

  const handleLogout = async () => {
    await logout();
    window.location.assign("/login");
  };

  return (
    <div className="min-h-screen flex">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={clsx(
          "fixed lg:static inset-y-0 left-0 z-50 w-64 bg-cyber-card border-r border-cyber-border flex flex-col transition-transform duration-300",
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        )}
      >
        {/* Logo */}
        <div className="h-16 flex items-center px-6 border-b border-cyber-border">
          <Link href="/dashboard" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-cyber-green/20 border border-cyber-green/30 flex items-center justify-center">
              <svg
                className="w-5 h-5 text-cyber-green"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M22 12H18L15 21L9 3L6 12H2" />
              </svg>
            </div>
            <span className="text-lg font-bold">
              <span className="text-cyber-green">Cloud</span>
              <span className="text-cyber-text">VM</span>
            </span>
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {allNavItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setSidebarOpen(false)}
                className={clsx(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
                  isActive
                    ? "bg-cyber-green/10 text-cyber-green border border-cyber-green/20"
                    : "text-cyber-text-dim hover:text-cyber-text hover:bg-cyber-border/30",
                )}
              >
                {item.icon}
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* User section */}
        <div className="p-4 border-t border-cyber-border">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-full bg-cyber-green/20 border border-cyber-green/30 flex items-center justify-center text-cyber-green font-semibold text-sm">
              {user?.firstName?.[0]}
              {user?.lastName?.[0]}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-cyber-text truncate">
                {user?.firstName} {user?.lastName}
              </div>
              <div className="text-xs text-cyber-text-dim truncate">
                {user?.email}
              </div>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-cyber-text-dim hover:text-cyber-red hover:bg-cyber-red/10 transition-all duration-200"
          >
            <svg
              className="w-4 h-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />
            </svg>
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top header */}
        <header className="h-16 border-b border-cyber-border bg-cyber-card/50 backdrop-blur-sm flex items-center px-4 lg:px-8 gap-4">
          {/* Mobile menu button */}
          <button
            className="lg:hidden text-cyber-text-dim hover:text-cyber-text"
            onClick={() => setSidebarOpen(true)}
          >
            <svg
              className="w-6 h-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h16"
              />
            </svg>
          </button>

          <div className="flex-1" />

          {/* Role badge */}
          {user?.role === "ADMIN" && (
            <span className="cyber-badge-orange">Admin</span>
          )}
        </header>

        {/* Page content */}
        <main className="flex-1 p-4 lg:p-8 overflow-auto">{children}</main>

        {/* Floating AI Assistant */}
        {!isAssistantRoute && assistantOpen && (
          <div className="fixed bottom-24 right-4 lg:right-8 z-50 w-[calc(100vw-2rem)] max-w-[420px]">
            <AssistantChat
              mode="compact"
              onClose={() => setAssistantOpen(false)}
            />
          </div>
        )}

        {!isAssistantRoute && (
          <button
            onClick={() => setAssistantOpen((prev) => !prev)}
            className="fixed bottom-6 right-4 lg:right-8 z-50 cyber-btn-primary !px-4 !py-3 shadow-glow inline-flex items-center gap-2"
          >
            <svg
              className="w-4 h-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            >
              <rect x="4" y="5" width="16" height="12" rx="2" />
              <path d="M9 10h6M12 17v3" />
              <circle cx="8" cy="11" r="1" />
              <circle cx="16" cy="11" r="1" />
            </svg>
            <span className="hidden sm:inline">AI Assistant</span>
          </button>
        )}
      </div>
    </div>
  );
}
