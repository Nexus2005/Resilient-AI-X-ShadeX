import { chromium } from "playwright";

const baseUrl = process.env.BASE_URL ?? "http://localhost:3000";
const routes = ["/", "/how-it-works", "/roles", "/about", "/login", "/design-system"];
const viewports = [
  { label: "1440", width: 1440, height: 1000 },
  { label: "390", width: 390, height: 844 },
];

const browser = await chromium.launch();
let violations = 0;
let smallest = { size: Infinity, sample: "" };

for (const viewport of viewports) {
  const page = await browser.newPage({ viewport });
  for (const route of routes) {
    await page.goto(`${baseUrl}${route}`, { waitUntil: "load" });
    await page.waitForTimeout(500);

    const found = await page.evaluate(() => {
      const results = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        const text = node.textContent?.trim();
        if (!text) continue;
        const parent = node.parentElement;
        if (!parent) continue;
        const style = getComputedStyle(parent);
        if (style.visibility === "hidden" || style.display === "none") continue;
        if (parent.closest("[aria-hidden='true'], .sr-only")) continue;
        const size = Number.parseFloat(style.fontSize);
        if (Number.isFinite(size)) {
          results.push({ size, text: text.slice(0, 40), tag: parent.tagName });
        }
      }
      return results;
    });

    for (const item of found) {
      if (item.size < smallest.size) smallest = item;
      if (item.size < 11) {
        violations += 1;
        console.log(`VIOLATION ${route} @${viewport.label}: ${item.size}px "${item.text}" <${item.tag}>`);
      }
    }
  }
  await page.close();
}

await browser.close();

console.log(`Smallest computed font size: ${smallest.size}px ("${smallest.text}")`);
console.log(`Text nodes below 11px: ${violations}`);
process.exitCode = violations > 0 ? 1 : 0;
