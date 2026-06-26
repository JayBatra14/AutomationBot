import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Hero } from "@/features/home/Hero";
import { Services } from "@/features/home/Services";
import { Testimonials } from "@/features/home/Testimonials";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col bg-background">
      <Navbar />
      <Hero />
      <Services />
      <Testimonials />
      <Footer />
    </main>
  );
}
