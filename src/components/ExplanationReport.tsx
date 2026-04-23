"use client";

import type { Change } from "@/lib/claude";

interface ExplanationReportProps {
  changes: Change[];
  pageUrl: string;
  pageTitle: string;
}

const categoryLabels: Record<string, string> = {
  content: "Content",
  seo: "SEO",
  structure: "Structure",
  branding: "Branding",
};

const categoryColors: Record<string, string> = {
  content: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  seo: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  structure: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  branding: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
};

/** Strip HTML tags to get visible text content */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/** Compute word-level diff between two strings */
function computeWordDiff(
  oldText: string,
  newText: string
): { type: "same" | "removed" | "added"; text: string }[] {
  const oldWords = oldText.split(/(\s+)/);
  const newWords = newText.split(/(\s+)/);

  // Simple LCS-based diff
  const m = oldWords.length;
  const n = newWords.length;

  // For very long texts, fall back to simple before/after
  if (m * n > 100000) {
    return [
      { type: "removed", text: oldText },
      { type: "added", text: newText },
    ];
  }

  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array(n + 1).fill(0)
  );

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldWords[i - 1] === newWords[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to build diff
  const result: { type: "same" | "removed" | "added"; text: string }[] = [];
  let i = m;
  let j = n;
  const stack: { type: "same" | "removed" | "added"; text: string }[] = [];

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldWords[i - 1] === newWords[j - 1]) {
      stack.push({ type: "same", text: oldWords[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      stack.push({ type: "added", text: newWords[j - 1] });
      j--;
    } else {
      stack.push({ type: "removed", text: oldWords[i - 1] });
      i--;
    }
  }

  stack.reverse();

  // Merge consecutive same-type segments
  for (const item of stack) {
    if (result.length > 0 && result[result.length - 1].type === item.type) {
      result[result.length - 1].text += item.text;
    } else {
      result.push({ ...item });
    }
  }

  return result;
}

/** Detect if snippet is primarily a meta/structured-data tag vs visible content */
function isMetaChange(snippet: string): boolean {
  const trimmed = snippet.trim();
  return (
    trimmed.startsWith("<meta") ||
    trimmed.startsWith("<title") ||
    trimmed.includes("application/ld+json") ||
    trimmed.startsWith("<script")
  );
}

/** Check if content contains JSON-LD structured data */
function containsJsonLd(snippet: string): boolean {
  return snippet.includes("application/ld+json") || snippet.includes('"@context"');
}

/** Extract human-readable text from a snippet that may contain JSON-LD + visible content */
function separateContentAndJsonLd(snippet: string): { text: string; jsonLdTypes: string[] } {
  const jsonLdTypes: string[] = [];

  // Extract JSON-LD type names
  const typeMatches = snippet.matchAll(/"@type"\s*:\s*"([^"]+)"/g);
  for (const m of typeMatches) {
    if (!jsonLdTypes.includes(m[1])) jsonLdTypes.push(m[1]);
  }

  // Remove script tags containing JSON-LD
  let cleaned = snippet.replace(/<script[^>]*application\/ld\+json[^>]*>[\s\S]*?<\/script>/gi, "");

  // Strip remaining HTML
  const text = cleaned
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();

  return { text, jsonLdTypes };
}

/** Extract a human-readable description of a meta/structured tag change */
function describeMetaChange(original: string, modified: string): { label: string; before: string; after: string } {
  // Meta description
  const descMatch = (s: string) => s.match(/content="([^"]*)"/)?.[1] || "";
  if (original.includes('name="description"')) {
    return {
      label: "Meta Description",
      before: descMatch(original),
      after: descMatch(modified),
    };
  }
  // Title
  const titleMatch = (s: string) => s.replace(/<\/?title[^>]*>/g, "").trim();
  if (original.includes("<title")) {
    return {
      label: "Page Title",
      before: titleMatch(original),
      after: titleMatch(modified),
    };
  }
  // OG tags
  const propMatch = (s: string) => s.match(/property="([^"]*)"/)?.[1] || "meta tag";
  if (original.includes("property=\"og:")) {
    return {
      label: propMatch(original),
      before: descMatch(original),
      after: descMatch(modified),
    };
  }
  // JSON-LD
  if (original.includes("application/ld+json")) {
    return {
      label: "Structured Data (JSON-LD)",
      before: "Previous structured data",
      after: "Updated structured data with new fields",
    };
  }
  return {
    label: "Meta Tag",
    before: stripHtml(original),
    after: stripHtml(modified),
  };
}

function VisualDiff({ original, modified }: { original: string; modified: string }) {
  const isMeta = isMetaChange(original);

  if (isMeta) {
    const meta = describeMetaChange(original, modified);
    return (
      <div className="space-y-3">
        <div className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-gray-800 rounded text-xs text-gray-400 font-medium">
          {meta.label}
        </div>
        <div className="bg-red-500/5 border border-red-500/15 rounded-lg px-4 py-3">
          <div className="text-xs font-medium text-red-400 mb-1">Before</div>
          <p className="text-sm text-gray-300 leading-relaxed">{meta.before || "(empty)"}</p>
        </div>
        <div className="bg-emerald-500/5 border border-emerald-500/15 rounded-lg px-4 py-3">
          <div className="text-xs font-medium text-emerald-400 mb-1">After</div>
          <p className="text-sm text-gray-200 leading-relaxed">{meta.after}</p>
        </div>
      </div>
    );
  }

  const oldText = stripHtml(original);
  const newText = stripHtml(modified);

  // If the text content is the same (structural HTML change only), show a simple note
  if (oldText === newText) {
    return (
      <div className="bg-gray-800/50 border border-gray-700 rounded-lg px-4 py-3">
        <p className="text-sm text-gray-400 italic">Structural/HTML change — visible content unchanged</p>
      </div>
    );
  }

  // Check if the modified content contains JSON-LD mixed with visible text
  const hasJsonLd = containsJsonLd(modified);
  const { text: cleanNewText, jsonLdTypes } = hasJsonLd
    ? separateContentAndJsonLd(modified)
    : { text: newText, jsonLdTypes: [] };

  // If one is empty and the other isn't, it's a new section
  if (!oldText && (cleanNewText || jsonLdTypes.length > 0)) {
    return (
      <div className="space-y-3">
        <div className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-emerald-500/10 rounded text-xs text-emerald-400 font-medium">
          New Content Added
        </div>
        {cleanNewText && (
          <div className="bg-emerald-500/5 border border-emerald-500/15 rounded-lg px-4 py-3">
            <p className="text-sm text-gray-200 leading-relaxed">
              {cleanNewText.length > 500 ? cleanNewText.slice(0, 500) + "..." : cleanNewText}
            </p>
          </div>
        )}
        {jsonLdTypes.length > 0 && (
          <div className="bg-purple-500/5 border border-purple-500/15 rounded-lg px-4 py-3">
            <div className="text-xs font-medium text-purple-400 mb-1.5">Structured Data Added</div>
            <div className="flex flex-wrap gap-1.5">
              {jsonLdTypes.map((type) => (
                <span key={type} className="inline-flex px-2 py-0.5 bg-purple-500/10 border border-purple-500/20 rounded text-xs text-purple-300 font-mono">
                  {type}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  const diff = computeWordDiff(oldText, newText);

  return (
    <div className="bg-gray-800/30 border border-gray-700 rounded-lg px-4 py-3">
      <p className="text-sm leading-relaxed">
        {diff.map((segment, i) => {
          if (segment.type === "removed") {
            return (
              <span
                key={i}
                className="bg-red-500/15 text-red-300 line-through decoration-red-400/50 px-0.5 rounded"
              >
                {segment.text}
              </span>
            );
          }
          if (segment.type === "added") {
            return (
              <span
                key={i}
                className="bg-emerald-500/15 text-emerald-300 px-0.5 rounded"
              >
                {segment.text}
              </span>
            );
          }
          return (
            <span key={i} className="text-gray-400">
              {segment.text}
            </span>
          );
        })}
      </p>
    </div>
  );
}

export default function ExplanationReport({
  changes,
  pageUrl,
  pageTitle,
}: ExplanationReportProps) {
  // Group changes by category
  const grouped = changes.reduce(
    (acc, change) => {
      const cat = change.category || "content";
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(change);
      return acc;
    },
    {} as Record<string, Change[]>
  );

  const categoryOrder = ["content", "seo", "structure", "branding"];
  const sortedCategories = categoryOrder.filter((c) => grouped[c]?.length);

  return (
    <div className="max-w-4xl mx-auto px-6 py-10">
      {/* Report Header */}
      <div className="mb-10">
        <div className="flex items-center gap-2 text-emerald-500 text-sm font-medium mb-3">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          GECKOCHECK OPTIMIZATION REPORT
        </div>
        <h1 className="text-3xl font-bold text-white mb-2">{pageTitle}</h1>
        <p className="text-gray-400">{pageUrl}</p>

        {/* Summary stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6">
          <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
            <div className="text-2xl font-bold text-white">{changes.length}</div>
            <div className="text-xs text-gray-400 mt-1">Total Changes</div>
          </div>
          {sortedCategories.map((cat) => (
            <div key={cat} className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
              <div className="text-2xl font-bold text-white">{grouped[cat].length}</div>
              <div className="text-xs text-gray-400 mt-1">{categoryLabels[cat]} Changes</div>
            </div>
          ))}
        </div>
      </div>

      {/* Changes by category */}
      {sortedCategories.map((cat) => (
        <div key={cat} className="mb-10">
          <div className="flex items-center gap-3 mb-5">
            <span
              className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold border ${categoryColors[cat]}`}
            >
              {categoryLabels[cat]}
            </span>
            <div className="h-px flex-1 bg-gray-800" />
            <span className="text-xs text-gray-500">
              {grouped[cat].length} change{grouped[cat].length > 1 ? "s" : ""}
            </span>
          </div>

          <div className="space-y-6">
            {grouped[cat].map((change, idx) => (
              <div
                key={change.id}
                className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden"
              >
                {/* Change header */}
                <div className="px-5 py-4 border-b border-gray-800 flex items-start gap-3">
                  <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-gray-800 text-gray-400 text-xs font-bold shrink-0 mt-0.5">
                    {idx + 1}
                  </span>
                  <div>
                    <h3 className="text-base font-semibold text-white">
                      {change.description}
                    </h3>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {change.selector}
                    </p>
                  </div>
                </div>

                {/* Visual Before / After diff */}
                <div className="px-5 py-4">
                  <VisualDiff
                    original={change.originalSnippet}
                    modified={change.modifiedSnippet}
                  />
                </div>

                {/* Reasoning */}
                <div className="px-5 py-4 border-t border-gray-800 bg-gray-800/30 space-y-4">
                  <div>
                    <div className="flex items-center gap-1.5 text-xs font-medium text-gray-400 mb-2">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                      </svg>
                      Strategic Rationale
                    </div>
                    <p className="text-sm text-gray-200 leading-relaxed">
                      {change.reasoning}
                    </p>
                  </div>
                  <div className="bg-emerald-500/5 border border-emerald-500/15 rounded-lg px-4 py-3">
                    <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-400 mb-2">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      GeckoCheck Insight That Triggered This
                    </div>
                    <p className="text-sm text-emerald-300/90 leading-relaxed">
                      &ldquo;{change.sourceInsight}&rdquo;
                    </p>
                  </div>

                  {change.brandAlignment && (
                    <div className="bg-blue-500/5 border border-blue-500/15 rounded-lg px-4 py-3">
                      <div className="flex items-center gap-1.5 text-xs font-medium text-blue-400 mb-2">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                        </svg>
                        Brand Guidelines Compliance
                      </div>
                      <p className="text-sm text-blue-300/90 leading-relaxed">
                        {change.brandAlignment}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Footer */}
      <div className="border-t border-gray-800 pt-6 mt-10 text-center">
        <p className="text-xs text-gray-600">
          Generated by GeckoCheck Page Optimizer
        </p>
      </div>
    </div>
  );
}
