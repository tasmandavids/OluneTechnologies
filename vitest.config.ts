import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Test harness for Olune's money-flow + delivery logic.
// Node environment only — these are pure-function / mocked-Supabase tests,
// no DOM needed. Path alias mirrors tsconfig's "@/*" → repo root.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
      // Build-time guard with no runtime behaviour; unresolvable outside
      // Next's bundler. See tests/stubs/server-only.ts.
      "server-only": fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    exclude: ["tests/integration/**"],
    globals: false,
  },
});
