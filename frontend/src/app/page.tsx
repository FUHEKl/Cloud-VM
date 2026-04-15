import Navbar from "@/components/landing/Navbar";
import Hero from "@/components/landing/Hero";
import Features from "@/components/landing/Features";
import Pricing from "@/components/landing/Pricing";
import Footer from "@/components/landing/Footer";
import LandingRedirectGate from "@/components/auth/LandingRedirectGate";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-cyber-bg">
      <LandingRedirectGate />
      <Navbar />
      <Hero />
      <Features />
      <Pricing />
      <Footer />
    </main>
  );
}
