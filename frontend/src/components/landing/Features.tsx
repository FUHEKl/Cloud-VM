"use client";

import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";

const features = [
  {
    icon: (
      <svg
        className="w-7 h-7"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <rect x="2" y="3" width="20" height="14" rx="2" />
        <path d="M8 21h8M12 17v4" />
      </svg>
    ),
    title: "Virtual Machines",
    description:
      "Spin up VMs with custom CPU, RAM, and disk configurations. Choose from multiple OS templates and get started in seconds.",
    color: "green" as const,
  },
  {
    icon: (
      <svg
        className="w-7 h-7"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <path d="M4 17l6-6-6-6M12 19h8" />
      </svg>
    ),
    title: "Web Terminal",
    description:
      "Access your VM command line directly from the browser. No SSH client needed — just click and start typing.",
    color: "cyan" as const,
  },
  {
    icon: (
      <svg
        className="w-7 h-7"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    ),
    title: "SSH Key Management",
    description:
      "Upload and manage your SSH public keys. Securely connect to your VMs with key-based authentication.",
    color: "green" as const,
  },
  {
    icon: (
      <svg
        className="w-7 h-7"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        <path d="M9 12l2 2 4-4" />
      </svg>
    ),
    title: "Resource Monitoring",
    description:
      "Track CPU, memory, and disk usage in real-time. Get notifications when resources are running low.",
    color: "cyan" as const,
  },
  {
    icon: (
      <svg
        className="w-7 h-7"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
      </svg>
    ),
    title: "Admin Dashboard",
    description:
      "Full admin panel to manage users, VMs, plans, and quotas. Monitor platform health at a glance.",
    color: "green" as const,
  },
  {
    icon: (
      <svg
        className="w-7 h-7"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
      </svg>
    ),
    title: "Flexible Plans",
    description:
      "Choose the plan that fits your needs. From free tier for learning to enterprise for production workloads.",
    color: "cyan" as const,
  },
];

const colorClasses = {
  green: {
    icon: "text-cyber-green",
    bg: "bg-cyber-green/10",
    border: "border-cyber-green/20",
    hover: "hover:border-cyber-green/40 hover:shadow-glow-green",
  },
  cyan: {
    icon: "text-cyber-cyan",
    bg: "bg-cyber-cyan/10",
    border: "border-cyber-cyan/20",
    hover: "hover:border-cyber-cyan/40 hover:shadow-glow-cyan",
  },
};

export default function Features() {
  const baseCount = features.length;
  const slides = useMemo(() => [...features, features[0]], []);
  const [index, setIndex] = useState(0);
  const [isResetting, setIsResetting] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setIndex((prev) => prev + 1);
    }, 3500);

    return () => clearInterval(interval);
  }, [baseCount]);

  useEffect(() => {
    if (index === baseCount) {
      const resetTimer = setTimeout(() => {
        setIsResetting(true);
        setIndex(0);
        requestAnimationFrame(() => {
          setIsResetting(false);
        });
      }, 650);

      return () => clearTimeout(resetTimer);
    }
  }, [index, baseCount]);

  return (
    <section id="features" className="py-24 relative">
      <div className="absolute inset-0 bg-glow-radial opacity-50" />
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section header */}
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">
            <span className="text-cyber-text">Powerful </span>
            <span className="text-cyber-green">Features</span>
          </h2>
          <p className="text-cyber-text-dim max-w-2xl mx-auto">
            Everything you need to manage virtual infrastructure for your lab
            environment
          </p>
        </div>
        {/* Feature slider */}
        <div className="feature-marquee">
          <div
            className={`feature-marquee-track ${
              isResetting ? "is-resetting" : ""
            }`}
            style={{
              "--index": index,
            } as CSSProperties}
          >
            {slides.map((feature, slideIndex) => {
              const c = colorClasses[feature.color];
              const activeIndex = index === baseCount ? baseCount : index % baseCount;
              const isActive = slideIndex === activeIndex;
              return (
                <div
                  key={`${feature.title}-${slideIndex}`}
                  className={`feature-card cyber-card transition-all duration-300 ${c.hover} ${
                    isActive ? "is-active" : "is-inactive"
                  }`}
                >
                  <div
                    className={`w-12 h-12 rounded-lg ${c.bg} border ${c.border} flex items-center justify-center mb-4`}
                  >
                    <div className={c.icon}>{feature.icon}</div>
                  </div>
                  <h3 className="text-lg font-semibold text-cyber-text mb-2">
                    {feature.title}
                  </h3>
                  <p className="text-cyber-text-dim text-sm leading-relaxed">
                    {feature.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
