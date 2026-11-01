import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const baseUrl = process.env.BASE_URL ?? "http://localhost:3000";
const outDir = path.resolve(process.cwd(), "../../docs/screens/phase2");
await mkdir(outDir, { recursive: true });

const accounts = [
  { name: "institution", chip: "Institution", portal: "/institution/overview", extra: "/institution/applications" },
  { name: "regional", chip: "Regional Officer", portal: "/regional/overview", extra: "/regional/applications" },
  { name: "evc", chip: "EVC Coordinator", portal: "/evc/queue" },
  { name: "bureau", chip: "Bureau Officer", portal: "/bureau/overview" },
  { name: "admin", chip: "Admin", portal: "/admin/overview" },
];

const browser = await chromium.launch();

async function shot(page, name) {
  await page.waitForTimeout(400);
  const file = path.join(outDir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  console.log(`saved ${file}`);
}

for (const account of accounts) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 950 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.goto(`${baseUrl}/login`, { waitUntil: "load" });
  await page.getByRole("button", { name: account.chip, exact: true }).click();
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(`**${account.portal}`, { timeout: 15000 });
  await shot(page, `${account.name}-overview-1440`);
  if (account.extra) {
    await page.goto(`${baseUrl}${account.extra}`, { waitUntil: "load" });
    await shot(page, `${account.name}-applications-1440`);
  }
  await context.close();
}

// Mobile landing and institution overview
{
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.goto(`${baseUrl}/login`, { waitUntil: "load" });
  await shot(page, "login-390");
  await page.getByRole("button", { name: "Institution", exact: true }).click();
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/institution/overview", { timeout: 15000 });
  await shot(page, "institution-overview-390");
  await context.close();
}

await browser.close();
