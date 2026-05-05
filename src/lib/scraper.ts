import { chromium } from "playwright-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

export interface ScrapedPage {
  html: string;
  title: string;
  url: string;
  baseUrl: string;
}

/** Lightweight scraper using plain fetch — no headless browser, low memory */
async function scrapeLightweight(url: string): Promise<ScrapedPage> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml",
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch page: ${res.status} ${res.statusText}`);
  }

  const html = await res.text();
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : url;

  const parsed = new URL(url);
  const baseUrl = `${parsed.protocol}//${parsed.host}`;

  return { html, title, url, baseUrl };
}

/** Full scraper using Playwright with stealth — renders JavaScript, bypasses basic bot detection */
async function scrapeWithPlaywright(url: string): Promise<ScrapedPage> {
  chromium.use(StealthPlugin());
  const browser = await chromium.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--single-process",
      "--no-zygote",
    ],
  });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    viewport: { width: 1440, height: 900 },
  });

  const page = await context.newPage();

  await page.route("**/*", (route) => {
    const type = route.request().resourceType();
    if (["media", "websocket", "font", "image"].includes(type)) {
      return route.abort();
    }
    return route.continue();
  });

  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });

    // Wait for content — longer wait for Cloudflare/bot challenge pages
    await page.waitForFunction(
      () => document.body && document.body.innerHTML.length > 1000,
      { timeout: 15000 }
    ).catch(() => {});

    // Check if we hit a Cloudflare challenge — wait longer for it to resolve
    const isChallenge = await page.evaluate(() => {
      const text = document.body?.innerText || "";
      return text.includes("security verification") || text.includes("Checking your browser") || text.includes("Just a moment");
    });

    if (isChallenge) {
      console.log("Detected Cloudflare challenge, waiting for resolution...");
      await page.waitForFunction(
        () => {
          const text = document.body?.innerText || "";
          return !text.includes("security verification") && !text.includes("Checking your browser") && !text.includes("Just a moment");
        },
        { timeout: 20000 }
      ).catch(() => {
        console.warn("Cloudflare challenge did not resolve within timeout");
      });
      await page.waitForTimeout(3000);
    } else {
      await page.waitForTimeout(5000);
    }

    // Dismiss popups
    await page.evaluate(() => {
      const dismissSelectors = [
        '[class*="cookie"] button', '[class*="consent"] button',
        '[id*="cookie"] button', '[id*="consent"] button',
        '[id*="onetrust"] button', 'button[class*="accept"]',
        'button[class*="dismiss"]', 'button[class*="close"]',
        '[aria-label="Close"]', '[aria-label="close"]',
      ];
      for (const sel of dismissSelectors) {
        const btn = document.querySelector(sel) as HTMLElement;
        if (btn) { btn.click(); break; }
      }
      const removeSelectors = [
        '[class*="cookie"]', '[class*="Cookie"]',
        '[class*="consent"]', '[class*="Consent"]',
        '[id*="cookie"]', '[id*="consent"]', '[id*="onetrust"]',
        '[class*="gdpr"]', '[aria-modal="true"]', '[role="dialog"]',
      ];
      for (const sel of removeSelectors) {
        document.querySelectorAll(sel).forEach((el) => el.remove());
      }
      document.body.style.overflow = "auto";
      document.documentElement.style.overflow = "auto";
    });

    const title = await page.title();
    const html = await page.content();

    const parsed = new URL(url);
    const baseUrl = `${parsed.protocol}//${parsed.host}`;

    return { html, title, url, baseUrl };
  } finally {
    await browser.close();
  }
}

/** Check if scraped HTML is a bot protection page instead of real content */
function isBotProtectionPage(html: string): boolean {
  const lowerHtml = html.toLowerCase();
  const indicators = [
    "performing security verification",
    "checking your browser",
    "just a moment",
    "enable javascript and cookies to continue",
    "attention required! | cloudflare",
    "ray id:",
    "cf-browser-verification",
    "challenge-platform",
    "_cf_chl_opt",
    "managed challenge",
  ];
  const matchCount = indicators.filter((i) => lowerHtml.includes(i)).length;
  // If 2+ indicators match, it's likely a challenge page
  return matchCount >= 2;
}

/** Scrape a page — tries Playwright first, falls back to lightweight fetch */
export async function scrapePage(url: string): Promise<ScrapedPage> {
  try {
    const result = await scrapeWithPlaywright(url);
    if (isBotProtectionPage(result.html)) {
      throw new Error("BOT_PROTECTION: The site is behind Cloudflare bot protection and blocked the scraper. Please save the page from your browser (Ctrl+S / Cmd+S) and use Upload HTML mode.");
    }
    return result;
  } catch (err) {
    if ((err as Error).message.startsWith("BOT_PROTECTION:")) {
      throw err; // Don't fall back — the lightweight scraper will also be blocked
    }
    console.warn("Playwright scrape failed, falling back to lightweight fetch:", (err as Error).message);
    return await scrapeLightweight(url);
  }
}
