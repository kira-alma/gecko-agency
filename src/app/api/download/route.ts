import { NextRequest, NextResponse } from "next/server";
import JSZip from "jszip";

export const maxDuration = 120;

/** Fetch a URL with timeout, return text or null */
async function fetchText(url: string, timeout = 10000): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" },
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    clearTimeout(timer);
    return null;
  }
}

/** Fetch a URL with timeout, return buffer or null */
async function fetchBuffer(url: string, timeout = 10000): Promise<ArrayBuffer | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" },
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    return await res.arrayBuffer();
  } catch {
    clearTimeout(timer);
    return null;
  }
}

/** Inline all external CSS into <style> tags and download images locally */
async function buildSelfContainedHtml(html: string, baseUrl: string, zip: JSZip): Promise<string> {
  let result = html;

  // Remove all <script> tags — they won't work locally and the page is already rendered
  result = result.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");

  // Remove <base> tag so local paths work
  result = result.replace(/<base\b[^>]*>/gi, "");

  // 1. Inline external CSS stylesheets
  const linkRegex = /<link[^>]+rel=["']stylesheet["'][^>]+href=["']([^"']+)["'][^>]*\/?>/gi;
  const cssLinks: { fullMatch: string; url: string }[] = [];
  let match;
  while ((match = linkRegex.exec(result)) !== null) {
    const url = match[1].startsWith("http") ? match[1] : `${baseUrl}${match[1]}`;
    cssLinks.push({ fullMatch: match[0], url });
  }

  // Also catch <link href="..." rel="stylesheet"> (href before rel)
  const linkRegex2 = /<link[^>]+href=["']([^"']+)["'][^>]+rel=["']stylesheet["'][^>]*\/?>/gi;
  while ((match = linkRegex2.exec(result)) !== null) {
    const url = match[1].startsWith("http") ? match[1] : `${baseUrl}${match[1]}`;
    if (!cssLinks.some((l) => l.url === url)) {
      cssLinks.push({ fullMatch: match[0], url });
    }
  }

  for (const link of cssLinks) {
    const cssContent = await fetchText(link.url);
    if (cssContent) {
      // Resolve url() references inside CSS to absolute URLs
      const resolvedCss = cssContent.replace(
        /url\(["']?(?!data:)([^)"']+)["']?\)/gi,
        (_m, u) => {
          const absUrl = u.startsWith("http") ? u : new URL(u, link.url).href;
          return `url("${absUrl}")`;
        }
      );
      result = result.replace(link.fullMatch, `<style>/* ${link.url} */\n${resolvedCss}</style>`);
    }
  }

  // 2. Download images and reference locally
  const imgRegex = /(?:src|srcset)=["']((?!data:|blob:|javascript:)[^"'\s,]+)["']/gi;
  const imageUrls = new Map<string, string>(); // url -> local path
  let imgIdx = 0;

  while ((match = imgRegex.exec(result)) !== null) {
    const rawUrl = match[1];
    if (imageUrls.has(rawUrl)) continue;
    const absUrl = rawUrl.startsWith("http") ? rawUrl : `${baseUrl}${rawUrl.startsWith("/") ? "" : "/"}${rawUrl}`;

    // Determine file extension
    let ext = "bin";
    try {
      const pathname = new URL(absUrl).pathname;
      const dotIdx = pathname.lastIndexOf(".");
      if (dotIdx > -1) ext = pathname.slice(dotIdx + 1).split("?")[0].slice(0, 10);
    } catch { /* keep bin */ }

    const localPath = `images/img_${imgIdx++}.${ext}`;
    imageUrls.set(rawUrl, localPath);
  }

  // Fetch images in parallel
  const imgEntries = Array.from(imageUrls.entries());
  const BATCH = 10;
  for (let i = 0; i < imgEntries.length; i += BATCH) {
    const batch = imgEntries.slice(i, i + BATCH);
    await Promise.all(
      batch.map(async ([rawUrl, localPath]) => {
        const absUrl = rawUrl.startsWith("http") ? rawUrl : `${baseUrl}${rawUrl.startsWith("/") ? "" : "/"}${rawUrl}`;
        const buf = await fetchBuffer(absUrl);
        if (buf) {
          zip.file(localPath, buf);
          // Replace all occurrences in HTML
          result = result.split(rawUrl).join(localPath);
        }
      })
    );
  }

  // 3. Inline any remaining <style> blocks that have url() with external refs
  // (already absolute from CSS inlining step, so they'll work as-is)

  // 4. Add viewport meta if missing
  if (!result.includes("viewport")) {
    result = result.replace("<head>", '<head><meta name="viewport" content="width=device-width, initial-scale=1">');
  }

  return result;
}

export async function POST(request: NextRequest) {
  try {
    const { modifiedHtml, baseUrl, pageTitle, type } = await request.json();

    if (!modifiedHtml && type !== "report") {
      return NextResponse.json({ error: "No HTML to download" }, { status: 400 });
    }

    const zip = new JSZip();

    if (type === "report") {
      // Download report as standalone HTML
      const { reportHtml } = await request.json();
      zip.file("report.html", reportHtml || "");
    } else {
      // Build self-contained HTML with inlined CSS and local images
      const selfContainedHtml = await buildSelfContainedHtml(modifiedHtml, baseUrl, zip);
      zip.file("index.html", selfContainedHtml);
    }

    // Add manifest
    const manifest = {
      title: pageTitle,
      baseUrl,
      exportedAt: new Date().toISOString(),
    };
    zip.file("manifest.json", JSON.stringify(manifest, null, 2));

    const zipBuffer = await zip.generateAsync({
      type: "arraybuffer",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    });

    const safeName = (pageTitle || "page")
      .replace(/[^a-zA-Z0-9-_]/g, "_")
      .slice(0, 50);

    return new NextResponse(zipBuffer, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="geckocheck-${safeName}.zip"`,
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
