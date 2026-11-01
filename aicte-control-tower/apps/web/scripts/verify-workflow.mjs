import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const baseUrl = process.env.BASE_URL ?? "http://localhost:3000";
const outDir = path.resolve(process.cwd(), "../../docs/screens/phase3");
await mkdir(outDir, { recursive: true });

const password = "DemoPass!26";
const invoicePdf = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF",
);

const browser = await chromium.launch();

async function shot(page, name) {
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(outDir, `${name}.png`), fullPage: true });
  console.log(`saved ${name}.png`);
}

async function signIn(page, chip, portal) {
  await page.goto(`${baseUrl}/login`, { waitUntil: "load" });
  await page.getByRole("button", { name: chip, exact: true }).click();
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(`**${portal}`, { timeout: 20000 });
}

async function fillSignDialog(page) {
  await page.locator("#sign-password").fill(password);
  await page.getByRole("button", { name: "Sign and record" }).click();
}

const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();

// 1. Institution files a new application through the wizard.
await signIn(page, "Institution", "/institution/overview");
await page.goto(`${baseUrl}/institution/applications/new`, { waitUntil: "load" });
await shot(page, "wizard-basics-1440");
await page.getByRole("radio", { name: /Increase in intake/ }).check();
await page.getByRole("button", { name: "Continue" }).click();
const fileInputs = page.locator('input[type="file"]');
const count = await fileInputs.count();
for (let index = 0; index < count; index += 1) {
  await fileInputs.nth(index).setInputFiles({
    name: `evidence-${index + 1}.pdf`,
    mimeType: "application/pdf",
    buffer: invoicePdf,
  });
}
await shot(page, "wizard-documents-1440");
await page.getByRole("button", { name: "Continue" }).click();
await shot(page, "wizard-review-1440");
await page.getByRole("button", { name: "Continue" }).click();
await page.getByRole("button", { name: "Submit application" }).click();
await page.waitForURL(/\/institution\/applications\/[0-9a-f-]+$/, { timeout: 30000 });
const caseUrl = page.url();
console.log("created case:", caseUrl);
await page.getByRole("heading", { name: "Why this case is delayed" }).waitFor();
await page.getByRole("tab", { name: /Documents/ }).click();
const documentRows = await page.getByRole("tabpanel").locator("li").count();
console.log("documents attached:", documentRows);
await shot(page, "case-institution-1440");

// 2. Regional Officer returns the case with a signed decision.
await context.clearCookies();
await signIn(page, "Regional Officer", "/regional/overview");
await page.goto(caseUrl.replace("/institution/", "/regional/"), { waitUntil: "load" });
await page.getByRole("heading", { name: "Why this case is delayed" }).waitFor();
await shot(page, "case-regional-1440");
await page.getByRole("button", { name: "Revert to institution" }).click();
await page
  .locator("#revert-evidence")
  .fill("Upload the revised fire NOC issued to the trust, not the contractor.");
await fillSignDialog(page);
await page.getByText("returned to the institution").waitFor({ timeout: 15000 });
console.log("revert recorded");

// 3. Institution resubmits.
await context.clearCookies();
await signIn(page, "Institution", "/institution/overview");
await page.goto(caseUrl, { waitUntil: "load" });
await page.getByRole("button", { name: "Resubmit evidence" }).first().click();
await page
  .getByRole("dialog")
  .getByRole("button", { name: "Resubmit evidence" })
  .click();
await page.getByText("Evidence resubmitted").waitFor({ timeout: 15000 });
console.log("resubmission recorded");

// 4. Regional Officer clears scrutiny, signed.
await context.clearCookies();
await signIn(page, "Regional Officer", "/regional/overview");
await page.goto(caseUrl.replace("/institution/", "/regional/"), { waitUntil: "load" });
await page.getByRole("button", { name: "Clear scrutiny" }).click();
await fillSignDialog(page);
await page.getByText("Scrutiny cleared").waitFor({ timeout: 15000 });
await page.reload({ waitUntil: "load" });
await page.getByRole("heading", { name: "Why this case is delayed" }).waitFor();
await shot(page, "case-after-clear-1440");
console.log("scrutiny cleared, stage now:", await page.locator("dl dd").first().innerText());

// 5. Demo clock and notifications.
await page.getByRole("button", { name: /Demo clock/ }).click();
await page.getByRole("button", { name: "+7 days" }).click();
await page.getByText(/Clock moved to/).waitFor({ timeout: 20000 });
await shot(page, "demo-clock-1440");
await page.getByRole("button", { name: "Close" }).click();

await page.getByRole("button", { name: /^Notifications/ }).click();
await page.getByRole("heading", { name: "Notifications" }).waitFor();
await shot(page, "notification-drawer-1440");
await page.keyboard.press("Escape");

// 6. Bureau audit chain and escalations.
await context.clearCookies();
await signIn(page, "Bureau Officer", "/bureau/overview");
await page.goto(`${baseUrl}/bureau/audit`, { waitUntil: "load" });
await page.getByRole("button", { name: "Verify chain" }).click();
await page.getByText(/Chain verified|Chain broken/).waitFor({ timeout: 15000 });
console.log("audit:", await page.getByText(/Chain verified|Chain broken/).first().innerText());
await shot(page, "audit-1440");

await page.goto(`${baseUrl}/bureau/escalations`, { waitUntil: "load" });
await shot(page, "escalations-1440");

await context.close();
await browser.close();
await writeFile(path.join(outDir, "case-url.txt"), caseUrl);
console.log("done");
