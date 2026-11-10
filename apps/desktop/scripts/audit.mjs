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
  ["Overview", "home"],
  ["Explore", "explore"],
  ["Categories", "categories"],
  ["Library", "library"],
  ["Updates", "updates"],
  ["My Agents", "agents"],
  ["Sources", "sources"],
  ["Activity", "activity"],
  ["Settings", "settings"],
];

async function shot(name) {
  await page.screenshot({ path: path.join(outDir, `${name}.png`) });
}

async function clickNav(label) {
  await page.getByText(label, { exact: true }).first().click({ timeout: 3000 });
  await page.waitForTimeout(350);
}

const results = [];
await page.waitForTimeout(600);
for (const [label, slug] of routes) {
  try {
    await clickNav(label);
  } catch {
    results.push({ route: slug, navigation: "label not found" });
    continue;
  }
  const heading = await page
    .locator("h1, h2")
    .first()
    .textContent()
    .catch(() => null);
  results.push({ route: slug, heading: heading?.trim() ?? null });
  await shot(slug);
}

// Explore: query, result list, and skill detail sheet.
await clickNav("Explore");
const search = page.locator("#explore-search");
if (await search.count()) {
  await search.fill("review");
  await page.waitForTimeout(650);
  await shot("explore-search");
}
const firstSkill = page.locator("article").first();
if (await firstSkill.count()) {
  await firstSkill.click();
  await page.waitForTimeout(500);
  await shot("skill-detail");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(250);
}

// Source form.
await clickNav("Sources");
const addSource = page.getByRole("button", { name: "Add source" }).first();
if (await addSource.count()) {
  await addSource.click();
  await page.waitForTimeout(350);
  await shot("source-form");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(250);
}

// Light theme is a persisted setting; switch, save, capture Home.
await clickNav("Settings");
const light = page.getByRole("radio", { name: /Light/ }).first();
if (await light.count()) {
  await light.click();
  const save = page.getByRole("button", { name: "Save changes" }).first();
  if (await save.count()) {
    await save.click();
    await page.waitForTimeout(850);
    await clickNav("Overview");
    await shot("home-light");
    await clickNav("Settings");
    const dark = page.getByRole("radio", { name: /Dark/ }).first();
    if (await dark.count()) {
      await dark.click();
      const saveAgain = page.getByRole("button", { name: "Save changes" }).first();
      if (await saveAgain.count()) {
        await saveAgain.click();
        await page.waitForTimeout(700);
      }
    }
  }
}

// Narrow viewport via CDP emulation (980×640 minimum window).
const cdpSession = await context.newCDPSession(page);
await cdpSession.send("Emulation.setDeviceMetricsOverride", {
  width: 980,
  height: 640,
  deviceScaleFactor: 1,
  mobile: false,
});
await page.evaluate(() => {
  window.location.hash = "#/home";
});
await page.waitForTimeout(300);
await shot("home-980x640");
await cdpSession.send("Emulation.clearDeviceMetricsOverride");
await page.waitForTimeout(300);

console.log(JSON.stringify({ results, consoleErrors }, null, 2));
await browser.close();
