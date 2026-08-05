"use client";

// ============================================================================
//  components/website/admin/SwitchTemplateDialog.tsx — confirm before
//  resetting colours/fonts to a different template's defaults.
// ============================================================================

export function SwitchTemplateDialog({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center"
      style={{ background: "rgba(10,10,10,.44)", backdropFilter: "blur(6px)" }}
      onClick={onCancel}
    >
      <div
        className="w-[440px] rounded-[20px] border p-[26px]"
        style={{ background: "var(--surface)", borderColor: "var(--hair)", boxShadow: "var(--shadow-dialog)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex h-[38px] w-[38px] items-center justify-center rounded-xl text-lg"
          style={{ background: "color-mix(in srgb, var(--brand) 10%, var(--surface))", color: "var(--brand)" }}
        >
          ◗
        </div>
        <div className="font-display mt-3.5 text-2xl tracking-[-0.02em] text-ink">Change template?</div>
        <div className="mt-2 text-[13.5px] leading-[1.6] text-muted">
          Your words, photos and section order carry over. Colours and fonts reset to the new template&apos;s starting point
          — you can change them straight after.
        </div>
        <div className="mt-5 flex gap-2.5">
          <button type="button" onClick={onCancel} className="flex-1 rounded-xl border py-2.5 text-[13.5px]" style={{ borderColor: "var(--hair)" }}>
            Stay here
          </button>
          <button type="button" onClick={onConfirm} className="flex-1 rounded-xl py-2.5 text-[13.5px] font-semibold text-white" style={{ background: "var(--brand)" }}>
            Browse templates
          </button>
        </div>
      </div>
    </div>
  );
}
