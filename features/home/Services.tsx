"use client";

import { motion } from "framer-motion";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { AnimatedCard } from "@/components/ui/AnimatedCard";
import { Scissors, Droplet, Sparkles, Wind } from "lucide-react";
import { Button } from "@/components/ui/Button";

const services = [
  {
    icon: Scissors,
    title: "Precision Haircut",
    description: "Expert cuts tailored to your face shape and personal style.",
    price: "From $50",
    color: "rgba(138, 43, 226, 0.15)", // Primary
  },
  {
    icon: Droplet,
    title: "Color & Highlights",
    description: "Vibrant coloring, balayage, and custom highlights.",
    price: "From $120",
    color: "rgba(0, 255, 255, 0.15)", // Secondary
  },
  {
    icon: Sparkles,
    title: "Luxury Styling",
    description: "Event-ready styling for your most important moments.",
    price: "From $85",
    color: "rgba(255, 20, 147, 0.15)", // Accent
  },
  {
    icon: Wind,
    title: "Keratin Treatment",
    description: "Smooth, frizz-free hair that lasts for months.",
    price: "From $200",
    color: "rgba(138, 43, 226, 0.15)", // Primary
  },
];

export function Services() {
  return (
    <section className="relative py-32 bg-black overflow-hidden">
      {/* Background Decor */}
      <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-secondary/10 blur-[150px] rounded-full pointer-events-none" />
      
      <div className="container mx-auto px-4 md:px-8 relative z-10">
        <SectionHeading 
          title="Signature Services" 
          subtitle="What We Do" 
          align="center" 
        />

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {services.map((service, index) => (
            <motion.div
              key={service.title}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
            >
              <AnimatedCard glowColor={service.color} className="h-full flex flex-col">
                <div className="w-14 h-14 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mb-6 text-white">
                  <service.icon className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-display font-bold text-white mb-3">
                  {service.title}
                </h3>
                <p className="text-gray-400 mb-6 flex-grow">
                  {service.description}
                </p>
                <div className="flex items-center justify-between mt-auto">
                  <span className="text-lg font-medium text-white">{service.price}</span>
                  <Button variant="ghost" size="sm" className="px-0 hover:bg-transparent text-primary hover:text-white">
                    Book Now →
                  </Button>
                </div>
              </AnimatedCard>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
