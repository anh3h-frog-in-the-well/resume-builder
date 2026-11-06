import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    include: ["tests/unit/**/*.test.{ts,tsx}"],
    setupFiles: ["tests/setup/vitest.setup.ts"],
    // Page-level tests drive long user-event sequences through React.
    testTimeout: 15_000,
    clearMocks: true,
    restoreMocks: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      reportsDirectory: "coverage",
      include: [
        "src/auth.ts",
        "src/client/**/*.tsx",
        "src/app/page.tsx",
        "src/app/login/page.tsx",
        "src/util/**/*.ts",
        "src/lib/password.ts",
        "src/lib/request-body.ts",
        "src/service/ollama-service.ts",
        "src/service/resume-service.ts",
        "src/service/resume-storage.ts",
        "src/service/legacy-migration.ts",
        "src/app/api/**/route.ts",
      ],
      exclude: ["src/app/api/auth/**"],
    },
  },
});
