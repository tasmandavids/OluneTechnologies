// ============================================================================
//  AmbientBackground — the drifting colour blobs behind the admin shell's
//  main content. Pure decoration (aria-hidden, pointer-events: none).
//  Opacity is controlled by --amb (Appearance panel's "Ambience" slider).
// ============================================================================

export function AmbientBackground() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
      style={{ opacity: "var(--amb)" }}
    >
      <div
        className="absolute -top-[18%] left-[2%] h-[58vw] w-[58vw] rounded-full animate-[admin-drift1_44s_ease-in-out_infinite]"
        style={{ background: "radial-gradient(circle at 50% 50%, var(--t3), transparent 68%)", filter: "blur(28px)" }}
      />
      <div
        className="absolute -bottom-[26%] -right-[8%] h-[52vw] w-[52vw] rounded-full animate-[admin-drift2_58s_ease-in-out_infinite]"
        style={{ background: "radial-gradient(circle at 50% 50%, var(--t2), transparent 66%)", filter: "blur(34px)" }}
      />
      <div
        className="absolute right-[22%] top-[24%] h-[34vw] w-[34vw] rounded-full animate-[admin-drift3_66s_ease-in-out_infinite]"
        style={{ background: "radial-gradient(circle at 50% 50%, var(--t1), transparent 68%)", filter: "blur(40px)" }}
      />
      <div
        className="absolute inset-0"
        style={{ background: "radial-gradient(130% 90% at 50% -14%, transparent 42%, rgba(0,0,0,.05))" }}
      />
    </div>
  );
}
