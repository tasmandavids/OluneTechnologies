"use client";

import { MotionConfig } from "framer-motion";
import type { ReactNode } from "react";

/** Honors prefers-reduced-motion for every framer-motion animation app-wide. */
export function MotionProvider({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
