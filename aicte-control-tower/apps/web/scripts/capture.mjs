import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const baseUrl = process.env.BASE_URL ?? "http://localhost:3000";
const outDir = path.resolve(process.cwd(), "../../docs/screens/phase1");

const pages = [
  { name: "landing", path: "/" },
  { name: "how-it-works", path: "/how-it-works" },
  { name: "roles", path: "/roles" },
  { name: "about", path: "/about" },
  { name: "login", path: "/login" },
  { name: "design-system", path: "/design-system" },
];

const viewports = [
  { label: "1440", width: 1440, height: 900 },
  { label: "390", width: 390, height: 844 },
];

await mkdir(outDir, { recursive: true });

const browser = await chromium.launch();
const errors = [];

for (const viewport of viewports) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`${page.url()} ${message.text()}`);
  });

  for (const entry of pages) {
    await page.goto(`${baseUrl}${entry.path}`, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(300);
    const file = path.join(outDir, `${entry.name}-${viewport.label}.png`);
    await page.screenshot({ path: file, fullPage: true });
    console.log(`saved ${file}`);
  }

  await context.close();
}

await browser.close();

if (errors.length > 0) {
  console.error("Console errors:");
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
}
