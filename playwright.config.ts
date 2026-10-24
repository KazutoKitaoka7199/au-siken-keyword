import { defineConfig } from "@playwright/test";
import chromium from "@sparticuz/chromium";
import { mkdirSync } from "node:fs";

const cacheDir = "/tmp/ap-keyword-browser-cache";
mkdirSync(cacheDir, { recursive: true });

export default defineConfig({
  testDir: "./e2e",
  timeout: 30000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:5173",
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo",
    launchOptions: {
      executablePath:
        process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ??
        (await chromium.executablePath()),
      args: chromium.args.filter((arg) => arg !== "--single-process"),
      env: { ...process.env, XDG_CACHE_HOME: cacheDir },
    },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 1050 } } },
    {
      name: "mobile",
      use: {
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: {
    command: "npm run dev -- --port 5173 --strictPort",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: !process.env.CI,
  },
});
