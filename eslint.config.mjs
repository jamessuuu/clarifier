// @ts-check
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/.next/**",
      "**/out/**",
      "**/coverage/**",
      "**/node_modules/**",
      "**/playwright-report/**",
      "**/test-results/**",
      "next-env.d.ts",
      "public/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: [],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // SPEC §14: "no `as any` at CSV parse (the one genuinely untyped
      // external input)" — enforced everywhere, not just there.
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    },
  },
  {
    // SPEC §7: core/ never imports the DOM or navigator.gpu and never opens
    // a socket — it is the one implementation CI's eval runs against and the
    // one the WGSL kernel must agree with. Enforced structurally, not just
    // by convention, so a future edit cannot silently reintroduce a DOM call.
    files: ["src/core/**/*.ts"],
    ignores: ["src/core/**/*.test.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["node:*", "react", "react-dom", "next", "next/*"],
              message:
                "SPEC §7 boundary: src/core must stay pure and isomorphic (no DOM, no navigator.gpu, no I/O). Put device/browser code in src/gpu, src/gl, or src/static.",
            },
          ],
        },
      ],
      "no-restricted-globals": [
        "error",
        { name: "window", message: "src/core must be DOM-free (SPEC §7)." },
        { name: "document", message: "src/core must be DOM-free (SPEC §7)." },
        { name: "navigator", message: "src/core must be DOM-free (SPEC §7)." },
      ],
    },
  },
  {
    files: ["**/*.mjs", "scripts/**", "*.config.ts", "playwright.config.ts", "vitest.config.ts"],
    ...tseslint.configs.disableTypeChecked,
    languageOptions: {
      globals: {
        console: "readonly",
        process: "readonly",
        URL: "readonly",
        fetch: "readonly",
      },
    },
  },
  {
    files: ["e2e/**", "scripts/record-demo.mjs"],
    languageOptions: {
      globals: {
        document: "readonly",
        window: "readonly",
        navigator: "readonly",
      },
    },
  }
);
