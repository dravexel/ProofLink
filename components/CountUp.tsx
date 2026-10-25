"use client";

import React, { useEffect, useRef, useState } from "react";
import { useInView } from "framer-motion";

interface CountUpProps {
  from?: number;
  to: number;
  duration?: number;
  delay?: number;
  className?: string;
  separator?: string;
}

export default function CountUp({
  from = 0,
  to,
  duration = 1.8,
  delay = 0.1,
  className = "",
  separator = "",
}: CountUpProps) {
  const [displayValue, setDisplayValue] = useState<number>(from);
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true, amount: 0.3 });
  const hasAnimated = useRef(false);

  useEffect(() => {
    if (!isInView || hasAnimated.current) return;

    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    if (prefersReducedMotion) {
      setDisplayValue(to);
      hasAnimated.current = true;
      return;
    }

    hasAnimated.current = true;
    let startTime: number | null = null;
    let animationFrameId: number;

    const timeoutId = setTimeout(() => {
      const step = (timestamp: number) => {
        if (!startTime) startTime = timestamp;
        const progress = Math.min((timestamp - startTime) / (duration * 1000), 1);
        
        // Easing function (easeOutExpo)
        const easeOut =
          progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
        
        const current = Math.floor(from + (to - from) * easeOut);
        setDisplayValue(current);

        if (progress < 1) {
          animationFrameId = requestAnimationFrame(step);
        } else {
          setDisplayValue(to);
        }
      };

      animationFrameId = requestAnimationFrame(step);
    }, delay * 1000);

    return () => {
      clearTimeout(timeoutId);
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
    };
  }, [isInView, from, to, duration, delay]);

  const formatted = separator
    ? displayValue.toLocaleString()
    : displayValue.toString();

  return (
    <span ref={ref} className={className}>
      {formatted}
    </span>
  );
}
