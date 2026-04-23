"use client";

import { useMemo } from "react";
import { diffLines } from "diff";

interface DiffViewProps {
  originalHtml: string;
  modifiedHtml: string;
}

/** Strip HTML to get meaningful text content for diffing */
function htmlToReadableLines(html: string): string {
  return html
    // Remove script/style blocks entirely
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    // Replace block-level tags with newlines
    .replace(/<\/?(div|p|h[1-6]|li|tr|section|article|header|footer|nav|main|aside|blockquote|figcaption|details|summary)\b[^>]*>/gi, "\n")
    // Replace br/hr with newlines
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<hr\s*\/?>/gi, "\n---\n")
    // Remove remaining tags
    .replace(/<[^>]+>/g, " ")
    // Decode entities
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    // Clean up whitespace
    .replace(/[ \t]+/g, " ")
    .replace(/\n /g, "\n")
    .replace(/ \n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export default function DiffView({ originalHtml, modifiedHtml }: DiffViewProps) {
  const diff = useMemo(() => {
    const originalText = htmlToReadableLines(originalHtml);
    const modifiedText = htmlToReadableLines(modifiedHtml);
    return diffLines(originalText, modifiedText);
  }, [originalHtml, modifiedHtml]);

  const stats = useMemo(() => {
    let added = 0;
    let removed = 0;
    for (const part of diff) {
      const lines = part.value.split("\n").filter((l) => l.trim()).length;
      if (part.added) added += lines;
      if (part.removed) removed += lines;
    }
    return { added, removed };
  }, [diff]);

  return (
    <div className="flex-1 flex flex-col bg-gray-950 overflow-hidden">
      {/* Diff header */}
      <div className="bg-gray-900 px-4 py-2 border-b border-gray-800 flex items-center gap-4 shrink-0">
        <span className="text-xs font-medium text-gray-400">DIFF VIEW</span>
        <div className="flex items-center gap-3 text-xs">
          <span className="text-emerald-400">+{stats.added} added</span>
          <span className="text-red-400">-{stats.removed} removed</span>
        </div>
      </div>

      {/* Diff content */}
      <div className="flex-1 overflow-auto font-mono text-xs">
        <table className="w-full border-collapse">
          <tbody>
            {diff.map((part, partIdx) => {
              const lines = part.value.split("\n");
              // Remove trailing empty line from split
              if (lines[lines.length - 1] === "") lines.pop();

              return lines.map((line, lineIdx) => {
                const key = `${partIdx}-${lineIdx}`;

                if (part.added) {
                  return (
                    <tr key={key} className="bg-emerald-500/10 hover:bg-emerald-500/15">
                      <td className="w-8 text-right pr-2 text-emerald-500/50 select-none border-r border-gray-800 py-0 leading-5">
                        +
                      </td>
                      <td className="pl-3 pr-4 py-0 leading-5 text-emerald-300 whitespace-pre-wrap break-all">
                        {line || " "}
                      </td>
                    </tr>
                  );
                }

                if (part.removed) {
                  return (
                    <tr key={key} className="bg-red-500/10 hover:bg-red-500/15">
                      <td className="w-8 text-right pr-2 text-red-500/50 select-none border-r border-gray-800 py-0 leading-5">
                        -
                      </td>
                      <td className="pl-3 pr-4 py-0 leading-5 text-red-300 whitespace-pre-wrap break-all">
                        {line || " "}
                      </td>
                    </tr>
                  );
                }

                // Unchanged — only show if near a change (context lines)
                return (
                  <tr key={key} className="hover:bg-gray-800/30">
                    <td className="w-8 text-right pr-2 text-gray-700 select-none border-r border-gray-800 py-0 leading-5">

                    </td>
                    <td className="pl-3 pr-4 py-0 leading-5 text-gray-500 whitespace-pre-wrap break-all">
                      {line || " "}
                    </td>
                  </tr>
                );
              });
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
