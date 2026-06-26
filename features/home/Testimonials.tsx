"use client";

import { useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { Star, Quote } from "lucide-react";

const testimonials = [
  {
    name: "Sarah Johnson",
    role: "Regular Client",
    content: "Absolutely transformative experience. The AI recommendations were spot on, and the styling was flawless. Lumina is more than a salon, it's an experience.",
    rating: 5,
  },
  {
    name: "Michael Chen",
    role: "First Time Visitor",
    content: "The futuristic vibe matched with incredible skill. Best haircut I've had in years. The booking process via WhatsApp was incredibly seamless.",
    rating: 5,
  },
  {
    name: "Emma Davis",
    role: "Premium Member",
    content: "I love the atmosphere and the attention to detail. Every visit feels like a VIP experience. Highly recommend their luxury styling.",
    rating: 5,
  },
];

export function Testimonials() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start end", "end start"],
  });

  const x = useTransform(scrollYProgress, [0, 1], [0, -500]);

  return (
    <section ref={containerRef} className="py-32 bg-[#050505] relative overflow-hidden">
      <div className="absolute top-1/2 left-0 w-[500px] h-[500px] bg-primary/10 blur-[150px] rounded-full pointer-events-none -translate-y-1/2" />
      
      <div className="container mx-auto px-4 md:px-8 relative z-10">
        <SectionHeading 
          title="Client Stories" 
          subtitle="Testimonials" 
          align="left" 
        />
        
        <div className="mt-16 -mx-4 md:-mx-8 overflow-hidden">
          <motion.div 
            style={{ x }}
            className="flex gap-6 px-4 md:px-8 w-max"
          >
            {testimonials.map((testimonial, i) => (
              <div 
                key={i} 
                className="w-[350px] md:w-[450px] glass rounded-2xl p-8 shrink-0 flex flex-col gap-6"
              >
                <div className="flex text-accent">
                  {[...Array(testimonial.rating)].map((_, i) => (
                    <Star key={i} className="w-5 h-5 fill-current" />
                  ))}
                </div>
                <Quote className="w-10 h-10 text-white/10" />
                <p className="text-gray-300 text-lg leading-relaxed flex-grow">
                  "{testimonial.content}"
                </p>
                <div>
                  <h4 className="text-white font-bold">{testimonial.name}</h4>
                  <p className="text-primary text-sm">{testimonial.role}</p>
                </div>
              </div>
            ))}
            {/* Duplicate for infinite feel */}
            {testimonials.map((testimonial, i) => (
              <div 
                key={`dup-${i}`} 
                className="w-[350px] md:w-[450px] glass rounded-2xl p-8 shrink-0 flex flex-col gap-6"
              >
                <div className="flex text-accent">
                  {[...Array(testimonial.rating)].map((_, i) => (
                    <Star key={i} className="w-5 h-5 fill-current" />
                  ))}
                </div>
                <Quote className="w-10 h-10 text-white/10" />
                <p className="text-gray-300 text-lg leading-relaxed flex-grow">
                  "{testimonial.content}"
                </p>
                <div>
                  <h4 className="text-white font-bold">{testimonial.name}</h4>
                  <p className="text-primary text-sm">{testimonial.role}</p>
                </div>
              </div>
            ))}
          </motion.div>
        </div>
      </div>
    </section>
  );
}
