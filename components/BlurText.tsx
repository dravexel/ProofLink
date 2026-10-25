"use client";

import React, { useEffect, useState } from "react";
import { motion, Transition } from "framer-motion";

interface BlurTextProps {
  text: string;
  delay?: number;
  className?: string;
  animateBy?: "words" | "letters";
  direction?: "top" | "bottom";
  threshold?: number;
  onAnimationComplete?: () => void;
}

export default function BlurText({
  text = "",
  delay = 100,
  className = "",
  animateBy = "words",
  direction = "top",
  threshold = 0.1,
  onAnimationComplete,
}: BlurTextProps) {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setPrefersReducedMotion(
        window.matchMedia("(prefers-reduced-motion: reduce)").matches
      );
    }
  }, []);

  const elements = animateBy === "words" ? text.split(" ") : text.split("");

  const defaultFrom = {
    filter: prefersReducedMotion ? "blur(0px)" : "blur(10px)",
    opacity: prefersReducedMotion ? 1 : 0,
    transform: prefersReducedMotion
      ? "translate3d(0,0,0)"
      : direction === "top"
      ? "translate3d(0,-24px,0)"
      : "translate3d(0,24px,0)",
  };

  const defaultTo = {
    filter: "blur(0px)",
    opacity: 1,
    transform: "translate3d(0,0,0)",
  };

  return (
    <span className={`inline-block ${className}`}>
      {elements.map((el, i) => {
        const transition: Transition = {
          duration: prefersReducedMotion ? 0 : 0.45,
          delay: prefersReducedMotion ? 0 : (i * delay) / 1000,
          ease: [0.25, 0.1, 0.25, 1],
        };

        return (
          <motion.span
            key={i}
            initial={defaultFrom}
            whileInView={defaultTo}
            viewport={{ once: true, amount: threshold }}
            transition={transition}
            onAnimationComplete={
              i === elements.length - 1 ? onAnimationComplete : undefined
            }
            className="inline-block"
            style={{ willChange: "transform, filter, opacity" }}
          >
            {el === " " ? "\u00A0" : el}
            {animateBy === "words" && i < elements.length - 1 && "\u00A0"}
          </motion.span>
        );
      })}
    </span>
  );
}
