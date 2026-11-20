import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "test",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  projects: [
    // Pure logic, no browser.
    { name: "unit", testMatch: /unit\/.*\.spec\.ts/ },
    // The cookie rejecter against fixture banners in a real browser.
    { name: "dom", testMatch: /dom\/.*\.spec\.ts/, use: { browserName: "chromium" } },
    // The built extension loaded into Chromium (run `npm run build` first).
    { name: "extension", testMatch: /extension\/.*\.spec\.ts/ },
  ],
});
