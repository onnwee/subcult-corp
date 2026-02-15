import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  // ── Structured Logging Enforcement ────────────────────────────────
  // Ban console.* methods to enforce structured logging via @/lib/logger
  // (in src/) or scripts/lib/logger.mjs (in scripts/). In src/, use
  // logger.info(), logger.error(), etc. instead of console.log(),
  // console.error(), etc. In scripts/, use createLogger(...) to get a
  // log instance (e.g. const log = createLogger(...)) and then use
  // log.info(), log.error(), etc. instead of console.log(), console.error().
  {
    files: ["src/**/*.{ts,tsx,js,jsx,mjs}"],
    rules: {
      "no-console": "error",
    },
  },
  // Scripts directory: now enforced
  {
    files: ["scripts/**/*.{mjs,ts}"],
    rules: {
      "no-console": "error",
    },
  },
]);

export default eslintConfig;
