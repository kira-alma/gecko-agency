"use client";

import { useEffect, useRef, useState } from "react";
import type { Change } from "@/lib/claude";

interface PageViewerProps {
  originalHtml: string;
  modifiedHtml: string;
  changes: Change[];
  baseUrl: string;
}

function rewriteAssets(html: string, baseUrl: string): string {
  let result = html;

  // Add/replace base tag so all relative URLs resolve against the retailer's domain
  if (result.includes("<base")) {
    result = result.replace(/<base\b[^>]*>/i, `<base href="${baseUrl}/">`);
  } else if (result.includes("<head>")) {
    result = result.replace("<head>", `<head><base href="${baseUrl}/">`);
  } else if (result.includes("<head ")) {
    result = result.replace(/<head\b[^>]*>/, (m) => `${m}<base href="${baseUrl}/">`);
  }

  // Remove common popup/modal/cookie banner elements
  // By ID
  result = result.replace(/<[^>]+id=["'](?:cookie[_-]?(?:banner|consent|notice|popup|modal|bar)|gdpr|onetrust|consent[_-]?(?:banner|modal|popup)|newsletter[_-]?(?:popup|modal)|popup[_-]?(?:overlay|modal)|modal[_-]?(?:overlay|backdrop))[^"']*["'][^>]*>[\s\S]*?<\/[^>]+>/gi, "");

  // By class
  result = result.replace(/<[^>]+class=["'][^"']*(?:cookie[_-]?(?:banner|consent|notice|popup|modal|bar)|gdpr|consent[_-]?(?:banner|modal)|newsletter[_-]?popup|popup[_-]?overlay|modal[_-]?(?:overlay|backdrop))[^"']*["'][^>]*>[\s\S]*?<\/[^>]+>/gi, "");

  // Inject CSS to hide any remaining popups, modals, overlays, and fixed/sticky elements that block content
  const popupKillCss = `
    <style>
      /* Kill popups, modals, cookie banners, overlays */
      [class*="cookie"], [class*="Cookie"],
      [class*="consent"], [class*="Consent"],
      [class*="gdpr"], [class*="GDPR"],
      [class*="newsletter-popup"], [class*="newsletter-modal"],
      [class*="popup-overlay"], [class*="modal-overlay"],
      [class*="overlay"][class*="modal"],
      [id*="cookie"], [id*="Cookie"],
      [id*="consent"], [id*="Consent"],
      [id*="gdpr"], [id*="onetrust"],
      [id*="newsletter-popup"], [id*="popup-overlay"],
      [aria-modal="true"],
      [role="dialog"] {
        display: none !important;
        visibility: hidden !important;
        opacity: 0 !important;
        pointer-events: none !important;
      }
      /* Remove fixed/sticky overlays that block scrolling */
      body > div[style*="position: fixed"],
      body > div[style*="position:fixed"],
      body > div[style*="z-index: 9"],
      body > div[style*="z-index:9"] {
        display: none !important;
      }
      /* Ensure body is scrollable */
      body, html {
        overflow: auto !important;
        position: static !important;
      }
    </style>
  `;

  if (result.includes("</head>")) {
    result = result.replace("</head>", `${popupKillCss}</head>`);
  } else {
    result = popupKillCss + result;
  }

  return result;
}

function injectHighlightStyles(html: string): string {
  const style = `
    <style>
      [data-gecko-change] {
        outline: 3px solid #10b981 !important;
        outline-offset: 2px;
        background-color: rgba(16, 185, 129, 0.08) !important;
        position: relative !important;
        cursor: pointer !important;
        transition: outline-color 0.2s, background-color 0.2s, box-shadow 0.2s !important;
        box-shadow: 0 0 8px rgba(16, 185, 129, 0.3) !important;
      }
      [data-gecko-change]::before {
        content: attr(data-gecko-change);
        position: absolute !important;
        top: -18px;
        left: 0;
        background: #10b981 !important;
        color: white !important;
        font-size: 9px !important;
        font-family: system-ui, sans-serif !important;
        padding: 1px 6px !important;
        border-radius: 3px !important;
        z-index: 10000 !important;
        pointer-events: none !important;
        white-space: nowrap !important;
      }
      [data-gecko-change]:hover {
        outline-color: #34d399 !important;
        background-color: rgba(16, 185, 129, 0.15) !important;
        box-shadow: 0 0 16px rgba(16, 185, 129, 0.5) !important;
      }
      [data-gecko-change].gecko-hidden {
        outline: 2px dashed #ef4444 !important;
        background-color: rgba(239, 68, 68, 0.05) !important;
        box-shadow: none !important;
        opacity: 0.5 !important;
      }
      [data-gecko-change].gecko-hidden::before {
        background: #ef4444 !important;
        content: 'disabled';
      }
      .gecko-tooltip {
        position: fixed;
        z-index: 999999;
        background: #1f2937;
        color: white;
        padding: 12px 16px;
        border-radius: 8px;
        font-size: 13px;
        max-width: 350px;
        box-shadow: 0 10px 25px rgba(0,0,0,0.5);
        border: 1px solid #374151;
        pointer-events: none;
        line-height: 1.5;
      }
      .gecko-tooltip strong {
        color: #34d399;
        display: block;
        margin-bottom: 4px;
      }
      .gecko-tooltip .gecko-source {
        color: #9ca3af;
        font-size: 11px;
        margin-top: 6px;
        border-top: 1px solid #374151;
        padding-top: 6px;
      }
    </style>
  `;
  return html.replace("</head>", `${style}</head>`);
}

export default function PageViewer({
  originalHtml,
  modifiedHtml,
  changes,
  baseUrl,
}: PageViewerProps) {
  const [viewMode, setViewMode] = useState<"modified" | "original" | "split">(
    "modified"
  );
  const [disabledChanges, setDisabledChanges] = useState<Set<string>>(
    new Set()
  );
  const [hoveredChange, setHoveredChange] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const originalIframeRef = useRef<HTMLIFrameElement>(null);

  const toggleChange = (changeId: string) => {
    setDisabledChanges((prev) => {
      const next = new Set(prev);
      if (next.has(changeId)) {
        next.delete(changeId);
      } else {
        next.add(changeId);
      }
      return next;
    });
  };

  // Create blob URLs for iframes — much more reliable than document.write
  const [modifiedBlobUrl, setModifiedBlobUrl] = useState<string>("");
  const [originalBlobUrl, setOriginalBlobUrl] = useState<string>("");

  useEffect(() => {
    const processedHtml = injectHighlightStyles(
      rewriteAssets(modifiedHtml, baseUrl)
    );
    const blob = new Blob([processedHtml], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    setModifiedBlobUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [modifiedHtml, baseUrl, changes, disabledChanges]);

  useEffect(() => {
    const processedHtml = rewriteAssets(originalHtml, baseUrl);
    const blob = new Blob([processedHtml], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    setOriginalBlobUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [originalHtml, baseUrl]);

  const categoryColors: Record<string, string> = {
    content: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    seo: "bg-purple-500/20 text-purple-400 border-purple-500/30",
    structure: "bg-amber-500/20 text-amber-400 border-amber-500/30",
    branding: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  };

  const categoryIcons: Record<string, string> = {
    content: "T",
    seo: "#",
    structure: "{}",
    branding: "B",
  };

  return (
    <div className="flex h-[calc(100vh-64px)]">
      {/* Side Panel */}
      <div className="w-96 bg-gray-900 border-r border-gray-800 flex flex-col overflow-hidden shrink-0">
        {/* Panel Header */}
        <div className="p-4 border-b border-gray-800">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold text-white">Changes</h2>
            <span className="text-sm text-gray-400">
              {changes.length - disabledChanges.size}/{changes.length} active
            </span>
          </div>

          {/* View Toggle */}
          <div className="flex gap-1 bg-gray-800 rounded-lg p-1">
            {(["modified", "original", "split"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  viewMode === mode
                    ? "bg-emerald-600 text-white"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                {mode === "modified"
                  ? "Modified"
                  : mode === "original"
                    ? "Original"
                    : "Split"}
              </button>
            ))}
          </div>
        </div>

        {/* Changes List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {changes.map((change) => {
            const isDisabled = disabledChanges.has(change.id);
            const isHovered = hoveredChange === change.id;
            return (
              <div
                key={change.id}
                className={`rounded-lg border transition-all cursor-pointer ${
                  isHovered
                    ? "border-emerald-500 bg-emerald-500/5"
                    : isDisabled
                      ? "border-gray-800 bg-gray-900 opacity-50"
                      : "border-gray-800 bg-gray-800/50 hover:border-gray-700"
                }`}
                onMouseEnter={() => {
                  setHoveredChange(change.id);
                  // Highlight in iframe
                  const doc = iframeRef.current?.contentDocument;
                  const el = doc?.querySelector(
                    `[data-gecko-change="${change.id}"]`
                  );
                  if (el) {
                    el.scrollIntoView({ behavior: "smooth", block: "center" });
                    (el as HTMLElement).style.outline = "3px solid #fbbf24";
                  }
                }}
                onMouseLeave={() => {
                  setHoveredChange(null);
                  const doc = iframeRef.current?.contentDocument;
                  const el = doc?.querySelector(
                    `[data-gecko-change="${change.id}"]`
                  );
                  if (el) {
                    (el as HTMLElement).style.outline = isDisabled
                      ? "2px dashed #ef4444"
                      : "2px solid #10b981";
                  }
                }}
              >
                <div className="p-3">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex items-center justify-center w-6 h-6 rounded text-xs font-bold border ${categoryColors[change.category] || categoryColors.content}`}
                      >
                        {categoryIcons[change.category] || "?"}
                      </span>
                      <span className="text-sm font-medium text-white">
                        {change.description}
                      </span>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleChange(change.id);
                      }}
                      className={`shrink-0 w-10 h-5 rounded-full transition-all relative ${
                        isDisabled ? "bg-gray-700" : "bg-emerald-600"
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${
                          isDisabled ? "left-0.5" : "left-5.5"
                        }`}
                      />
                    </button>
                  </div>

                  {/* Before/After snippets */}
                  <div className="space-y-1.5 text-xs">
                    <div className="bg-red-500/10 border border-red-500/20 rounded px-2 py-1.5">
                      <span className="text-red-400 font-mono">-</span>{" "}
                      <span className="text-gray-300 line-through">
                        {change.originalSnippet.slice(0, 100)}
                        {change.originalSnippet.length > 100 ? "..." : ""}
                      </span>
                    </div>
                    <div className="bg-emerald-500/10 border border-emerald-500/20 rounded px-2 py-1.5">
                      <span className="text-emerald-400 font-mono">+</span>{" "}
                      <span className="text-gray-200">
                        {change.modifiedSnippet.slice(0, 100)}
                        {change.modifiedSnippet.length > 100 ? "..." : ""}
                      </span>
                    </div>
                  </div>

                  {/* Reasoning */}
                  <p className="text-xs text-gray-400 mt-2 leading-relaxed">
                    {change.reasoning}
                  </p>
                  <p className="text-xs text-emerald-500/70 mt-1 italic">
                    {change.sourceInsight}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Page Preview */}
      <div className="flex-1 flex flex-col bg-white">
        {/* View Label */}
        <div className="bg-gray-950 px-4 py-2 flex items-center gap-4 border-b border-gray-800">
          {viewMode === "split" ? (
            <>
              <span className="text-xs font-medium text-red-400 flex-1 text-center">
                ORIGINAL
              </span>
              <div className="w-px h-4 bg-gray-700" />
              <span className="text-xs font-medium text-emerald-400 flex-1 text-center">
                MODIFIED — changes highlighted
              </span>
            </>
          ) : (
            <span
              className={`text-xs font-medium ${viewMode === "original" ? "text-red-400" : "text-emerald-400"}`}
            >
              {viewMode === "original" ? "ORIGINAL" : "MODIFIED"} VIEW
            </span>
          )}
        </div>

        {/* Iframe(s) */}
        <div className="flex-1 flex">
          {(viewMode === "original" || viewMode === "split") && originalBlobUrl && (
            <iframe
              ref={originalIframeRef}
              src={originalBlobUrl}
              className={`${viewMode === "split" ? "w-1/2 border-r border-gray-300" : "w-full"} h-full`}
              title="Original page"
            />
          )}
          {(viewMode === "modified" || viewMode === "split") && modifiedBlobUrl && (
            <iframe
              ref={iframeRef}
              src={modifiedBlobUrl}
              className={`${viewMode === "split" ? "w-1/2" : "w-full"} h-full`}
              title="Modified page"
            />
          )}
        </div>
      </div>
    </div>
  );
}
