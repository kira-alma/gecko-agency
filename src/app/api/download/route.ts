import { NextRequest, NextResponse } from "next/server";
import JSZip from "jszip";

export const maxDuration = 120;

interface AssetInfo {
  url: string;
  localPath: string;
  type: string;
}

/** Extract all asset URLs from HTML */
function extractAssets(html: string, baseUrl: string): AssetInfo[] {
  const assets: AssetInfo[] = [];
  const seen = new Set<string>();

  function addAsset(rawUrl: string, type: string) {
    if (!rawUrl || rawUrl.startsWith("data:") || rawUrl.startsWith("blob:") || rawUrl.startsWith("javascript:")) return;
    const absoluteUrl = rawUrl.startsWith("http") ? rawUrl : `${baseUrl}${rawUrl.startsWith("/") ? "" : "/"}${rawUrl}`;
    if (seen.has(absoluteUrl)) return;
    seen.add(absoluteUrl);

    // Create a local path from the URL
    try {
      const parsed = new URL(absoluteUrl);
      let localPath = `assets${parsed.pathname}`;
      // Add host prefix for cross-domain assets
      if (!absoluteUrl.startsWith(baseUrl)) {
        localPath = `assets/${parsed.host}${parsed.pathname}`;
      }
      // Clean up path
      localPath = localPath.replace(/\/+/g, "/").replace(/^\//, "");
      if (localPath.endsWith("/")) localPath += "index";
      assets.push({ url: absoluteUrl, localPath, type });
    } catch { /* invalid URL */ }
  }

  // CSS stylesheets
  const linkMatches = html.matchAll(/<link[^>]+href=["']([^"']+)["'][^>]*>/gi);
  for (const m of linkMatches) {
    if (m[0].includes('rel="stylesheet"') || m[0].includes("rel='stylesheet'") || m[0].includes('.css')) {
      addAsset(m[1], "css");
    }
  }

  // Images
  const imgMatches = html.matchAll(/(?:src|srcset)=["']([^"'\s,]+)["']/gi);
  for (const m of imgMatches) {
    if (!m[1].includes(".js")) {
      addAsset(m[1], "image");
    }
  }

  // CSS url() references
  const urlMatches = html.matchAll(/url\(["']?([^)"']+)["']?\)/gi);
  for (const m of urlMatches) {
    addAsset(m[1], "css-asset");
  }

  // Script files
  const scriptMatches = html.matchAll(/<script[^>]+src=["']([^"']+)["'][^>]*>/gi);
  for (const m of scriptMatches) {
    addAsset(m[1], "script");
  }

  // Fonts from CSS (common patterns)
  const fontMatches = html.matchAll(/url\(["']?([^)"']*\.(?:woff2?|ttf|eot|otf)[^)"']*)["']?\)/gi);
  for (const m of fontMatches) {
    addAsset(m[1], "font");
  }

  return assets;
}

/** Rewrite HTML to use local asset paths */
function rewriteToLocal(html: string, assets: AssetInfo[], baseUrl: string): string {
  let result = html;

  // Remove any existing <base> tag
  result = result.replace(/<base\b[^>]*>/gi, "");

  // Replace each asset URL with its local path
  for (const asset of assets) {
    const originalUrl = asset.url;
    // Try to replace both the full URL and the relative version
    const parsed = new URL(originalUrl);
    const relativePath = parsed.pathname;

    // Replace full URL
    result = result.split(originalUrl).join(asset.localPath);
    // Replace relative URL if it's from the same domain
    if (originalUrl.startsWith(baseUrl) && result.includes(`"${relativePath}"`)) {
      result = result.split(`"${relativePath}"`).join(`"${asset.localPath}"`);
    }
    if (originalUrl.startsWith(baseUrl) && result.includes(`'${relativePath}'`)) {
      result = result.split(`'${relativePath}'`).join(`'${asset.localPath}'`);
    }
  }

  return result;
}

export async function POST(request: NextRequest) {
  try {
    const { modifiedHtml, baseUrl, pageTitle } = await request.json();

    if (!modifiedHtml) {
      return NextResponse.json({ error: "No HTML to download" }, { status: 400 });
    }

    const zip = new JSZip();

    // Extract and fetch assets
    const assets = extractAssets(modifiedHtml, baseUrl);

    // Fetch assets in parallel (with concurrency limit)
    const CONCURRENCY = 10;
    const fetchedAssets: AssetInfo[] = [];

    for (let i = 0; i < assets.length; i += CONCURRENCY) {
      const batch = assets.slice(i, i + CONCURRENCY);
      const results = await Promise.allSettled(
        batch.map(async (asset) => {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 10000);
          try {
            const res = await fetch(asset.url, {
              signal: controller.signal,
              headers: {
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
              },
            });
            clearTimeout(timeout);
            if (res.ok) {
              const buffer = await res.arrayBuffer();
              zip.file(asset.localPath, buffer);
              fetchedAssets.push(asset);
            }
          } catch {
            clearTimeout(timeout);
            // Skip failed assets
          }
        })
      );
    }

    // Rewrite HTML to use local paths and add to zip
    const localHtml = rewriteToLocal(modifiedHtml, fetchedAssets, baseUrl);
    zip.file("index.html", localHtml);

    // Add a manifest
    const manifest = {
      title: pageTitle,
      baseUrl,
      exportedAt: new Date().toISOString(),
      assetCount: fetchedAssets.length,
      totalAssets: assets.length,
    };
    zip.file("manifest.json", JSON.stringify(manifest, null, 2));

    // Generate zip
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
