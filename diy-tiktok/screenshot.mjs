import { chromium } from "playwright";

const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});
const page = await browser.newPage();
await page.setViewportSize({ width: 1280, height: 720 });
await page.goto("http://localhost:3000");
await page.waitForTimeout(5000);
await page.screenshot({ path: "studio-preview.png" });
console.log("Screenshot saved: studio-preview.png");
await browser.close();
