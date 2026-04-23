"use client";

import { useState, useEffect, useRef } from "react";

interface Model {
  id: string;
  name: string;
  pricing?: { prompt?: string; completion?: string };
  context_length?: number;
}

interface AdvancedPromptViewProps {
  genericPrompt: string;
  pageSpecificPrompt: string;
  editedPagePrompt?: string;
  onGenericPromptChange: (prompt: string) => void;
  onPageSpecificPromptChange: (prompt: string) => void;
  userPrompt?: string;
  customInstructions: string;
  selectedModel: string;
  onModelChange: (model: string) => void;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className="px-2 py-1 text-xs text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 rounded transition-all"
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function PromptSection({
  title,
  content,
  defaultOpen,
  accentColor,
  badge,
  editable,
  onChange,
  onReset,
  isModified,
}: {
  title: string;
  content: string;
  defaultOpen: boolean;
  accentColor: "gray" | "blue" | "amber" | "emerald";
  badge?: string;
  editable?: boolean;
  onChange?: (value: string) => void;
  onReset?: () => void;
  isModified?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [isEditing, setIsEditing] = useState(false);
  const lineCount = content.split("\n").length;

  const borderColors = {
    gray: "border-gray-800",
    blue: "border-blue-500/30",
    amber: "border-amber-500/30",
    emerald: "border-emerald-500/30",
  };

  const headerBg = {
    gray: "bg-gray-900 hover:bg-gray-800/80",
    blue: "bg-blue-500/5 hover:bg-blue-500/10",
    amber: "bg-amber-500/5 hover:bg-amber-500/10",
    emerald: "bg-emerald-500/5 hover:bg-emerald-500/10",
  };

  const badgeColors = {
    gray: "bg-gray-700 text-gray-300",
    blue: "bg-blue-500/20 text-blue-400",
    amber: "bg-amber-500/20 text-amber-400",
    emerald: "bg-emerald-500/20 text-emerald-400",
  };

  const barColor = {
    gray: "bg-gray-700",
    blue: "bg-blue-500",
    amber: "bg-amber-500",
    emerald: "bg-emerald-500",
  };

  return (
    <div className={`border ${borderColors[accentColor]} rounded-xl overflow-hidden`}>
      {/* Color bar */}
      <div className={`h-1 ${barColor[accentColor]}`} />
      <div
        className={`px-5 py-4 flex items-center justify-between ${headerBg[accentColor]} transition-colors`}
      >
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-3 flex-1 text-left"
        >
          <svg
            className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
          <span className="text-sm font-semibold text-white">{title}</span>
          {badge && (
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${badgeColors[accentColor]}`}>
              {badge}
            </span>
          )}
          {isModified && (
            <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-orange-500/20 text-orange-400">
              Edited
            </span>
          )}
          <span className="text-xs text-gray-500">{lineCount} lines</span>
        </button>
        <div className="flex items-center gap-2">
          {editable && isOpen && (
            <>
              <button
                onClick={() => setIsEditing(!isEditing)}
                className={`px-2 py-1 text-xs rounded transition-all ${
                  isEditing
                    ? "bg-emerald-600 text-white"
                    : "text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700"
                }`}
              >
                {isEditing ? "Done" : "Edit"}
              </button>
              {isModified && onReset && (
                <button
                  onClick={onReset}
                  className="px-2 py-1 text-xs text-orange-400 hover:text-orange-300 bg-gray-800 hover:bg-gray-700 rounded transition-all"
                >
                  Reset
                </button>
              )}
            </>
          )}
          <CopyButton text={content} />
        </div>
      </div>
      {isOpen && (
        <div className="bg-gray-950 border-t border-gray-800 overflow-auto max-h-[500px]">
          {isEditing && editable && onChange ? (
            <textarea
              value={content}
              onChange={(e) => onChange(e.target.value)}
              className="w-full h-[400px] px-5 py-4 text-xs text-gray-300 font-mono leading-relaxed bg-gray-950 border-none outline-none resize-y focus:ring-0"
              spellCheck={false}
            />
          ) : (
            <pre className="px-5 py-4 text-xs text-gray-300 font-mono leading-relaxed whitespace-pre-wrap">
              {content}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

export default function AdvancedPromptView({
  genericPrompt,
  pageSpecificPrompt,
  editedPagePrompt,
  onGenericPromptChange,
  onPageSpecificPromptChange,
  userPrompt,
  customInstructions,
  selectedModel,
  onModelChange,
}: AdvancedPromptViewProps) {
  const defaultGenericRef = useRef(genericPrompt);
  const [models, setModels] = useState<Model[]>([]);
  const [modelsLoading, setModelsLoading] = useState(true);

  useEffect(() => {
    fetch("/api/models")
      .then((res) => res.json())
      .then((data) => {
        if (data.models) setModels(data.models);
      })
      .catch(console.error)
      .finally(() => setModelsLoading(false));
  }, []);

  return (
    <div className="max-w-4xl mx-auto px-6 py-10 space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-purple-400 text-sm font-medium mb-3">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
          </svg>
          ADVANCED SETTINGS
        </div>
        <h1 className="text-2xl font-bold text-white mb-2">Model & Prompt Configuration</h1>
        <p className="text-gray-400 text-sm">
          Select the AI model and inspect the prompts. The generation prompt has two layers:
        </p>
        <div className="flex items-center gap-4 mt-3 text-xs">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-blue-500" />
            <span className="text-blue-400">Generic prompt</span>
            <span className="text-gray-600">— same for all pages</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-amber-500" />
            <span className="text-amber-400">Page-specific prompt</span>
            <span className="text-gray-600">— brand, URL, reviewer feedback</span>
          </div>
        </div>
      </div>

      {/* Model Selector */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <label htmlFor="model-select" className="block text-sm font-semibold text-gray-200 mb-3">
          AI Model
        </label>
        <select
          id="model-select"
          value={selectedModel}
          onChange={(e) => onModelChange(e.target.value)}
          className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all appearance-none cursor-pointer"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%236b7280'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E")`,
            backgroundRepeat: "no-repeat",
            backgroundPosition: "right 12px center",
            backgroundSize: "20px",
          }}
        >
          {modelsLoading ? (
            <option>Loading models...</option>
          ) : models.length === 0 ? (
            <option value="openai/gpt-5">GPT-5 (default)</option>
          ) : (
            models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
                {m.context_length
                  ? ` (${Math.round(m.context_length / 1000)}k ctx)`
                  : ""}
                {m.pricing?.prompt
                  ? ` — $${(parseFloat(m.pricing.prompt) * 1000000).toFixed(2)}/M input`
                  : ""}
              </option>
            ))
          )}
        </select>
        <p className="text-xs text-gray-500 mt-2">
          Used for both page generation and feedback summarization.
        </p>
      </div>

      {/* Active custom instructions — quick summary */}
      {customInstructions && (
        <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl px-5 py-3 flex items-center gap-3">
          <svg className="w-4 h-4 text-emerald-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          <span className="text-sm text-emerald-400">
            {customInstructions.split("\n").filter((l) => l.trim()).length} reviewer instructions active — visible in the Page-Specific Prompt below
          </span>
        </div>
      )}

      {/* Generic System Prompt */}
      <PromptSection
        title="Generic System Prompt"
        content={genericPrompt}
        defaultOpen={true}
        accentColor="blue"
        badge="All Pages"
        editable
        onChange={onGenericPromptChange}
        onReset={() => onGenericPromptChange("")}
        isModified={genericPrompt !== defaultGenericRef.current}
      />

      {/* Page-Specific Prompt — editable directly */}
      <PromptSection
        title="Page-Specific Prompt"
        content={pageSpecificPrompt}
        defaultOpen={true}
        accentColor="amber"
        badge="This Page"
        editable
        onChange={onPageSpecificPromptChange}
        onReset={() => onPageSpecificPromptChange("")}
        isModified={!!editedPagePrompt}
      />

      {/* User Prompt */}
      {userPrompt ? (
        <PromptSection
          title="User Prompt (page HTML + insights)"
          content={userPrompt}
          defaultOpen={false}
          accentColor="gray"
        />
      ) : (
        <div className="bg-gray-800/30 border border-gray-800 rounded-lg px-4 py-3 text-sm text-gray-500 text-center">
          The user prompt (containing page HTML and insights) will appear here after you generate.
        </div>
      )}

      {/* Legend */}
      <div className="bg-gray-800/30 border border-gray-800 rounded-lg px-4 py-3 text-xs text-gray-500">
        The <span className="text-blue-400">generic prompt</span> defines analysis rules, JSON output format, and brand compliance requirements — it&apos;s the same across all pages.
        The <span className="text-amber-400">page-specific prompt</span> adds brand guidelines, reviewer instructions, and the target URL for this particular analysis.
        Together they form the system prompt sent to the model via OpenRouter.
      </div>
    </div>
  );
}
