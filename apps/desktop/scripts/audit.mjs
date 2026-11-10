import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const cdp = process.env.CDP_URL ?? "http://127.0.0.1:9222";
const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(here, "../../../docs/audit");
mkdirSync(outDir, { recursive: true });

const browser = await chromium.connectOverCDP(cdp);
const context = browser.contexts()[0];
const page = context.pages()[0];
if (!page) throw new Error("No WebView2 page found");

const consoleErrors = [];
page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
});
page.on("pageerror", (error) => consoleErrors.push(error.message));

const routes = [
  ["Home", "home"],
  ["Explore", "explore"],
  ["Categories", "categories"],
  ["Library", "library"],
  ["Updates", "updates"],
  ["My Agents", "agents"],
  ["Sources", "sources"],
  ["Activity", "activity"],
  ["Settings", "settings"],
];

const results = [];
await page.waitForTimeout(800);
for (const [label, slug] of routes) {
  try {
    const target = page.getByText(label, { exact: true }).first();
    await target.click({ timeout: 2500 });
    await page.waitForTimeout(500);
  } catch {
    // The initial route may already be active or the label may be hidden.
  }
  const heading = await page
    .locator("h1, h2")
    .first()
    .textContent()
    .catch(() => null);
  const body = await page.locator("body").innerText();
  results.push({
    route: slug,
    heading: heading?.trim() ?? null,
    empty: /no |empty|nothing|sync|add |install /i.test(body),
    consoleErrors: consoleErrors.length,
  });
  await page.screenshot({ path: path.join(outDir, `${slug}-1320x860.png`) });
}

await page.screenshot({ path: path.join(outDir, "home-final-1320x860.png") });
console.log(JSON.stringify({ results, consoleErrors }, null, 2));
await browser.close();
