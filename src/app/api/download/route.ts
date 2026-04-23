import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 120;

/** Fetch text with timeout */
async function fetchText(url: string, timeout = 10000): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" },
    });
    clearTimeout(timer);
    return res.ok ? await res.text() : null;
  } catch { clearTimeout(timer); return null; }
}

/**
 * Build a self-contained HTML file:
 * - Inline all external CSS (with absolute URLs for fonts/images inside CSS)
 * - Convert all relative URLs to absolute so the file works when opened locally
 * - Remove scripts (won't work locally, page is already rendered)
 */
async function buildSelfContainedHtml(html: string, baseUrl: string): Promise<string> {
  let result = html;

  // Remove all <script> tags
  result = result.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");

  // Remove existing <base> tag
  result = result.replace(/<base\b[^>]*>/gi, "");

  // 1. Inline external CSS stylesheets
  const linkRegex = /<link\b[^>]*?href=["']([^"']+\.css[^"']*)["'][^>]*>/gi;
  const cssLinks: { fullMatch: string; url: string }[] = [];
  let match;
  while ((match = linkRegex.exec(result)) !== null) {
    // Only process stylesheet links
    if (!match[0].includes("stylesheet") && !match[0].includes(".css")) continue;
    const url = match[1].startsWith("http") ? match[1] : `${baseUrl}${match[1].startsWith("/") ? "" : "/"}${match[1]}`;
    cssLinks.push({ fullMatch: match[0], url });
  }

  for (const link of cssLinks) {
    const cssContent = await fetchText(link.url);
    if (cssContent) {
      // Make all url() references inside CSS absolute
      const resolvedCss = cssContent.replace(
        /url\(["']?(?!data:|blob:|https?:)([^)"']+)["']?\)/gi,
        (_m, u) => {
          try {
            const absUrl = new URL(u, link.url).href;
            return `url("${absUrl}")`;
          } catch { return _m; }
        }
      );
      result = result.replace(link.fullMatch, `<style>/* Inlined: ${link.url} */\n${resolvedCss}</style>`);
    }
  }

  // 2. Make all remaining relative URLs absolute
  // src attributes
  result = result.replace(
    /(src=["'])((?!data:|blob:|javascript:|https?:|#)\/[^"']*)(["'])/gi,
    (_m, pre, url, suf) => `${pre}${baseUrl}${url}${suf}`
  );

  // href attributes (but not anchors)
  result = result.replace(
    /(href=["'])((?!data:|blob:|javascript:|https?:|#|mailto:)\/[^"']*)(["'])/gi,
    (_m, pre, url, suf) => `${pre}${baseUrl}${url}${suf}`
  );

  // srcset attributes
  result = result.replace(
    /(srcset=["'])([^"']+)(["'])/gi,
    (_m, pre, srcset, suf) => {
      const fixed = srcset.replace(/(^|,\s*)(\/[^\s,]+)/g, (_m2: string, sep: string, url: string) => `${sep}${baseUrl}${url}`);
      return `${pre}${fixed}${suf}`;
    }
  );

  // CSS url() in inline styles
  result = result.replace(
    /url\(["']?(?!data:|blob:|https?:)(\/[^)"']+)["']?\)/gi,
    (_m, url) => `url("${baseUrl}${url}")`
  );

  // 3. Add viewport if missing
  if (!result.includes("viewport")) {
    result = result.replace("<head>", '<head><meta name="viewport" content="width=device-width, initial-scale=1">');
  }

  return result;
}

export async function POST(request: NextRequest) {
  try {
    const { modifiedHtml, baseUrl, pageTitle } = await request.json();

    if (!modifiedHtml) {
      return NextResponse.json({ error: "No HTML to download" }, { status: 400 });
    }

    const selfContainedHtml = await buildSelfContainedHtml(modifiedHtml, baseUrl);

    const safeName = (pageTitle || "page")
      .replace(/[^a-zA-Z0-9-_]/g, "_")
      .slice(0, 50);

    // Return as a single HTML file — no zip needed since CSS is inlined
    // and all URLs are absolute (images load from the original server)
    return new NextResponse(selfContainedHtml, {
      headers: {
        "Content-Type": "text/html",
        "Content-Disposition": `attachment; filename="geckocheck-${safeName}.html"`,
      },
    });
  } catch (error) {
    console.error("Download error:", error);
    return NextResponse.json(
      { error: "Failed to create download: " + (error as Error).message },
      { status: 500 }
    );
  }
}
