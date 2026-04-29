"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { getErrorMessage } from "@/lib/error";

export default function RegisterPage() {
  const router = useRouter();
  const { register } = useAuth();
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (form.password !== form.confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);
    try {
      await register({
        email: form.email,
        password: form.password,
        firstName: form.firstName,
        lastName: form.lastName,
      });
      router.push("/dashboard");
    } catch (err) {
      setError(getErrorMessage(err, "Registration failed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center relative py-12">
      {/* Background */}
      <div className="absolute inset-0 bg-glow-radial" />
      <div className="absolute inset-0 bg-grid-pattern bg-grid-40 opacity-30" />

      <div className="relative w-full max-w-md px-4">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2">
            <div className="w-10 h-10 rounded-lg bg-cyber-green/20 border border-cyber-green/30 flex items-center justify-center">
              <svg
                className="w-6 h-6 text-cyber-green"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M22 12H18L15 21L9 3L6 12H2" />
              </svg>
            </div>
            <span className="text-2xl font-bold">
              <span className="text-cyber-green">Cloud</span>
              <span className="text-cyber-text">VM</span>
            </span>
          </Link>
        </div>

        {/* Card */}
        <div className="cyber-card">
          <h2 className="text-2xl font-bold text-cyber-text mb-2">
            Create Account
          </h2>
          <p className="text-cyber-text-dim text-sm mb-6">
            Get started with your free account
          </p>

          {error && (
            <div className="mb-4 px-4 py-3 rounded-lg bg-cyber-red/10 border border-cyber-red/30 text-cyber-red text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-cyber-text-dim mb-1.5">
                  First Name
                </label>
                <input
                  type="text"
                  className="cyber-input"
                  placeholder="John"
                  value={form.firstName}
                  onChange={(e) =>
                    setForm({ ...form, firstName: e.target.value })
                  }
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-cyber-text-dim mb-1.5">
                  Last Name
                </label>
                <input
                  type="text"
                  className="cyber-input"
                  placeholder="Doe"
                  value={form.lastName}
                  onChange={(e) =>
                    setForm({ ...form, lastName: e.target.value })
                  }
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-cyber-text-dim mb-1.5">
                Email
              </label>
              <input
                type="email"
                className="cyber-input"
                placeholder="you@example.com"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-cyber-text-dim mb-1.5">
                Password
              </label>
              <input
                type="password"
                className="cyber-input"
                placeholder="Min. 8 chars (Aa1!)"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
                minLength={8}
                pattern="^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).+$"
                title="At least 8 characters, with uppercase, lowercase, number, and special character"
              />
              <p className="text-xs text-cyber-text-dim mt-1">
                Must contain uppercase, lowercase, number, and special character.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-cyber-text-dim mb-1.5">
                Confirm Password
              </label>
              <input
                type="password"
                className="cyber-input"
                placeholder="Repeat password"
                value={form.confirmPassword}
                onChange={(e) =>
                  setForm({ ...form, confirmPassword: e.target.value })
                }
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="cyber-btn-primary w-full"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg
                    className="animate-spin w-4 h-4"
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
                  Creating account...
                </span>
              ) : (
                "Create Account"
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            <span className="text-cyber-text-dim text-sm">
              Already have an account?{" "}
              <Link
                href="/login"
                className="text-cyber-green hover:text-cyber-cyan transition-colors font-medium"
              >
                Sign In
              </Link>
            </span>
          </div>
        </div>
      </div>
    </main>
  );
}
