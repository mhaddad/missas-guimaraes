import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["pacotes/*/src/**/*.test.ts", "scripts/**/*.test.ts", "worker/src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["pacotes/*/src/**/*.ts"],
      exclude: ["**/*.test.ts", "**/teste-util.ts", "**/*.gerado.ts", "**/gerado/**"],
      thresholds: {
        // Motor e dados: cobertura mínima de 95 % (§5.3, §14).
        "pacotes/*/src/**": { lines: 95, statements: 95, functions: 95, branches: 90 },
      },
    },
  },
});
