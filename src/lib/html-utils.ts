/**
 * Aggressively trims HTML to reduce token count while preserving visible content.
 * Targets: scripts, styles, SVGs, data attributes, hidden elements, JSON-LD, noscript.
 */
export function trimHtmlForLlm(html: string): string {
  let result = html;

  // Remove all script tags entirely (inline and external)
  result = result.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");

  // Remove all style tags
  result = result.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "");

  // Remove noscript tags
  result = result.replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, "");

  // Remove HTML comments
  result = result.replace(/<!--[\s\S]*?-->/g, "");

  // Remove SVGs entirely
  result = result.replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, "[SVG]");

  // Remove inline style attributes (they bloat the HTML)
  result = result.replace(/\s+style="[^"]*"/gi, "");

  // Remove data-* attributes (tracking, framework internals)
  result = result.replace(/\s+data-[a-z0-9-]+="[^"]*"/gi, "");

  // Remove tracking pixels / hidden images
  result = result.replace(
    /<img[^>]*(?:width=["']1["']|height=["']1["']|tracking|pixel|beacon|display:\s*none)[^>]*\/?>/gi,
    ""
  );

  // Remove hidden elements
  result = result.replace(/<[^>]+(?:hidden|aria-hidden=["']true["']|display:\s*none)[^>]*>[\s\S]*?<\/[^>]+>/gi, "");

  // Remove link preload/prefetch/dns-prefetch tags
  result = result.replace(/<link\b[^>]*(?:rel=["'](?:preload|prefetch|dns-prefetch|preconnect|modulepreload)["'])[^>]*\/?>/gi, "");

  // Remove meta tags except useful ones (description, title, og:)
  result = result.replace(/<meta\b[^>]*>/gi, (match) => {
    if (/name=["'](?:description|title|keywords)/i.test(match) ||
        /property=["']og:/i.test(match)) {
      return match;
    }
    return "";
  });

  // Remove empty tags
  result = result.replace(/<(\w+)[^>]*>\s*<\/\1>/g, "");

  // Collapse whitespace
  result = result.replace(/\n\s*\n/g, "\n");
  result = result.replace(/\n{3,}/g, "\n\n");
  result = result.replace(/\t/g, " ");
  result = result.replace(/  +/g, " ");

  // Remove the entire <head> section — we only need the body for content analysis
  // But keep title and meta description
  const titleMatch = result.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const metaDescMatch = result.match(/<meta\b[^>]*name=["']description["'][^>]*>/i);
  const ogMatches = result.match(/<meta\b[^>]*property=["']og:[^"']*["'][^>]*/gi);

  const headInfo = [
    titleMatch ? titleMatch[0] : "",
    metaDescMatch ? metaDescMatch[0] : "",
    ...(ogMatches || []),
  ].filter(Boolean).join("\n");

  // Replace head with just the essential meta
  result = result.replace(/<head\b[^>]*>[\s\S]*?<\/head>/i, `<head>\n${headInfo}\n</head>`);

  // Trim leading/trailing whitespace per line
  result = result
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join("\n");

  return result;
}
