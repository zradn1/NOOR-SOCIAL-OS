"use client";

import { motion, useScroll, useTransform, type MotionValue } from "framer-motion";
import { useRef, type ComponentProps, type PointerEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

/**
 * Tracks the pointer as --spot-x / --spot-y so the `spotlight` utility can light
 * the card from where the visitor is looking. Writes CSS variables directly, so
 * moving the pointer never re-renders React.
 */
export function Spotlight({ className, children, ...props }: ComponentProps<"div">) {
  const ref = useRef<HTMLDivElement>(null);
  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    el.style.setProperty("--spot-x", `${event.clientX - rect.left}px`);
    el.style.setProperty("--spot-y", `${event.clientY - rect.top}px`);
  }
  return (
    <div ref={ref} onPointerMove={onPointerMove} className={cn("spotlight", className)} {...props}>
      {children}
    </div>
  );
}

/** Product frame that starts tilted back and settles flat as it scrolls into view. */
export function ScrollTilt({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "start 0.35"] });
  const rotateX = useTransform(scrollYProgress, [0, 1], [22, 0]);
  const scale = useTransform(scrollYProgress, [0, 1], [0.92, 1]);
  const y = useTransform(scrollYProgress, [0, 1], [40, 0]);
  return (
    <div ref={ref} className={cn("[perspective:1600px]", className)}>
      <motion.div style={{ rotateX, scale, y, transformOrigin: "50% 0%" }}>{children}</motion.div>
    </div>
  );
}

/**
 * A statement whose words light up from muted to ivory as it scrolls through
 * the viewport. Every word is readable from the start (muted ink passes
 * contrast); the motion only adds emphasis.
 */
export function LightUpText({ text, accent = [], className }: { text: string; accent?: string[]; className?: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 0.85", "end 0.45"] });
  const words = text.split(" ");
  return (
    <p ref={ref} className={className}>
      {words.map((word, i) => (
        <Word
          key={`${word}-${i}`}
          progress={scrollYProgress}
          range={[i / words.length, (i + 1) / words.length]}
          accent={accent.includes(word.replace(/[.,]/g, ""))}
        >
          {word}
        </Word>
      ))}
    </p>
  );
}

function Word({
  children,
  progress,
  range,
  accent,
}: {
  children: string;
  progress: MotionValue<number>;
  range: [number, number];
  accent: boolean;
}) {
  const lit = accent ? "#d9bf8f" : "#f4efe4";
  const color = useTransform(progress, range, ["#8f897d", lit]);
  return (
    <>
      <motion.span style={{ color }} className={cn(accent && "italic")}>
        {children}
      </motion.span>{" "}
    </>
  );
}
