"use client";

import React, { useRef, useEffect, useCallback } from "react";

interface Spark {
  x: number;
  y: number;
  angle: number;
  startTime: number;
  color: string;
}

interface ClickSparkProps {
  sparkColor?: string | string[];
  sparkSize?: number;
  sparkRadius?: number;
  sparkCount?: number;
  duration?: number;
  trigger?: boolean;
  className?: string;
  children: React.ReactNode;
}

export default function ClickSpark({
  sparkColor = "#0F766E",
  sparkSize = 12,
  sparkRadius = 28,
  sparkCount = 12,
  duration = 450,
  trigger = false,
  className = "",
  children,
}: ClickSparkProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sparksRef = useRef<Spark[]>([]);
  const animationFrameRef = useRef<number | null>(null);

  const colors = Array.isArray(sparkColor) ? sparkColor : [sparkColor];

  const spawnSparks = useCallback(
    (originX: number, originY: number) => {
      if (typeof window !== "undefined") {
        const prefersReducedMotion = window.matchMedia(
          "(prefers-reduced-motion: reduce)"
        ).matches;
        if (prefersReducedMotion) return;
      }

      const now = performance.now();
      const newSparks: Spark[] = [];

      for (let i = 0; i < sparkCount; i++) {
        const angle = (2 * Math.PI * i) / sparkCount + (Math.random() - 0.5) * 0.4;
        newSparks.push({
          x: originX,
          y: originY,
          angle,
          startTime: now,
          color: colors[Math.floor(Math.random() * colors.length)],
        });
      }

      sparksRef.current.push(...newSparks);
    },
    [sparkCount, colors]
  );

  const animate = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const now = performance.now();

    sparksRef.current = sparksRef.current.filter((spark) => {
      const elapsed = now - spark.startTime;
      if (elapsed >= duration) return false;

      const progress = elapsed / duration;
      const easeProgress = 1 - Math.pow(1 - progress, 3);
      const distance = easeProgress * sparkRadius;

      const currentX = spark.x + Math.cos(spark.angle) * distance;
      const currentY = spark.y + Math.sin(spark.angle) * distance;

      const alpha = 1 - progress;
      const length = sparkSize * (1 - progress * 0.5);

      ctx.save();
      ctx.beginPath();
      ctx.strokeStyle = spark.color;
      ctx.globalAlpha = alpha;
      ctx.lineWidth = 2;
      ctx.lineCap = "round";

      ctx.moveTo(currentX, currentY);
      ctx.lineTo(
        currentX + Math.cos(spark.angle) * length,
        currentY + Math.sin(spark.angle) * length
      );
      ctx.stroke();
      ctx.restore();

      return true;
    });

    if (sparksRef.current.length > 0) {
      animationFrameRef.current = requestAnimationFrame(animate);
    }
  }, [duration, sparkRadius, sparkSize]);

  // Handle programmatic trigger (e.g., when verification succeeds)
  useEffect(() => {
    if (trigger && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      spawnSparks(rect.width / 2, rect.height / 2);
      if (!animationFrameRef.current || sparksRef.current.length <= sparkCount) {
        animationFrameRef.current = requestAnimationFrame(animate);
      }
    }
  }, [trigger, spawnSparks, animate, sparkCount]);

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    spawnSparks(x, y);
    if (!animationFrameRef.current || sparksRef.current.length <= sparkCount) {
      animationFrameRef.current = requestAnimationFrame(animate);
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const resize = () => {
      canvas.width = container.offsetWidth;
      canvas.height = container.offsetHeight;
    };

    resize();
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      onClick={handleClick}
      className={`relative inline-block ${className}`}
    >
      <canvas
        ref={canvasRef}
        className="pointer-events-none absolute inset-0 z-20 h-full w-full"
      />
      {children}
    </div>
  );
}
