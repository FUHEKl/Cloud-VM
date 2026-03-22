import Link from "next/link";

const plans = [
  {
    name: "Free",
    price: "0",
    period: "forever",
    description: "Perfect for learning and experimentation",
    features: [
      "1 Virtual Machine",
      "1 vCPU",
      "1 GB RAM",
      "10 GB Disk",
      "Web Terminal Access",
      "Community Support",
    ],
    cta: "Start Free",
    highlighted: false,
    color: "cyan" as const,
  },
  {
    name: "Pro",
    price: "2,500",
    period: "/month",
    description: "For students and small projects",
    features: [
      "5 Virtual Machines",
      "4 vCPU per VM",
      "8 GB RAM per VM",
      "100 GB Total Disk",
      "Web Terminal Access",
      "SSH Key Management",
      "Priority Support",
    ],
    cta: "Get Started",
    highlighted: true,
    color: "green" as const,
  },
  {
    name: "Enterprise",
    price: "10,000",
    period: "/month",
    description: "For teams and production workloads",
    features: [
      "Unlimited VMs",
      "16 vCPU per VM",
      "32 GB RAM per VM",
      "500 GB Total Disk",
      "Web Terminal + VNC Access",
      "SSH Key Management",
      "Dedicated Support",
      "Custom OS Templates",
    ],
    cta: "Contact Sales",
    highlighted: false,
    color: "cyan" as const,
  },
];

export default function Pricing() {
  return (
    <section id="pricing" className="py-24 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section header */}
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">
            <span className="text-cyber-text">Simple </span>
            <span className="text-cyber-green">Pricing</span>
          </h2>
          <p className="text-cyber-text-dim max-w-2xl mx-auto">
            Choose the plan that fits your needs. All plans include web terminal
            access.
          </p>
        </div>

        {/* Plans grid */}
        <div className="grid md:grid-cols-3 gap-6 items-start">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`cyber-card relative overflow-hidden transition-all duration-300 ${
                plan.highlighted
                  ? "border-cyber-green/40 shadow-glow-green scale-105"
                  : "hover:border-cyber-cyan/30"
              }`}
            >
              {plan.highlighted && (
                <div className="absolute top-0 right-0 bg-cyber-green text-cyber-bg text-xs font-bold px-3 py-1 rounded-bl-lg">
                  POPULAR
                </div>
              )}

              <div className="mb-6">
                <h3 className="text-xl font-bold text-cyber-text mb-1">
                  {plan.name}
                </h3>
                <p className="text-cyber-text-dim text-sm">
                  {plan.description}
                </p>
              </div>

              <div className="mb-6">
                <span className="text-4xl font-extrabold text-cyber-text">
                  {plan.price}
                </span>
                <span className="text-cyber-text-dim ml-1">
                  DZD {plan.period}
                </span>
              </div>

              <ul className="space-y-3 mb-8">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-center gap-3 text-sm">
                    <svg
                      className={`w-4 h-4 flex-shrink-0 ${plan.highlighted ? "text-cyber-green" : "text-cyber-cyan"}`}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                    <span className="text-cyber-text-dim">{f}</span>
                  </li>
                ))}
              </ul>

              <Link
                href="/register"
                className={`block text-center w-full ${
                  plan.highlighted ? "cyber-btn-primary" : "cyber-btn-secondary"
                }`}
              >
                {plan.cta}
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
