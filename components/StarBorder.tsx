"use client";

import React, { useEffect, useState } from "react";

interface StarBorderProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  as?: React.ElementType;
  color?: string;
  speed?: string;
  className?: string;
  children: React.ReactNode;
}

export default function StarBorder({
  as: Component = "button",
  className = "",
  color = "#0F766E",
  speed = "5s",
  children,
  disabled,
  ...rest
}: StarBorderProps) {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setPrefersReducedMotion(
        window.matchMedia("(prefers-reduced-motion: reduce)").matches
      );
    }
  }, []);

  const isAnimated = !disabled && !prefersReducedMotion;

  return (
    <Component
      disabled={disabled}
      className={`group relative inline-flex items-center justify-center p-[2px] overflow-hidden rounded-lg font-semibold transition-transform active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ok ${className}`}
      {...rest}
    >
      {isAnimated && (
        <>
          <span
            className="pointer-events-none absolute w-[300%] h-[300%] -top-[100%] -left-[100%] z-0 animate-star-bottom opacity-70"
            style={{
              background: `radial-gradient(circle, ${color} 10%, transparent 25%)`,
              animationDuration: speed,
            }}
          />
          <span
            className="pointer-events-none absolute w-[300%] h-[300%] -top-[100%] -left-[100%] z-0 animate-star-top opacity-70"
            style={{
              background: `radial-gradient(circle, ${color} 10%, transparent 25%)`,
              animationDuration: speed,
            }}
          />
        </>
      )}
      <span className="relative z-10 w-full h-full flex items-center justify-center rounded-[6px] transition-colors">
        {children}
      </span>
    </Component>
  );
}
