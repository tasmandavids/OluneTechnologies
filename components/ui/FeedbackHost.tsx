"use client";

import { Toaster } from "@/components/ui/Toaster";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

/** Single mount point for the global feedback layer (toasts + confirm dialog). */
export function FeedbackHost() {
  return (
    <>
      <Toaster />
      <ConfirmDialog />
    </>
  );
}
