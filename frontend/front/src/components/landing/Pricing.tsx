import Link from "next/link";

const plans = [
  {
    name: "Starter",
    price: "0",
    period: "/month",
    description: "For demos and first-time exploration",
    features: [
      "1 Virtual Machine",
      "20 VM hours / month",
      "1 vCPU",
      "1 GB RAM",
      "10 GB Disk",
      "Web Terminal Access",
      "Community Support",
    ],
    cta: "Create Free Account",
    href: "/register",
    highlighted: false,
    color: "cyan" as const,
  },
  {
    name: "Student",
    price: "29",
    period: "/month",
    description: "For labs, assignments, and semester projects",
    features: [
      "Up to 2 Virtual Machines",
      "60 VM hours / month",
      "2 vCPU per VM",
      "4 GB RAM per VM",
      "40 GB Disk per VM",
      "Web Terminal Access",
      "SSH Key Management",
      "Email Support",
    ],
    cta: "Choose Student",
    href: "/dashboard/billing?plan=student",
    highlighted: true,
    color: "green" as const,
  },
  {
    name: "Pro",
    price: "79",
    period: "/month",
    description: "For heavier dev/test and team workflows",
    features: [
      "Up to 6 Virtual Machines",
      "220 VM hours / month",
      "4 vCPU per VM",
      "8 GB RAM per VM",
      "120 GB Disk per VM",
      "Web Terminal Access",
      "SSH Key Management",
      "Dedicated Support",
      "Priority Queue",
    ],
    cta: "Choose Pro",
    href: "/dashboard/billing?plan=pro",
    highlighted: false,
    color: "cyan" as const,
  },
  {
    name: "Enterprise",
    price: "199",
    period: "/month",
    description: "For multi-user PFE demos and production-like labs",
    features: [
      "Up to 20 Virtual Machines",
      "900 VM hours / month",
      "8 vCPU per VM",
      "16 GB RAM per VM",
      "400 GB Disk per VM",
      "Web Terminal + SSH Keys",
      "SLA-style Support",
      "Custom Plan Review",
    ],
    cta: "Choose Enterprise",
    href: "/dashboard/billing?plan=enterprise",
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
        <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-6 items-start">
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
                  DT {plan.period}
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
                href={plan.href}
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
