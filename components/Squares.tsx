"use client";

import React, { useRef, useEffect } from "react";

interface SquaresProps {
  direction?: "diagonal" | "up" | "down" | "left" | "right";
  speed?: number;
  borderColor?: string;
  squareSize?: number;
  hoverFillColor?: string;
  className?: string;
}

export default function Squares({
  direction = "diagonal",
  speed = 0.5,
  borderColor = "rgba(20, 33, 61, 0.06)",
  squareSize = 44,
  hoverFillColor = "rgba(15, 118, 110, 0.04)",
  className = "",
}: SquaresProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const requestRef = useRef<number | null>(null);
  const numSquaresX = useRef<number>(0);
  const numSquaresY = useRef<number>(0);
  const gridOffset = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const hoveredSquare = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    const resizeCanvas = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      numSquaresX.current = Math.ceil(canvas.width / squareSize) + 1;
      numSquaresY.current = Math.ceil(canvas.height / squareSize) + 1;
    };

    window.addEventListener("resize", resizeCanvas);
    resizeCanvas();

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const startX = Math.floor(gridOffset.current.x / squareSize);
      const startY = Math.floor(gridOffset.current.y / squareSize);

      for (let x = startX; x < startX + numSquaresX.current; x++) {
        for (let y = startY; y < startY + numSquaresY.current; y++) {
          const squareX = x * squareSize - (gridOffset.current.x % squareSize);
          const squareY = y * squareSize - (gridOffset.current.y % squareSize);

          if (
            hoveredSquare.current &&
            Math.floor((hoveredSquare.current.x + (gridOffset.current.x % squareSize)) / squareSize) === x &&
            Math.floor((hoveredSquare.current.y + (gridOffset.current.y % squareSize)) / squareSize) === y
          ) {
            ctx.fillStyle = hoverFillColor;
            ctx.fillRect(squareX, squareY, squareSize, squareSize);
          }

          ctx.strokeStyle = borderColor;
          ctx.lineWidth = 1;
          ctx.strokeRect(squareX, squareY, squareSize, squareSize);
        }
      }

      // Draw subtle micro dots at intersections for high-precision console feel
      ctx.fillStyle = "rgba(20, 33, 61, 0.12)";
      for (let x = startX; x <= startX + numSquaresX.current; x++) {
        for (let y = startY; y <= startY + numSquaresY.current; y++) {
          const dotX = x * squareSize - (gridOffset.current.x % squareSize);
          const dotY = y * squareSize - (gridOffset.current.y % squareSize);
          ctx.fillRect(dotX - 1, dotY - 1, 2, 2);
        }
      }
    };

    const updateAnimation = () => {
      if (!prefersReducedMotion) {
        const effectiveSpeed = Math.max(speed, 0.1);
        switch (direction) {
          case "right":
            gridOffset.current.x -= effectiveSpeed;
            break;
          case "left":
            gridOffset.current.x += effectiveSpeed;
            break;
          case "up":
            gridOffset.current.y += effectiveSpeed;
            break;
          case "down":
            gridOffset.current.y -= effectiveSpeed;
            break;
          case "diagonal":
            gridOffset.current.x -= effectiveSpeed;
            gridOffset.current.y -= effectiveSpeed;
            break;
        }
      }

      draw();

      if (!prefersReducedMotion) {
        requestRef.current = requestAnimationFrame(updateAnimation);
      }
    };

    if (prefersReducedMotion) {
      draw();
    } else {
      requestRef.current = requestAnimationFrame(updateAnimation);
    }

    return () => {
      window.removeEventListener("resize", resizeCanvas);
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
    };
  }, [direction, speed, borderColor, hoverFillColor, squareSize]);

  return (
    <canvas
      ref={canvasRef}
      className={`w-full h-full border-none block ${className}`}
    />
  );
}
