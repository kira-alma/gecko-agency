import { chromium } from "playwright";

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

/** Full scraper using Playwright — renders JavaScript, higher memory usage */
async function scrapeWithPlaywright(url: string): Promise<ScrapedPage> {
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

    await page.waitForFunction(
      () => document.body && document.body.innerHTML.length > 1000,
      { timeout: 15000 }
    ).catch(() => {});

    await page.waitForTimeout(5000);

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

/** Scrape a page — tries Playwright first, falls back to lightweight fetch */
export async function scrapePage(url: string): Promise<ScrapedPage> {
  try {
    return await scrapeWithPlaywright(url);
  } catch (err) {
    console.warn("Playwright scrape failed, falling back to lightweight fetch:", (err as Error).message);
    return await scrapeLightweight(url);
  }
}
