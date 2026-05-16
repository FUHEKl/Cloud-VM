import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        cyber: {
          bg: "#060b18",
          card: "#0a1628",
          border: "#1a2a4a",
          "border-glow": "#00f0ff33",
          green: "#00e87b",
          "green-dim": "#00e87b20",
          cyan: "#00f0ff",
          "cyan-dim": "#00f0ff15",
          orange: "#ff8c00",
          red: "#ff3b3b",
          text: "#e2e8f0",
          "text-dim": "#64748b",
        },
      },
      backgroundImage: {
        "grid-pattern":
          "linear-gradient(rgba(0, 240, 255, 0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(0, 240, 255, 0.03) 1px, transparent 1px)",
        "glow-radial":
          "radial-gradient(circle at 50% 0%, rgba(0, 232, 123, 0.08) 0%, transparent 60%)",
      },
      backgroundSize: {
        "grid-40": "40px 40px",
      },
      boxShadow: {
        "glow-green": "0 0 20px rgba(0, 232, 123, 0.15)",
        "glow-cyan": "0 0 20px rgba(0, 240, 255, 0.15)",
        card: "0 4px 24px rgba(0, 0, 0, 0.3)",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
      },
      animation: {
        "pulse-glow": "pulse-glow 2s ease-in-out infinite",
        float: "float 6s ease-in-out infinite",
      },
      keyframes: {
        "pulse-glow": {
          "0%, 100%": { opacity: "0.4" },
          "50%": { opacity: "1" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-10px)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
