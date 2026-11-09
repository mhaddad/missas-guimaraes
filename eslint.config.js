import js from "@eslint/js";
import tseslint from "typescript-eslint";
import astro from "eslint-plugin-astro";

export default tseslint.config(
  {
    ignores: [
      "**/dist/",
      "**/.astro/",
      "**/.wrangler/",
      "**/node_modules/",
      "dados/",
      "**/dist-e2e/",
      "test-results/",
      "playwright-report/",
      ".lighthouseci/",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strict,
  ...astro.configs.recommended,
  {
    languageOptions: {
      globals: { console: "readonly", process: "readonly", URL: "readonly" },
    },
    rules: {
      // Variáveis com "_" à frente são descartadas de propósito (ex.: tirar uma chave com `...resto`).
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", ignoreRestSiblings: true },
      ],
    },
  },
);
