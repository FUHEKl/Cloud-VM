import Link from "next/link";

export default function Hero() {
  return (
    <section className="relative min-h-screen flex items-center overflow-hidden">
      {/* Background effects */}
      <div className="absolute inset-0 bg-glow-radial" />
      <div className="absolute inset-0 hex-grid opacity-30" />
      <div className="absolute inset-0 bg-grid-pattern bg-grid-40 opacity-40" />

      {/* Floating hexagons decoration */}
      <div className="absolute top-1/4 right-1/4 w-64 h-64 animate-float">
        <div className="relative w-full h-full">
          <div className="absolute inset-0 border border-cyber-green/20 rounded-2xl rotate-45 transform" />
          <div className="absolute inset-4 border border-cyber-cyan/10 rounded-2xl rotate-12 transform" />
          <div className="absolute inset-8 bg-cyber-green/5 rounded-2xl -rotate-12 transform flex items-center justify-center">
            <svg
              className="w-16 h-16 text-cyber-green/40"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1"
            >
              <rect x="2" y="3" width="20" height="14" rx="2" />
              <path d="M8 21h8M12 17v4" />
            </svg>
          </div>
        </div>
      </div>

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-16">
        <div className="max-w-3xl">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-cyber-green/20 bg-cyber-green/5 mb-8">
            <span className="w-2 h-2 rounded-full bg-cyber-green animate-pulse-glow" />
            <span className="text-cyber-green text-sm font-medium">
              Virtual Lab Cloud Platform
            </span>
          </div>

          {/* Headline */}
          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-extrabold leading-tight mb-6">
            <span className="text-cyber-text">Virtual Lab</span>
            <br />
            <span className="bg-gradient-to-r from-cyber-green to-cyber-cyan bg-clip-text text-transparent">
              Cloud
            </span>
          </h1>

          {/* Subtitle */}
          <p className="text-lg sm:text-xl text-cyber-text-dim max-w-2xl mb-4">
            Virtual Machines &amp; Databases
          </p>

          {/* Description */}
          <p className="text-base text-cyber-text-dim/80 max-w-xl mb-10">
            Deploy and manage virtual machines in the cloud. Access your VMs
            directly from the browser with our built-in web terminal. Scale
            resources on demand with our flexible plans.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-4">
            <Link
              href="/register"
              className="cyber-btn-primary text-center text-lg !px-8 !py-4"
            >
              Get Started Free
            </Link>
            <Link
              href="#features"
              className="cyber-btn-secondary text-center text-lg !px-8 !py-4"
            >
              Learn More
            </Link>
          </div>

          {/* Stats */}
          <div className="mt-16 flex gap-12">
            <div>
              <div className="text-3xl font-bold text-cyber-green">99.9%</div>
              <div className="text-sm text-cyber-text-dim mt-1">Uptime SLA</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-cyber-cyan">{"<"}1s</div>
              <div className="text-sm text-cyber-text-dim mt-1">VM Deploy</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-cyber-green">24/7</div>
              <div className="text-sm text-cyber-text-dim mt-1">Monitoring</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
