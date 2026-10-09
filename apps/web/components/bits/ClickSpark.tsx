/* eslint-disable */
'use client';
// Adapted from React Bits (https://reactbits.dev) — ClickSpark, TS + Tailwind variant, MIT + Commons Clause license.
// Source: https://github.com/DavidHDev/react-bits/blob/b2098591ad5b3489eff65ca9e5b9f9bdf2de29c3/src/ts-tailwind/Animations/ClickSpark/ClickSpark.tsx
// SpookPad changes: one fixed full-viewport canvas that listens to clicks on the whole page (no wrapper element, so
// no page-sized canvas); it draws only while sparks are alive; keyboard "clicks" (detail 0) make no sparks.
import { useEffect, useRef } from 'react';

interface ClickSparkProps {
  sparkColor?: string;
  sparkSize?: number;
  sparkRadius?: number;
  sparkCount?: number;
  duration?: number;
  extraScale?: number;
}

interface Spark {
  x: number;
  y: number;
  angle: number;
  startTime: number;
}

const easeOut = (t: number) => t * (2 - t);

export default function ClickSpark({
  sparkColor = '#fff',
  sparkSize = 10,
  sparkRadius = 15,
  sparkCount = 8,
  duration = 400,
  extraScale = 1.0
}: ClickSparkProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    let sparks: Spark[] = [];
    let raf = 0;

    const resize = () => {
      canvas.width = document.documentElement.clientWidth; // not innerWidth: that includes the scrollbar and made the page scroll sideways
      canvas.height = document.documentElement.clientHeight;
    };

    const draw = (now: number) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      sparks = sparks.filter(spark => {
        const elapsed = now - spark.startTime;
        if (elapsed >= duration) return false;
        const eased = easeOut(elapsed / duration);
        const distance = eased * sparkRadius * extraScale;
        const lineLength = sparkSize * (1 - eased);
        ctx.strokeStyle = sparkColor;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(spark.x + distance * Math.cos(spark.angle), spark.y + distance * Math.sin(spark.angle));
        ctx.lineTo(
          spark.x + (distance + lineLength) * Math.cos(spark.angle),
          spark.y + (distance + lineLength) * Math.sin(spark.angle)
        );
        ctx.stroke();
        return true;
      });
      raf = sparks.length ? requestAnimationFrame(draw) : 0;
    };

    const onClick = (e: MouseEvent) => {
      if (e.detail === 0) return;
      const now = performance.now();
      for (let i = 0; i < sparkCount; i++) {
        sparks.push({ x: e.clientX, y: e.clientY, angle: (2 * Math.PI * i) / sparkCount, startTime: now });
      }
      if (!raf) raf = requestAnimationFrame(draw);
    };

    resize();
    // the page box changes size with the window and when a scrollbar appears (no window resize event for that)
    const ro = new ResizeObserver(resize);
    ro.observe(document.documentElement);
    window.addEventListener('click', onClick);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('click', onClick);
    };
  }, [sparkColor, sparkSize, sparkRadius, sparkCount, duration, extraScale]);

  return <canvas ref={canvasRef} aria-hidden className="pointer-events-none fixed inset-0 z-[60]" />;
}
