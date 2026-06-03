import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";
import path from "path";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode ?? "test", process.cwd(), "");
  return {
    test: {
      environment: "node",
      include: ["src/tests/integration/**/*.test.ts"],
      testTimeout: 30_000,
      env,
    },
    resolve: {
      alias: {
        "@": path.resolve(process.cwd(), "src"),
      },
    },
  };
});
