import { chromium } from "playwright";

export interface ScrapedPage {
  html: string;
  title: string;
  url: string;
  baseUrl: string;
}

export async function scrapePage(url: string): Promise<ScrapedPage> {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    viewport: { width: 1440, height: 900 },
  });

  const page = await context.newPage();

  // Only block media and websockets — keep CSS, JS, fonts, images
  await page.route("**/*", (route) => {
    const type = route.request().resourceType();
    if (["media", "websocket"].includes(type)) {
      return route.abort();
    }
    return route.continue();
  });

  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });

    // Wait for the body to have meaningful content
    await page.waitForFunction(
      () => document.body && document.body.innerHTML.length > 1000,
      { timeout: 15000 }
    ).catch(() => {});

    // Give JS frameworks time to render and CSS to load
    await page.waitForTimeout(5000);

    // Dismiss cookie banners, popups, and modals
    await page.evaluate(() => {
      // Click common dismiss/accept buttons
      const dismissSelectors = [
        '[class*="cookie"] button',
        '[class*="consent"] button',
        '[id*="cookie"] button',
        '[id*="consent"] button',
        '[id*="onetrust"] button',
        'button[class*="accept"]',
        'button[class*="dismiss"]',
        'button[class*="close"]',
        '[aria-label="Close"]',
        '[aria-label="close"]',
      ];
      for (const sel of dismissSelectors) {
        const btn = document.querySelector(sel) as HTMLElement;
        if (btn) { btn.click(); break; }
      }
      // Remove overlay/modal elements
      const removeSelectors = [
        '[class*="cookie"]', '[class*="Cookie"]',
        '[class*="consent"]', '[class*="Consent"]',
        '[id*="cookie"]', '[id*="consent"]', '[id*="onetrust"]',
        '[class*="gdpr"]', '[aria-modal="true"]', '[role="dialog"]',
      ];
      for (const sel of removeSelectors) {
        document.querySelectorAll(sel).forEach((el) => el.remove());
      }
      // Unlock body scroll
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
