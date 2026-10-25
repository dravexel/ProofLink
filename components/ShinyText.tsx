"use client";

import React, { useEffect, useState } from "react";

interface ShinyTextProps {
  text?: string;
  children?: React.ReactNode;
  disabled?: boolean;
  speed?: number;
  className?: string;
}

export default function ShinyText({
  text,
  children,
  disabled = false,
  speed = 4,
  className = "",
}: ShinyTextProps) {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setPrefersReducedMotion(
        window.matchMedia("(prefers-reduced-motion: reduce)").matches
      );
    }
  }, []);

  const content = text ?? children;
  const isAnimated = !disabled && !prefersReducedMotion;

  return (
    <span
      className={`relative inline-block font-bold ${
        isAnimated ? "animate-shine" : ""
      } ${className}`}
      style={{
        backgroundImage: isAnimated
          ? "linear-gradient(120deg, currentColor 0%, currentColor 35%, rgba(15, 118, 110, 0.95) 50%, currentColor 65%, currentColor 100%)"
          : "none",
        backgroundSize: "200% 100%",
        WebkitBackgroundClip: isAnimated ? "text" : "initial",
        WebkitTextFillColor: isAnimated ? "transparent" : "inherit",
        animationDuration: `${speed}s`,
      }}
    >
      {content}
    </span>
  );
}
