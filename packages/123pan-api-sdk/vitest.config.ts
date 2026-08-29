import { fileURLToPath } from "url";
import { defineConfig } from "vitest/config";

const rootDir = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  test: {
    environment: "node",
    include: ["packages/**/__tests__/**/*.test.ts"],
    clearMocks: true,
  },
  resolve: {
    alias: [
      {
        find: /^@123pan\/(core|file|offline|user|direct-link|image|video)\/(.*)$/,
        replacement: `${rootDir}packages/$1/src/$2`,
      },
      {
        find: /^@123pan\/(core|file|offline|user|direct-link|image|video)$/,
        replacement: `${rootDir}packages/$1/src/index.ts`,
      },
    ],
  },
});
