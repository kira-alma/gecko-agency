"use client";

import { useState, useEffect, useCallback } from "react";
import InputForm from "@/components/InputForm";
import PageViewer from "@/components/PageViewer";
import LoadingOverlay from "@/components/LoadingOverlay";
import ExplanationReport from "@/components/ExplanationReport";
import AdvancedPromptView from "@/components/AdvancedPromptView";
import FeedbackChat from "@/components/FeedbackChat";
import type { Change } from "@/lib/claude";
import { GENERIC_SYSTEM_PROMPT, buildPageSpecificPrompt } from "@/lib/claude";

interface ScrapedData {
  html: string;
  title: string;
  url: string;
  baseUrl: string;
}

interface ResultData {
  originalHtml: string;
  modifiedHtml: string;
  changes: Change[];
  baseUrl: string;
  pageUrl: string;
  pageTitle: string;
  systemPrompt: string;
  userPrompt: string;
  genericPrompt: string;
  pageSpecificPrompt: string;
}

interface FeedbackMessage {
  role: "user" | "assistant";
  content: string;
}

export default function Home() {
  const [activeTab, setActiveTab] = useState<"viewer" | "report" | "advanced">(
    "viewer"
  );
  const [showResults, setShowResults] = useState(false);
  const [result, setResult] = useState<ResultData | null>(null);
  const [loadingStage, setLoadingStage] = useState<
    "scraping" | "generating" | null
  >(null);
  const [error, setError] = useState<string | null>(null);

  // Model selection — shared between form and advanced tab
  const [selectedModel, setSelectedModel] = useState("openai/gpt-5");

  // Main page tab (input form vs advanced)
  const [mainTab, setMainTab] = useState<"form" | "advanced">("form");

  // Editable prompts — empty string means "use default"
  const [editedGenericPrompt, setEditedGenericPrompt] = useState("");
  const [editedPagePrompt, setEditedPagePrompt] = useState("");

  // Feedback & prompt state — persists across re-generations
  const [customInstructions, setCustomInstructions] = useState("");
  const [previousInstructions, setPreviousInstructions] = useState("");
  const [feedbackMessages, setFeedbackMessages] = useState<FeedbackMessage[]>(
    []
  );

  // Persisted inputs for re-generation
  const [lastInputs, setLastInputs] = useState<{
    originalHtml: string;
    pageUrl: string;
    baseUrl: string;
    pageTitle: string;
    brandGuidelines: string;
    geckoInsights: string;
    model: string;
  } | null>(null);

  const currentPageUrl = lastInputs?.pageUrl || "";

  // Load from database on mount (generic prompt)
  useEffect(() => {
    fetch("/api/prompts?pageUrl=")
      .then((r) => r.json())
      .then((data) => {
        if (data.genericPrompt) setEditedGenericPrompt(data.genericPrompt);
      })
      .catch(() => {});
  }, []);

  // Load page-specific data from database when pageUrl changes (no chat — session only)
  useEffect(() => {
    if (!currentPageUrl) return;
    fetch(`/api/prompts?pageUrl=${encodeURIComponent(currentPageUrl)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.pagePrompt) setEditedPagePrompt(data.pagePrompt);
        if (data.customInstructions) setCustomInstructions(data.customInstructions);
        // Chat messages are NOT loaded — they are session-only
      })
      .catch(() => {});
  }, [currentPageUrl]);

  // Save generic prompt to database (debounced)
  const saveGenericPrompt = useCallback(
    (content: string) => {
      setEditedGenericPrompt(content);
      fetch("/api/prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "setGenericPrompt", content }),
      }).catch(() => {});
    },
    []
  );

  // Save page prompt to database (debounced)
  const savePagePrompt = useCallback(
    (content: string) => {
      setEditedPagePrompt(content);
      if (!currentPageUrl) return;
      fetch("/api/prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "setPagePrompt", pageUrl: currentPageUrl, content }),
      }).catch(() => {});
    },
    [currentPageUrl]
  );

  // Save instructions to database (chat messages are NOT persisted)
  const saveInstructions = useCallback(
    (instructions: string, changeNote: string = "feedback update") => {
      if (!currentPageUrl) return;
      fetch("/api/prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "setInstructions",
          pageUrl: currentPageUrl,
          customInstructions: instructions,
          changeNote,
        }),
      }).catch(() => {});
    },
    [currentPageUrl]
  );

  const handleSubmit = async (data: {
    url: string;
    brandGuidelines: string;
    geckoInsights: string;
    uploadedHtml?: string;
  }) => {
    setError(null);
    setResult(null);

    try {
      let scraped: ScrapedData;

      if (data.uploadedHtml) {
        setLoadingStage("scraping");
        const parsed = data.url ? new URL(data.url) : null;
        scraped = {
          html: data.uploadedHtml,
          title: data.url || "Uploaded Page",
          url: data.url || "",
          baseUrl: parsed ? `${parsed.protocol}//${parsed.host}` : "",
        };
      } else {
        setLoadingStage("scraping");
        const scrapeRes = await fetch("/api/scrape", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: data.url }),
        });

        if (!scrapeRes.ok) {
          const err = await scrapeRes.json();
          throw new Error(err.error || "Failed to scrape page");
        }

        scraped = await scrapeRes.json();
      }

      // Persist inputs for re-generation
      setLastInputs({
        originalHtml: scraped.html,
        pageUrl: scraped.url,
        baseUrl: scraped.baseUrl,
        pageTitle: scraped.title,
        brandGuidelines: data.brandGuidelines,
        geckoInsights: data.geckoInsights,
        model: selectedModel,
      });

      // Generate modifications
      setLoadingStage("generating");
      const generateRes = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          originalHtml: scraped.html,
          pageUrl: scraped.url,
          brandGuidelines: data.brandGuidelines,
          geckoInsights: data.geckoInsights,
          model: selectedModel,
          customInstructions: customInstructions || undefined,
          customGenericPrompt: editedGenericPrompt || undefined,
          customPagePrompt: editedPagePrompt || undefined,
        }),
      });

      if (!generateRes.ok) {
        const err = await generateRes.json();
        throw new Error(err.error || "Failed to generate modifications");
      }

      const generated = await generateRes.json();

      setResult({
        originalHtml: scraped.html,
        modifiedHtml: generated.modifiedHtml,
        changes: generated.changes,
        baseUrl: scraped.baseUrl,
        pageUrl: scraped.url,
        pageTitle: scraped.title,
        systemPrompt: generated.systemPrompt || "",
        userPrompt: generated.userPrompt || "",
        genericPrompt: generated.genericPrompt || "",
        pageSpecificPrompt: generated.pageSpecificPrompt || "",
      });
      setShowResults(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoadingStage(null);
    }
  };

  const handleRegenerate = async () => {
    if (!lastInputs) return;

    setLoadingStage("generating");
    setError(null);

    try {
      const generateRes = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          originalHtml: lastInputs.originalHtml,
          pageUrl: lastInputs.pageUrl,
          brandGuidelines: lastInputs.brandGuidelines,
          geckoInsights: lastInputs.geckoInsights,
          model: lastInputs.model,
          customInstructions: customInstructions || undefined,
          customGenericPrompt: editedGenericPrompt || undefined,
          customPagePrompt: editedPagePrompt || undefined,
        }),
      });

      if (!generateRes.ok) {
        const err = await generateRes.json();
        throw new Error(err.error || "Failed to re-generate");
      }

      const generated = await generateRes.json();

      setResult({
        originalHtml: lastInputs.originalHtml,
        modifiedHtml: generated.modifiedHtml,
        changes: generated.changes,
        baseUrl: lastInputs.baseUrl,
        pageUrl: lastInputs.pageUrl,
        pageTitle: lastInputs.pageTitle,
        systemPrompt: generated.systemPrompt || "",
        userPrompt: generated.userPrompt || "",
        genericPrompt: generated.genericPrompt || "",
        pageSpecificPrompt: generated.pageSpecificPrompt || "",
      });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoadingStage(null);
    }
  };

  const handleFeedbackSubmit = async (message: string) => {
    const newMessages: FeedbackMessage[] = [
      ...feedbackMessages,
      { role: "user", content: message },
    ];
    setFeedbackMessages(newMessages);

    try {
      const res = await fetch("/api/summarize-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          feedbackMessages: newMessages,
          existingInstructions: customInstructions,
          model: selectedModel,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to process feedback");
      }

      const { instructions } = await res.json();
      setPreviousInstructions(customInstructions);
      setCustomInstructions(instructions);

      // Compute diff between old and new instructions
      const oldLines = new Set(
        previousInstructions.split("\n").map((l: string) => l.trim()).filter(Boolean)
      );
      const newLines = instructions.split("\n").map((l: string) => l.trim()).filter(Boolean);
      const added = newLines.filter((l: string) => !oldLines.has(l));
      const removed = previousInstructions
        .split("\n")
        .map((l: string) => l.trim())
        .filter((l: string) => l && !newLines.includes(l));

      let diffSummary = `Updated instructions (${newLines.length} total).`;
      if (added.length > 0) {
        diffSummary += `\n\n[NEW]\n${added.join("\n")}`;
      }
      if (removed.length > 0) {
        diffSummary += `\n\n[REMOVED]\n${removed.join("\n")}`;
      }
      diffSummary += `\n\nClick "Re-generate with Feedback" to apply.`;

      const updatedMessages: FeedbackMessage[] = [
        ...newMessages,
        {
          role: "assistant",
          content: diffSummary,
        },
      ];
      setFeedbackMessages(updatedMessages);
      saveInstructions(instructions, `feedback: ${message.slice(0, 50)}`);
    } catch {
      const errorMessages: FeedbackMessage[] = [
        ...newMessages,
        {
          role: "assistant",
          content: "Sorry, failed to process that feedback. Please try again.",
        },
      ];
      setFeedbackMessages(errorMessages);
    }
  };

  const handleBack = () => {
    setShowResults(false);
  };

  const handleNewGeneration = () => {
    setResult(null);
    setError(null);
    setShowResults(false);
    // Keep customInstructions — they persist across generations
    // They're also in localStorage keyed by URL
  };

  const handleClearFeedback = () => {
    setCustomInstructions("");
    setFeedbackMessages([]);
    saveInstructions("", "cleared all instructions");
  };

  return (
    <>
      <LoadingOverlay stage={loadingStage} />

      {showResults && result ? (
        <div className="flex flex-col h-screen">
          {/* Top bar */}
          <div className="h-16 bg-gray-950 border-b border-gray-800 flex items-center px-4 gap-4 shrink-0">
            <button
              onClick={handleBack}
              className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10 19l-7-7m0 0l7-7m-7 7h18"
                />
              </svg>
              Back
            </button>
            <div className="w-px h-8 bg-gray-800" />
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                <span className="text-emerald-500 text-sm font-bold">G</span>
              </div>
              <div>
                <h1 className="text-sm font-semibold text-white leading-none">
                  {result.pageTitle}
                </h1>
                <p className="text-xs text-gray-500 mt-0.5">
                  {result.pageUrl}
                </p>
              </div>
            </div>

            {/* Tabs */}
            <div className="ml-auto flex items-center gap-1 bg-gray-800 rounded-lg p-1">
              {(
                [
                  {
                    key: "viewer" as const,
                    label: "Page View",
                    icon: "M15 12a3 3 0 11-6 0 3 3 0 016 0z",
                  },
                  {
                    key: "report" as const,
                    label: "Report",
                    icon: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
                  },
                  {
                    key: "advanced" as const,
                    label: "Advanced",
                    icon: "M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4",
                  },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                    activeTab === tab.key
                      ? "bg-emerald-600 text-white"
                      : "text-gray-400 hover:text-white"
                  }`}
                >
                  <svg
                    className="w-3.5 h-3.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d={tab.icon}
                    />
                  </svg>
                  {tab.label}
                </button>
              ))}
            </div>

            <span className="text-xs text-gray-500 ml-3">
              {result.changes.length} changes
            </span>

            <button
              onClick={handleNewGeneration}
              className="ml-2 flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-gray-400 hover:text-white border border-gray-700 hover:border-gray-600 transition-all"
            >
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4v16m8-8H4"
                />
              </svg>
              New
            </button>
          </div>

          {activeTab === "viewer" ? (
            <PageViewer
              originalHtml={result.originalHtml}
              modifiedHtml={result.modifiedHtml}
              changes={result.changes}
              baseUrl={result.baseUrl}
            />
          ) : activeTab === "report" ? (
            <div className="flex-1 overflow-y-auto bg-gray-950">
              <ExplanationReport
                changes={result.changes}
                pageUrl={result.pageUrl}
                pageTitle={result.pageTitle}
              />
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto bg-gray-950">
              <AdvancedPromptView
                genericPrompt={editedGenericPrompt || result.genericPrompt || GENERIC_SYSTEM_PROMPT}
                pageSpecificPrompt={buildPageSpecificPrompt(
                  result.pageUrl,
                  lastInputs?.brandGuidelines || "",
                  customInstructions
                )}
                editedPagePrompt={editedPagePrompt}
                onGenericPromptChange={setEditedGenericPrompt}
                onPageSpecificPromptChange={setEditedPagePrompt}
                userPrompt={result.userPrompt}
                customInstructions={customInstructions}
                selectedModel={selectedModel}
                onModelChange={setSelectedModel}
              />
            </div>
          )}

          {/* Feedback Chat — floats over all tabs */}
          <FeedbackChat
            messages={feedbackMessages}
            onSendMessage={handleFeedbackSubmit}
            onRegenerate={handleRegenerate}
            onClear={handleClearFeedback}
            isRegenerating={loadingStage !== null}
            customInstructions={customInstructions}
            previousInstructions={previousInstructions}
          />
        </div>
      ) : (
        <div className="min-h-screen flex flex-col">
          {/* Header */}
          <header className="border-b border-gray-800/50">
            <div className="max-w-4xl mx-auto px-6 py-6 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                  <span className="text-emerald-500 text-xl font-bold">G</span>
                </div>
                <div>
                  <h1 className="text-xl font-bold text-white">GeckoCheck</h1>
                  <p className="text-sm text-gray-500">Page Optimizer</p>
                </div>
              </div>

              {/* Main page tabs */}
              <div className="flex items-center gap-1 bg-gray-800 rounded-lg p-1">
                <button
                  onClick={() => setMainTab("form")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                    mainTab === "form"
                      ? "bg-emerald-600 text-white"
                      : "text-gray-400 hover:text-white"
                  }`}
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  Inputs
                </button>
                <button
                  onClick={() => setMainTab("advanced")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                    mainTab === "advanced"
                      ? "bg-emerald-600 text-white"
                      : "text-gray-400 hover:text-white"
                  }`}
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                  </svg>
                  Advanced
                </button>
              </div>
            </div>
          </header>

          {/* Banner to return to results */}
          {result && (
            <div className="bg-emerald-500/5 border-b border-emerald-500/20">
              <div className="max-w-4xl mx-auto px-6 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-emerald-400">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Results available for{" "}
                  <span className="font-medium text-emerald-300">{result.pageTitle}</span>
                  <span className="text-emerald-500/60">({result.changes.length} changes)</span>
                </div>
                <button
                  onClick={() => setShowResults(true)}
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg transition-all"
                >
                  View Results
                </button>
              </div>
            </div>
          )}

          {mainTab === "form" ? (
            <main className="flex-1 flex items-start justify-center py-12">
              <div className="w-full max-w-4xl px-6">
                <div className="mb-8">
                  <h2 className="text-3xl font-bold text-white mb-3">
                    Optimize a Product Page
                  </h2>
                  <p className="text-gray-400 text-lg">
                    Paste a retailer URL, brand guidelines, and GeckoCheck
                    insights to generate an optimized version of the page.
                  </p>
                </div>

                {error && (
                  <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
                    <strong>Error:</strong> {error}
                  </div>
                )}

                <InputForm
                  onSubmit={handleSubmit}
                  isLoading={loadingStage !== null}
                  selectedModel={selectedModel}
                />
              </div>
            </main>
          ) : (
            <main className="flex-1 overflow-y-auto bg-gray-950">
              <AdvancedPromptView
                genericPrompt={editedGenericPrompt || GENERIC_SYSTEM_PROMPT}
                pageSpecificPrompt={buildPageSpecificPrompt(
                  currentPageUrl,
                  "",
                  customInstructions
                )}
                editedPagePrompt={editedPagePrompt}
                onGenericPromptChange={setEditedGenericPrompt}
                onPageSpecificPromptChange={setEditedPagePrompt}
                userPrompt={result?.userPrompt}
                customInstructions={customInstructions}
                selectedModel={selectedModel}
                onModelChange={setSelectedModel}
              />
            </main>
          )}
        </div>
      )}
    </>
  );
}
