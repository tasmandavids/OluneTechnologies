import { FlatCompat } from "@eslint/eslintrc";
import { fileURLToPath } from "url";
import path from "path";
import typescriptEslint from "@typescript-eslint/eslint-plugin";
import nextPlugin from "@next/eslint-plugin-next";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const compat = new FlatCompat({
  baseDirectory: __dirname,
  resolvePluginsRelativeTo: __dirname,
});

const config = [
  // Ignore generated/build output — next lint did this automatically
  {
    ignores: [
      // Globbed with a leading **/ so nested copies are covered too. A git
      // worktree under .claude/worktrees/ carries its own .next/, and a
      // root-relative ".next/**" does not match it — which put 13 errors from
      // generated webpack output into every local `npm run lint`, hiding the
      // real ones. CI never saw them because it clones without the worktrees.
      "**/.next/**",
      "**/node_modules/**",
      "**/out/**",
      "public/**",
      "**/.vercel/**",
      ".claude/**",
      // The Expo app has its own toolchain and lint config; the web
      // eslint run would flag React Native globals and JSX it cannot resolve.
      "mobile/**",
    ],
  },
  // Load eslint-config-next via the legacy compat layer
  ...compat.extends("next"),
  // Explicitly provide the plugins that FlatCompat can't auto-resolve in ESLint 9
  {
    plugins: {
      "@typescript-eslint": typescriptEslint,
      "@next/next": nextPlugin,
    },
  },
];

export default config;
