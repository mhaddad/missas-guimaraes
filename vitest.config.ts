import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["pacotes/*/src/**/*.test.ts", "scripts/**/*.test.ts", "worker/src/**/*.test.ts"],
  },
});
