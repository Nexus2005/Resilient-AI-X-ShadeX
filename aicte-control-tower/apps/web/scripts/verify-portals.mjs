import { chromium } from "playwright";

const baseUrl = process.env.BASE_URL ?? "http://localhost:3000";

const accounts = [
  {
    role: "Institution",
    email: "institution@demo.controltower.in",
    portal: "/institution/overview",
    heading: "Overview",
  },
  {
    role: "Regional Officer",
    email: "regional@demo.controltower.in",
    portal: "/regional/overview",
    heading: "Overview",
  },
  {
    role: "EVC Coordinator",
    email: "evc@demo.controltower.in",
    portal: "/evc/queue",
    heading: "EVC queue",
  },
  {
    role: "Bureau Officer",
    email: "bureau@demo.controltower.in",
    portal: "/bureau/overview",
    heading: "Overview",
  },
  {
    role: "Admin",
    email: "admin@demo.controltower.in",
    portal: "/admin/overview",
    heading: "Overview",
  },
];

const failures = [];
const browser = await chromium.launch();

// Signed-out protection
{
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${baseUrl}/regional/overview`, { waitUntil: "load" });
  if (!page.url().includes("/login")) {
    failures.push(`Signed-out access to /regional/overview was not redirected (got ${page.url()})`);
  } else {
    console.log("Signed-out portal access redirects to /login");
  }
  await context.close();
}

// Wrong password
{
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${baseUrl}/login`, { waitUntil: "load" });
  await page.getByLabel("Email address").fill("institution@demo.controltower.in");
  await page.getByLabel("Password").fill("wrong-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByText("Email or password is incorrect.").waitFor({ timeout: 8000 }).catch(() => {});
  const alerts = await page.getByRole("alert").allTextContents();
  const message = alerts.join(" ").trim();
  if (!message.includes("Email or password is incorrect")) {
    failures.push(`Wrong password message was "${message}"`);
  } else {
    console.log(`Wrong password shows: ${message}`);
  }
  await context.close();
}

for (const account of accounts) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await page.goto(`${baseUrl}/login`, { waitUntil: "load" });
  await page.getByRole("button", { name: account.role, exact: true }).click();
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(`**${account.portal}`, { timeout: 15000 }).catch(() => {});

  const url = page.url();
  const headingCount = await page.getByRole("heading", { name: account.heading, level: 1 }).count();
  const bodyText = await page.locator("body").innerText();
  const hasFigures = /\d/.test(bodyText);

  if (!url.endsWith(account.portal)) {
    failures.push(`${account.role} landed on ${url}, expected ${account.portal}`);
  } else if (headingCount === 0) {
    failures.push(`${account.role} portal is missing the "${account.heading}" heading`);
  } else if (!hasFigures) {
    failures.push(`${account.role} portal shows no figures`);
  } else {
    console.log(`${account.role} signed in and landed on ${account.portal}`);
  }

  if (consoleErrors.length > 0) {
    failures.push(`${account.role} console errors: ${consoleErrors.join(" | ")}`);
  }

  await context.close();
}

// Landing figures and chart
{
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto(baseUrl, { waitUntil: "load" });
  const text = await page.locator("section[aria-labelledby='outcomes-heading']").innerText();
  const chart = await page.locator(".recharts-surface").count();
  if (!/\d/.test(text)) failures.push("Landing outcomes strip shows no live figures");
  if (chart === 0) failures.push("Landing hero chart did not render (no .recharts-surface)");
  if (/\d/.test(text) && chart > 0) console.log("Landing shows live summary figures and the Recharts chart");
  await context.close();
}

await browser.close();

if (failures.length > 0) {
  console.error("FAILURES");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log("All portal checks passed");
}
