/// <reference types="vitest/config" />
import { getViteConfig } from "astro/config";

export default getViteConfig({
  test: {
    include: ["tests/**/*.test.ts", "scripts/**/*.test.ts", "src/**/*.test.ts"],
    environment: "node",
  },
});
