import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import Hero from "@/components/landing/Hero";
import StatsTicker from "@/components/landing/StatsTicker";
import HowItWorks from "@/components/landing/HowItWorks";
import LiveDemo from "@/components/landing/LiveDemo";
import Features from "@/components/landing/Features";
import Stats from "@/components/landing/Stats";
import CoverageMap from "@/components/landing/CoverageMap";
import Testimonials from "@/components/landing/Testimonials";
import CtaSection from "@/components/landing/CtaSection";

export default function LandingPage() {
  return (
    <>
      <Navbar />
      <main>
        <Hero />
        <StatsTicker />
        <HowItWorks />
        <LiveDemo />
        <Features />
        <Stats />
        <CoverageMap />
        <Testimonials />
        <CtaSection />
      </main>
      <Footer />
    </>
  );
}
