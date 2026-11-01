import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const baseUrl = process.env.BASE_URL ?? "http://localhost:3000";
const outDir = path.resolve(process.cwd(), "../../docs/screens/phase5");
await mkdir(outDir, { recursive: true });

const password = "DemoPass!26";
const pdf = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF",
);

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();

async function shot(name) {
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(outDir, `${name}.png`), fullPage: true });
  console.log(`saved ${name}.png`);
}

async function signIn(chip, portal) {
  await context.clearCookies();
  await page.goto(`${baseUrl}/login`, { waitUntil: "load" });
  await page.getByRole("button", { name: chip, exact: true }).click();
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(`**${portal}`, { timeout: 20000 });
}

async function signAndConfirm(name = "Sign and record") {
  await page.locator("#visit-password, #obligation-password, #document-password").first().fill(password);
  await page.getByRole("button", { name }).click();
}

// 1. Coordinator schedules a visit; the same-district expert is blocked.
await signIn("EVC Coordinator", "/evc/queue");
await shot("evc-queue-1440");
await page.getByRole("button", { name: "Schedule visit" }).first().click();
const blocked = await page.locator("fieldset input:disabled").count();
console.log("experts disabled by the district rule:", blocked);
await shot("evc-schedule-1440");
await page.locator("fieldset input:not(:disabled)").first().check();
await page.getByRole("button", { name: "Schedule visit" }).last().click();
await page.getByText(/Visit scheduled for/).waitFor({ timeout: 20000 });
console.log("visit scheduled");
await shot("evc-scheduled-1440");

await page.getByRole("button", { name: "Record outcome" }).first().click();
await page.locator("#visit-recommendation").fill(
  "Panel visited the campus, checked the labs, library and the faculty register against the application.",
);
await signAndConfirm();
await page.getByText(/Visit outcome recorded/).waitFor({ timeout: 20000 });
console.log("visit recorded");

// 2. Institution submits evidence against an undertaking.
await signIn("Institution", "/institution/overview");
await page.goto(`${baseUrl}/institution/undertakings`, { waitUntil: "load" });
await shot("undertakings-institution-1440");
await page.getByRole("button", { name: "Upload evidence" }).first().click();
await page.locator('input[type="file"]').last().setInputFiles({
  name: "fire-safety-certificate.pdf",
  mimeType: "application/pdf",
  buffer: pdf,
});
await page.getByText(/Evidence uploaded/).waitFor({ timeout: 20000 });
console.log("evidence uploaded");

// 3. Institution renews a document, then an officer confirms its dates.
await page.goto(`${baseUrl}/institution/documents`, { waitUntil: "load" });
await shot("documents-institution-1440");
await page.getByRole("button", { name: "Upload renewal" }).first().click();
await page.locator('input[type="file"]').last().setInputFiles({
  name: "lease-renewal.pdf",
  mimeType: "application/pdf",
  buffer: pdf,
});
await page.getByText(/Renewal uploaded/).waitFor({ timeout: 20000 });
console.log("renewal uploaded");

// 4. Regional Officer verifies the undertaking.
await signIn("Regional Officer", "/regional/overview");
await page.goto(`${baseUrl}/regional/undertakings`, { waitUntil: "load" });
await page.getByRole("button", { name: "Verify" }).first().click();
await signAndConfirm();
await page.getByText(/marked verified/).waitFor({ timeout: 20000 });
console.log("undertaking verified");
await shot("undertakings-officer-1440");

// 5. Regional Officer confirms the renewal dates.
await page.goto(`${baseUrl}/regional/documents`, { waitUntil: "load" });
await page.getByRole("button", { name: /Confirm dates|Correct dates/ }).first().click();
await page.locator("#issue-date").fill("2026-04-01");
await page.locator("#expiry-date").fill("2027-03-31");
await signAndConfirm();
await page.getByText(/Dates confirmed/).waitFor({ timeout: 20000 });
console.log("document dates confirmed");
await shot("documents-officer-1440");

// 6. Bureau view of the undertaking register.
await signIn("Bureau Officer", "/bureau/overview");
await page.goto(`${baseUrl}/bureau/undertakings`, { waitUntil: "load" });
await shot("undertakings-bureau-1440");

await context.close();
await browser.close();
console.log("done");
