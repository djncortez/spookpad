/* eslint-disable */
'use client';
// Adapted from React Bits (https://reactbits.dev) — TiltedCard, TS + Tailwind variant, MIT + Commons Clause license.
// Source: https://github.com/DavidHDev/react-bits/blob/b2098591ad5b3489eff65ca9e5b9f9bdf2de29c3/src/ts-tailwind/Components/TiltedCard/TiltedCard.tsx
// SpookPad changes: tilts any children (a whole coin card) instead of one image; no tooltip, caption or mobile
// warning; `disabled` renders the children still (touch devices and reduced motion).
import type { SpringOptions } from 'motion/react';
import { motion, useMotionValue, useSpring } from 'motion/react';
import { useRef, type MouseEvent, type ReactNode } from 'react';

const springValues: SpringOptions = {
  damping: 30,
  stiffness: 100,
  mass: 2
};

interface TiltedCardProps {
  children: ReactNode;
  className?: string;
  scaleOnHover?: number;
  rotateAmplitude?: number;
  disabled?: boolean;
}

export default function TiltedCard({
  children,
  className = '',
  scaleOnHover = 1.04,
  rotateAmplitude = 10,
  disabled = false
}: TiltedCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const rotateX = useSpring(useMotionValue(0), springValues);
  const rotateY = useSpring(useMotionValue(0), springValues);
  const scale = useSpring(1, springValues);

  if (disabled) return <div className={className}>{children}</div>;

  function handleMouse(e: MouseEvent<HTMLDivElement>) {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const offsetX = e.clientX - rect.left - rect.width / 2;
    const offsetY = e.clientY - rect.top - rect.height / 2;
    rotateX.set((offsetY / (rect.height / 2)) * -rotateAmplitude);
    rotateY.set((offsetX / (rect.width / 2)) * rotateAmplitude);
  }

  function handleMouseLeave() {
    scale.set(1);
    rotateX.set(0);
    rotateY.set(0);
  }

  return (
    <div
      ref={ref}
      className={`[perspective:800px] ${className}`}
      onMouseMove={handleMouse}
      onMouseEnter={() => scale.set(scaleOnHover)}
      onMouseLeave={handleMouseLeave}
    >
      <motion.div className="h-full [transform-style:preserve-3d]" style={{ rotateX, rotateY, scale }}>
        {children}
      </motion.div>
    </div>
  );
}
