"use client";

import { create } from "zustand";

export type ToastVariant = "success" | "error" | "info";

export type Toast = {
  id: number;
  variant: ToastVariant;
  message: string;
};

export type ConfirmOptions = {
  title: string;
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
};

type ConfirmRequest = ConfirmOptions & { resolve: (confirmed: boolean) => void };

type FeedbackState = {
  toasts: Toast[];
  confirmRequest: ConfirmRequest | null;
  pushToast: (variant: ToastVariant, message: string) => void;
  dismissToast: (id: number) => void;
  requestConfirm: (options: ConfirmOptions) => Promise<boolean>;
  resolveConfirm: (confirmed: boolean) => void;
};

const MAX_VISIBLE_TOASTS = 5;

let nextToastId = 1;

export const useFeedbackStore = create<FeedbackState>((set, get) => ({
  toasts: [],
  confirmRequest: null,
  pushToast: (variant, message) =>
    set((s) => ({
      toasts: [...s.toasts.slice(-(MAX_VISIBLE_TOASTS - 1)), { id: nextToastId++, variant, message }],
    })),
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  requestConfirm: (options) =>
    new Promise<boolean>((resolve) => {
      // Only one confirm at a time; a newer request cancels the older one.
      get().confirmRequest?.resolve(false);
      set({ confirmRequest: { ...options, resolve } });
    }),
  resolveConfirm: (confirmed) => {
    const request = get().confirmRequest;
    if (!request) return;
    request.resolve(confirmed);
    set({ confirmRequest: null });
  },
}));

/** Imperative toast API — callable from any client code, no hook required. */
export const toast = {
  success: (message: string) => useFeedbackStore.getState().pushToast("success", message),
  error: (message: string) => useFeedbackStore.getState().pushToast("error", message),
  info: (message: string) => useFeedbackStore.getState().pushToast("info", message),
};

/**
 * Branded drop-in replacement for `window.confirm`:
 *
 *   if (!(await confirmDialog({ title: t("deleteConfirm"), destructive: true }))) return;
 */
export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  return useFeedbackStore.getState().requestConfirm(options);
}
