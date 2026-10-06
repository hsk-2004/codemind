import { FeaturesSection } from "./_components/features";
import { Hero } from "./_components/hero";
import { HowItWorksSection } from "./_components/how-it-works";
import { Navbar } from "./_components/navbar";
import { TechStackSection } from "./_components/tech-stack";

export default function Home() {
  return (
    <main className="min-h-screen overflow-x-hidden">
      <Navbar />
      <Hero />
      <FeaturesSection />
      <HowItWorksSection />
      <TechStackSection />
    </main>
  );
}
