"use client";

import { useState } from "react";
import type { RunSummary } from "@/lib/db";

interface RunsListProps {
  runs: RunSummary[];
  activeRunId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}

function timeAgo(dateStr: string): string {
  const date = new Date(dateStr + "Z"); // SQLite stores UTC without Z
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}

export default function RunsList({ runs, activeRunId, onSelect, onDelete }: RunsListProps) {
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  if (runs.length === 0) {
    return (
      <div className="text-center py-6 text-gray-500 text-sm">
        No previous runs. Generate a page to save it here.
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {runs.map((run) => (
        <div
          key={run.id}
          onClick={() => onSelect(run.id)}
          className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-all group ${
            activeRunId === run.id
              ? "bg-emerald-500/10 border border-emerald-500/30"
              : "hover:bg-gray-800/50 border border-transparent"
          }`}
        >
          <div className="flex-1 min-w-0">
            <div className="text-sm text-white font-medium truncate">
              {run.page_title || run.page_url}
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs text-gray-500">{timeAgo(run.created_at)}</span>
              <span className="text-xs text-gray-600">|</span>
              <span className="text-xs text-emerald-500">{run.change_count} changes</span>
              <span className="text-xs text-gray-600">|</span>
              <span className="text-xs text-gray-500 truncate">{run.model.split("/").pop()}</span>
            </div>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (confirmDelete === run.id) {
                onDelete(run.id);
                setConfirmDelete(null);
              } else {
                setConfirmDelete(run.id);
                setTimeout(() => setConfirmDelete(null), 3000);
              }
            }}
            className={`shrink-0 p-1 rounded transition-all ${
              confirmDelete === run.id
                ? "text-red-400 bg-red-500/10"
                : "text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100"
            }`}
            title={confirmDelete === run.id ? "Click again to confirm" : "Delete"}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}
