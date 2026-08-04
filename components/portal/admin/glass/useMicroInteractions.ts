// ============================================================================
//  Shared, dependency-free hover/press micro-interactions for the admin glass
//  shell. These write directly to the DOM node via event.currentTarget rather
//  than React state, so they're cheap enough to attach to list rows and don't
//  trigger re-renders. Mirrors the interaction language from the Claude
//  Design import (magnet/glow/ripple) without pulling in a new dependency —
//  framer-motion (already used elsewhere in the admin shell) stays reserved
//  for mount/unmount transitions.
// ============================================================================

import type { MouseEvent } from "react";

const MAGNET_STRENGTH = 9;
const MAGNET_Y_OFFSET = -2;

/** Nudges the element a few px toward the cursor. Pair with onMagnetLeave. */
export function onMagnetMove(e: MouseEvent<HTMLElement>) {
  const el = e.currentTarget;
  const rect = el.getBoundingClientRect();
  const px = (e.clientX - rect.left) / rect.width - 0.5;
  const py = (e.clientY - rect.top) / rect.height - 0.5;
  el.style.transform = `translate3d(${px * MAGNET_STRENGTH}px, ${py * MAGNET_STRENGTH + MAGNET_Y_OFFSET}px, 0)`;
}

export function onMagnetLeave(e: MouseEvent<HTMLElement>) {
  e.currentTarget.style.transform = "translate3d(0,0,0)";
}

/** Drives a radial-gradient spotlight via --mx/--my custom properties. */
export function onGlowMove(e: MouseEvent<HTMLElement>) {
  const el = e.currentTarget;
  const rect = el.getBoundingClientRect();
  el.style.setProperty("--mx", `${e.clientX - rect.left}px`);
  el.style.setProperty("--my", `${e.clientY - rect.top}px`);
}

/** Spawns a short-lived expanding circle from the click point. Requires the
 *  element to be `position: relative; overflow: hidden`. */
export function onRipple(e: MouseEvent<HTMLElement>) {
  const el = e.currentTarget;
  const rect = el.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height) * 1.1;
  const span = document.createElement("span");
  span.style.position = "absolute";
  span.style.left = `${e.clientX - rect.left - size / 2}px`;
  span.style.top = `${e.clientY - rect.top - size / 2}px`;
  span.style.width = `${size}px`;
  span.style.height = `${size}px`;
  span.style.borderRadius = "50%";
  span.style.background = "var(--tg)";
  span.style.pointerEvents = "none";
  span.style.animation = "admin-rip 0.6s ease-out forwards";
  el.appendChild(span);
  window.setTimeout(() => span.remove(), 650);
}
