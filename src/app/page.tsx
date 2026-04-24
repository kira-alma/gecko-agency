"use client";

import { useState, useEffect, useCallback } from "react";
import InputForm from "@/components/InputForm";
import type { FormFields } from "@/components/InputForm";
import PageViewer from "@/components/PageViewer";
import LoadingOverlay from "@/components/LoadingOverlay";
import ExplanationReport from "@/components/ExplanationReport";
import AdvancedPromptView from "@/components/AdvancedPromptView";
import FeedbackChat from "@/components/FeedbackChat";
import RunsList from "@/components/RunsList";
import type { Change } from "@/lib/claude";
import type { RunSummary } from "@/lib/db";
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
  failedChanges: Change[];
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

  // Runs persistence
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [loadedFormValues, setLoadedFormValues] = useState<FormFields | undefined>(undefined);

  // Load runs list on mount
  useEffect(() => {
    fetch("/api/runs")
      .then((r) => r.json())
      .then((data) => { if (data.runs) setRuns(data.runs); })
      .catch(() => {});
  }, []);

  const refreshRuns = () => {
    fetch("/api/runs")
      .then((r) => r.json())
      .then((data) => { if (data.runs) setRuns(data.runs); })
      .catch(() => {});
  };

  const loadRun = async (id: string) => {
    try {
      const res = await fetch(`/api/runs?id=${id}`);
      if (!res.ok) throw new Error("Failed to load run");
      const run = await res.json();

      const changes: Change[] = JSON.parse(run.changesJson || "[]");
      const baseUrl = (() => {
        try { const u = new URL(run.pageUrl); return `${u.protocol}//${u.host}`; } catch { return ""; }
      })();

      setResult({
        originalHtml: run.originalHtml,
        modifiedHtml: run.modifiedHtml,
        changes,
        failedChanges: [],
        baseUrl,
        pageUrl: run.pageUrl,
        pageTitle: run.pageTitle,
        systemPrompt: run.systemPrompt,
        userPrompt: run.userPrompt,
        genericPrompt: run.genericPrompt,
        pageSpecificPrompt: run.pageSpecificPrompt,
      });

      setLastInputs({
        originalHtml: run.originalHtml,
        pageUrl: run.pageUrl,
        baseUrl,
        pageTitle: run.pageTitle,
        brandGuidelines: run.brandGuidelines,
        geckoInsights: run.geckoInsights,
        model: run.model,
      });

      const isCreateMode = run.pageUrl === "(new page)" || !!run.projectDescription;
      setLoadedFormValues({
        url: run.pageUrl === "(new page)" ? "" : run.pageUrl,
        brandGuidelines: run.brandGuidelines,
        customerQueries: run.customerQueries,
        llmLinks: run.llmLinks,
        llmSources: run.llmSources,
        llmAnswers: run.llmAnswers,
        llmChainOfThought: run.llmChainOfThought,
        actionItems: run.actionItems,
        mode: isCreateMode ? "create" : "optimize",
        projectDescription: run.projectDescription || "",
        designReferenceUrl: run.designReferenceUrl || "",
      });

      setSelectedModel(run.model);
      setActiveRunId(id);
      setShowResults(true);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleDeleteRun = async (id: string) => {
    try {
      await fetch("/api/runs", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      refreshRuns();
      if (activeRunId === id) {
        setActiveRunId(null);
        setResult(null);
        setShowResults(false);
      }
    } catch { /* ignore */ }
  };

  const handleRenameRun = async (id: string, displayName: string) => {
    try {
      await fetch("/api/runs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, displayName }),
      });
      refreshRuns();
    } catch { /* ignore */ }
  };

  // Model selection — shared between form and advanced tab
  const [selectedModel, setSelectedModel] = useState("openai/gpt-5");

  // Main page tab (input form vs advanced)
  const [mainTab, setMainTab] = useState<"form" | "advanced">("form");

  // Editable prompts — empty string means "use default"
  const [editedGenericPrompt, setEditedGenericPrompt] = useState("");
  const [editedPagePrompt, setEditedPagePrompt] = useState("");

  // Feedback instructions — split into generic (all pages) and page-specific
  const [genericInstructions, setGenericInstructions] = useState("");
  const [pageInstructions, setPageInstructions] = useState("");
  const [previousGenericInstructions, setPreviousGenericInstructions] = useState("");
  const [previousPageInstructions, setPreviousPageInstructions] = useState("");
  const [feedbackMessages, setFeedbackMessages] = useState<FeedbackMessage[]>(
    []
  );

  // Combined instructions for the LLM and display
  const customInstructions = [
    genericInstructions ? `[GENERIC — applies to all pages]\n${genericInstructions}` : "",
    pageInstructions ? `[PAGE-SPECIFIC]\n${pageInstructions}` : "",
  ].filter(Boolean).join("\n\n");

  const previousInstructions = [
    previousGenericInstructions ? `[GENERIC — applies to all pages]\n${previousGenericInstructions}` : "",
    previousPageInstructions ? `[PAGE-SPECIFIC]\n${previousPageInstructions}` : "",
  ].filter(Boolean).join("\n\n");

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

  // Load from database on mount (generic prompt + generic instructions)
  useEffect(() => {
    fetch("/api/prompts?pageUrl=")
      .then((r) => r.json())
      .then((data) => {
        if (data.genericPrompt) setEditedGenericPrompt(data.genericPrompt);
        if (data.genericInstructions) setGenericInstructions(data.genericInstructions);
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
        if (data.customInstructions) setPageInstructions(data.customInstructions);
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
    fields: FormFields;
    mode: "optimize" | "create";
    projectDescription: string;
    designReferenceUrl: string;
  }) => {
    setError(null);
    setResult(null);

    try {
      // CREATE MODE — generate a new page from scratch
      if (data.mode === "create") {
        // If design reference URL provided, scrape it first
        let designReferenceHtml = "";
        if (data.designReferenceUrl) {
          setLoadingStage("scraping");
          try {
            const scrapeRes = await fetch("/api/scrape", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ url: data.designReferenceUrl }),
            });
            if (scrapeRes.ok) {
              const scraped = await scrapeRes.json();
              designReferenceHtml = scraped.html;
            }
          } catch { /* continue without design reference */ }
        }

        setLoadingStage("generating");

        const createRes = await fetch("/api/create-page", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectDescription: data.projectDescription,
            brandGuidelines: data.brandGuidelines,
            geckoInsights: data.geckoInsights,
            model: selectedModel,
            customInstructions: customInstructions || undefined,
            customGenericPrompt: editedGenericPrompt || undefined,
            designReferenceUrl: data.designReferenceUrl || undefined,
            designReferenceHtml: designReferenceHtml || undefined,
          }),
        });

        if (!createRes.ok) {
          const text = await createRes.text();
          try { const err = JSON.parse(text); throw new Error(err.error || "Failed to create page"); }
          catch { throw new Error(`Page creation failed (${createRes.status}).`); }
        }

        const generated = await createRes.json();

        setLastInputs({
          originalHtml: "",
          pageUrl: "",
          baseUrl: "",
          pageTitle: generated.title || "New Page",
          brandGuidelines: data.brandGuidelines,
          geckoInsights: data.geckoInsights,
          model: selectedModel,
        });

        setResult({
          originalHtml: "",
          modifiedHtml: generated.modifiedHtml,
          changes: generated.changes,
          failedChanges: generated.failedChanges || [],
          baseUrl: "",
          pageUrl: "",
          pageTitle: generated.title || "New Page",
          systemPrompt: generated.systemPrompt || "",
          userPrompt: generated.userPrompt || "",
          genericPrompt: generated.genericPrompt || "",
          pageSpecificPrompt: generated.pageSpecificPrompt || "",
        });
        setShowResults(true);

        // Save run
        const runId = crypto.randomUUID();
        setActiveRunId(runId);
        fetch("/api/runs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: runId,
            pageUrl: "(new page)",
            pageTitle: generated.title || "New Page",
            model: selectedModel,
            brandGuidelines: data.fields.brandGuidelines,
            customerQueries: data.fields.customerQueries,
            llmLinks: data.fields.llmLinks,
            llmSources: data.fields.llmSources,
            llmAnswers: data.fields.llmAnswers,
            llmChainOfThought: data.fields.llmChainOfThought,
            actionItems: data.fields.actionItems,
            geckoInsights: data.geckoInsights,
            projectDescription: data.projectDescription,
            designReferenceUrl: data.designReferenceUrl,
            systemPrompt: generated.systemPrompt || "",
            userPrompt: "",
            genericPrompt: generated.genericPrompt || "",
            pageSpecificPrompt: generated.pageSpecificPrompt || "",
            changesJson: JSON.stringify(generated.changes),
            originalHtml: "",
            modifiedHtml: generated.modifiedHtml,
          }),
        }).then(() => refreshRuns()).catch(console.error);

        return;
      }

      // OPTIMIZE MODE — scrape existing page then generate changes
      let scraped: ScrapedData;

      {
        setLoadingStage("scraping");
        const scrapeRes = await fetch("/api/scrape", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: data.url }),
        });

        if (!scrapeRes.ok) {
          const text = await scrapeRes.text();
          try { const err = JSON.parse(text); throw new Error(err.error || "Failed to scrape page"); }
          catch { throw new Error(`Scrape failed (${scrapeRes.status}). The server may be out of memory or the page took too long to load.`); }
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
        const text = await generateRes.text();
        try { const err = JSON.parse(text); throw new Error(err.error || "Failed to generate"); }
        catch { throw new Error(`Generation failed (${generateRes.status}). The server may be out of memory or the model timed out.`); }
      }

      const generated = await generateRes.json();

      setResult({
        originalHtml: scraped.html,
        modifiedHtml: generated.modifiedHtml,
        changes: generated.changes,
        failedChanges: generated.failedChanges || [],
        baseUrl: scraped.baseUrl,
        pageUrl: scraped.url,
        pageTitle: scraped.title,
        systemPrompt: generated.systemPrompt || "",
        userPrompt: generated.userPrompt || "",
        genericPrompt: generated.genericPrompt || "",
        pageSpecificPrompt: generated.pageSpecificPrompt || "",
      });
      setShowResults(true);

      // Save run to database
      const runId = crypto.randomUUID();
      setActiveRunId(runId);
      fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: runId,
          pageUrl: scraped.url,
          pageTitle: scraped.title,
          model: selectedModel,
          brandGuidelines: data.fields.brandGuidelines,
          customerQueries: data.fields.customerQueries,
          llmLinks: data.fields.llmLinks,
          llmSources: data.fields.llmSources,
          llmAnswers: data.fields.llmAnswers,
          llmChainOfThought: data.fields.llmChainOfThought,
          actionItems: data.fields.actionItems,
          geckoInsights: data.geckoInsights,
          systemPrompt: generated.systemPrompt || "",
          userPrompt: generated.userPrompt || "",
          genericPrompt: generated.genericPrompt || "",
          pageSpecificPrompt: generated.pageSpecificPrompt || "",
          changesJson: JSON.stringify(generated.changes),
          originalHtml: scraped.html,
          modifiedHtml: generated.modifiedHtml,
        }),
      }).then(() => refreshRuns()).catch(console.error);
    } catch (err) {
      const msg = (err as Error).message;
      if (msg === "Failed to fetch") {
        setError("Request failed — the server may have timed out or the page is too large. Try using Upload HTML mode or a smaller page.");
      } else {
        setError(msg);
      }
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
        failedChanges: generated.failedChanges || [],
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
          existingGenericInstructions: genericInstructions,
          existingPageInstructions: pageInstructions,
          pageUrl: currentPageUrl,
          model: selectedModel,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to process feedback");
      }

      const data = await res.json();
      const newGeneric = data.genericInstructions || "";
      const newPage = data.pageInstructions || "";

      // Save previous for diffing
      setPreviousGenericInstructions(genericInstructions);
      setPreviousPageInstructions(pageInstructions);

      // Update state
      setGenericInstructions(newGeneric);
      setPageInstructions(newPage);

      // Save to DB
      const changeNote = `feedback: ${message.slice(0, 50)}`;
      if (newGeneric !== genericInstructions) {
        fetch("/api/prompts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "setGenericInstructions", customInstructions: newGeneric, changeNote }),
        }).catch(() => {});
      }
      if (newPage !== pageInstructions) {
        saveInstructions(newPage, changeNote);
      }

      // Build diff summary
      const oldAllLines = new Set(
        [...genericInstructions.split("\n"), ...pageInstructions.split("\n")]
          .map((l) => l.trim()).filter(Boolean)
      );
      const newAllLines = [...newGeneric.split("\n"), ...newPage.split("\n")]
        .map((l) => l.trim()).filter(Boolean);
      const added = newAllLines.filter((l) => !oldAllLines.has(l));
      const removed = [...genericInstructions.split("\n"), ...pageInstructions.split("\n")]
        .map((l) => l.trim())
        .filter((l) => l && !newAllLines.includes(l));

      const genericCount = newGeneric.split("\n").filter((l: string) => l.trim().startsWith("-")).length;
      const pageCount = newPage.split("\n").filter((l: string) => l.trim().startsWith("-")).length;

      let diffSummary = `Updated: ${genericCount} generic + ${pageCount} page-specific instructions.`;
      if (added.length > 0) {
        diffSummary += `\n\n[NEW]\n${added.join("\n")}`;
      }
      if (removed.length > 0) {
        diffSummary += `\n\n[REMOVED]\n${removed.join("\n")}`;
      }
      diffSummary += `\n\nClick "Re-generate with Feedback" to apply.`;

      const updatedMessages: FeedbackMessage[] = [
        ...newMessages,
        { role: "assistant", content: diffSummary },
      ];
      setFeedbackMessages(updatedMessages);
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
    setActiveRunId(null);
    setLoadedFormValues(undefined);
  };

  const [isDownloading, setIsDownloading] = useState(false);
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);

  const triggerDownload = async (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleDownloadPage = async () => {
    if (!result) return;
    setIsDownloading(true);
    setShowDownloadMenu(false);
    try {
      const res = await fetch("/api/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modifiedHtml: result.modifiedHtml,
          baseUrl: result.baseUrl,
          pageTitle: result.pageTitle,
        }),
      });
      if (!res.ok) throw new Error("Download failed");
      const blob = await res.blob();
      const filename = res.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1] || "geckocheck-page.html";
      await triggerDownload(blob, filename);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsDownloading(false);
    }
  };

  const handleDownloadReport = () => {
    if (!result) return;
    setShowDownloadMenu(false);

    const safeName = (result.pageTitle || "page").replace(/[^a-zA-Z0-9-_ ]/g, "_").slice(0, 50);

    // Strip HTML to readable text
    const strip = (html: string) => html
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
      .replace(/\s+/g, " ").trim();

    // Simple word diff → HTML with colored spans
    const wordDiff = (oldText: string, newText: string): string => {
      if (!oldText && newText) return `<span class="added">${esc(newText)}</span>`;
      if (oldText && !newText) return `<span class="removed">${esc(oldText)}</span>`;
      const oldWords = oldText.split(/(\s+)/);
      const newWords = newText.split(/(\s+)/);
      const m = oldWords.length, n = newWords.length;
      if (m * n > 50000) {
        return `<span class="removed">${esc(oldText)}</span><br><span class="added">${esc(newText)}</span>`;
      }
      const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
      for (let i = 1; i <= m; i++)
        for (let j = 1; j <= n; j++)
          dp[i][j] = oldWords[i-1] === newWords[j-1] ? dp[i-1][j-1]+1 : Math.max(dp[i-1][j], dp[i][j-1]);
      const parts: { type: string; text: string }[] = [];
      let i = m, j = n;
      while (i > 0 || j > 0) {
        if (i > 0 && j > 0 && oldWords[i-1] === newWords[j-1]) { parts.push({ type: "same", text: oldWords[--i] }); j--; }
        else if (j > 0 && (i === 0 || dp[i][j-1] >= dp[i-1][j])) { parts.push({ type: "added", text: newWords[--j] }); }
        else { parts.push({ type: "removed", text: oldWords[--i] }); }
      }
      parts.reverse();
      return parts.map(p => p.type === "removed" ? `<span class="removed">${esc(p.text)}</span>`
        : p.type === "added" ? `<span class="added">${esc(p.text)}</span>`
        : esc(p.text)).join("");
    };

    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    const reportHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>GeckoCheck Report — ${esc(result.pageTitle)}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0a0a0a; color: #e5e5e5; padding: 40px; line-height: 1.6; max-width: 900px; margin: 0 auto; }
  .header { margin-bottom: 40px; }
  .header h1 { font-size: 24px; color: #fff; margin-bottom: 4px; }
  .header p { color: #888; font-size: 14px; }
  .badge { display: inline-block; padding: 2px 10px; border-radius: 12px; font-size: 11px; font-weight: 600; margin-right: 8px; }
  .badge-content { background: rgba(59,130,246,0.2); color: #60a5fa; }
  .badge-seo { background: rgba(168,85,247,0.2); color: #c084fc; }
  .badge-structure { background: rgba(245,158,11,0.2); color: #fbbf24; }
  .badge-branding { background: rgba(16,185,129,0.2); color: #34d399; }
  .stats { display: flex; gap: 16px; margin: 24px 0; flex-wrap: wrap; }
  .stat { background: #1a1a1a; border: 1px solid #333; border-radius: 8px; padding: 16px; min-width: 100px; }
  .stat-number { font-size: 28px; font-weight: 700; color: #fff; }
  .stat-label { font-size: 11px; color: #888; margin-top: 4px; }
  .change { background: #111; border: 1px solid #222; border-radius: 12px; margin-bottom: 24px; overflow: hidden; }
  .change-header { padding: 16px 20px; border-bottom: 1px solid #222; display: flex; align-items: center; gap: 12px; }
  .change-num { width: 28px; height: 28px; border-radius: 8px; background: #222; color: #888; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; flex-shrink: 0; }
  .change-title { font-size: 15px; font-weight: 600; color: #fff; }
  .change-body { padding: 16px 20px; }
  .diff-inline { background: #1a1a1a; border: 1px solid #333; border-radius: 8px; padding: 14px 18px; font-size: 14px; line-height: 1.8; color: #999; }
  .diff-inline .removed { background: rgba(239,68,68,0.15); color: #fca5a5; text-decoration: line-through; padding: 1px 3px; border-radius: 3px; }
  .diff-inline .added { background: rgba(16,185,129,0.15); color: #6ee7b7; padding: 1px 3px; border-radius: 3px; }
  .new-content { background: rgba(16,185,129,0.05); border: 1px solid rgba(16,185,129,0.2); border-radius: 8px; padding: 14px 18px; font-size: 14px; color: #6ee7b7; line-height: 1.8; }
  .new-label { display: inline-block; background: rgba(16,185,129,0.15); color: #34d399; font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 4px; margin-bottom: 10px; }
  .meta-change { display: flex; flex-direction: column; gap: 8px; }
  .meta-label { display: inline-block; background: #222; color: #aaa; font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 4px; margin-bottom: 4px; }
  .meta-before { background: rgba(239,68,68,0.05); border: 1px solid rgba(239,68,68,0.12); border-radius: 8px; padding: 10px 14px; font-size: 13px; color: #ccc; }
  .meta-after { background: rgba(16,185,129,0.05); border: 1px solid rgba(16,185,129,0.12); border-radius: 8px; padding: 10px 14px; font-size: 13px; color: #e5e5e5; }
  .meta-sublabel { font-size: 10px; font-weight: 600; margin-bottom: 4px; }
  .meta-sublabel-before { color: #f87171; }
  .meta-sublabel-after { color: #34d399; }
  .reasoning { padding: 16px 20px; border-top: 1px solid #222; background: #0d0d0d; }
  .reasoning-title { font-size: 11px; color: #888; font-weight: 600; margin-bottom: 6px; }
  .reasoning-text { font-size: 13px; color: #ccc; }
  .insight-box { background: rgba(16,185,129,0.05); border: 1px solid rgba(16,185,129,0.15); border-radius: 8px; padding: 12px 16px; margin-top: 12px; }
  .insight-label { font-size: 11px; color: #34d399; font-weight: 600; margin-bottom: 4px; }
  .insight-text { font-size: 13px; color: rgba(52,211,153,0.8); font-style: italic; }
  .brand-box { background: rgba(59,130,246,0.05); border: 1px solid rgba(59,130,246,0.15); border-radius: 8px; padding: 12px 16px; margin-top: 12px; }
  .brand-label { font-size: 11px; color: #60a5fa; font-weight: 600; margin-bottom: 4px; }
  .brand-text { font-size: 13px; color: rgba(96,165,250,0.8); }
  .footer { text-align: center; color: #444; font-size: 11px; margin-top: 40px; padding-top: 20px; border-top: 1px solid #222; }
</style>
</head>
<body>
<div class="header">
  <div style="color:#34d399;font-size:12px;font-weight:600;margin-bottom:12px;">GECKOCHECK OPTIMIZATION REPORT</div>
  <h1>${esc(result.pageTitle)}</h1>
  <p>${esc(result.pageUrl)}</p>
  <div class="stats">
    <div class="stat"><div class="stat-number">${result.changes.length}</div><div class="stat-label">Total Changes</div></div>
  </div>
</div>
${result.changes.map((c, i) => {
  const isMeta = c.originalSnippet.trim().startsWith("<meta") || c.originalSnippet.includes("<title") || c.originalSnippet.includes("application/ld+json");
  const oldText = strip(c.originalSnippet);
  const newText = strip(c.modifiedSnippet);
  const isNewContent = !oldText && newText;
  const isJsonLd = c.modifiedSnippet.includes("application/ld+json") || c.modifiedSnippet.includes('"@context"');

  let diffHtml: string;
  if (isJsonLd) {
    const types = [...c.modifiedSnippet.matchAll(/"@type"\s*:\s*"([^"]+)"/g)].map(m => m[1]);
    const visibleText = newText.replace(/\{[\s\S]*\}/g, "").trim();
    diffHtml = `<div class="new-label">New Content + Structured Data</div>` +
      (visibleText ? `<div class="new-content">${esc(visibleText.slice(0, 500))}</div>` : "") +
      `<div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">${types.map(t => `<span class="badge badge-seo">${esc(t)}</span>`).join("")}</div>`;
  } else if (isNewContent) {
    diffHtml = `<div class="new-label">New Content Added</div><div class="new-content">${esc(newText.slice(0, 600))}</div>`;
  } else if (isMeta) {
    const descMatch = (s: string) => (s.match(/content="([^"]*)"/)?.[1] || strip(s));
    const label = c.originalSnippet.includes('name="description"') ? "Meta Description"
      : c.originalSnippet.includes("<title") ? "Page Title" : "Meta Tag";
    diffHtml = `<div class="meta-change"><span class="meta-label">${label}</span>` +
      `<div class="meta-sublabel meta-sublabel-before">Before</div><div class="meta-before">${esc(descMatch(c.originalSnippet))}</div>` +
      `<div class="meta-sublabel meta-sublabel-after">After</div><div class="meta-after">${esc(descMatch(c.modifiedSnippet))}</div></div>`;
  } else if (oldText === newText) {
    diffHtml = `<div style="color:#888;font-style:italic;font-size:13px;">Structural change — visible content unchanged</div>`;
  } else {
    diffHtml = `<div class="diff-inline">${wordDiff(oldText, newText)}</div>`;
  }

  return `
<div class="change">
  <div class="change-header">
    <div class="change-num">${i + 1}</div>
    <span class="badge badge-${c.category}">${esc(c.category)}</span>
    <span class="change-title">${esc(c.description)}</span>
  </div>
  <div class="change-body">${diffHtml}</div>
  <div class="reasoning">
    <div class="reasoning-title">Strategic Rationale</div>
    <div class="reasoning-text">${esc(c.reasoning)}</div>
    <div class="insight-box">
      <div class="insight-label">GeckoCheck Insight</div>
      <div class="insight-text">"${esc(c.sourceInsight)}"</div>
    </div>
    ${c.brandAlignment ? `<div class="brand-box"><div class="brand-label">Brand Compliance</div><div class="brand-text">${esc(c.brandAlignment)}</div></div>` : ""}
  </div>
</div>`;
}).join("")}
<div class="footer">Generated by GeckoCheck Page Optimizer — ${new Date().toISOString().split("T")[0]}</div>
</body>
</html>`;

    const blob = new Blob([reportHtml], { type: "text/html" });
    triggerDownload(blob, `geckocheck-report-${safeName}.html`);
  };

  const handleClearFeedback = () => {
    setGenericInstructions("");
    setPageInstructions("");
    setFeedbackMessages([]);
    saveInstructions("", "cleared page instructions");
    fetch("/api/prompts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "setGenericInstructions", customInstructions: "", changeNote: "cleared generic instructions" }),
    }).catch(() => {});
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
              {result.changes.length} applied
              {result.failedChanges.length > 0 && (
                <span className="text-red-400 ml-1">
                  ({result.failedChanges.length} failed)
                </span>
              )}
            </span>

            <div className="relative ml-2">
              <button
                onClick={() => setShowDownloadMenu(!showDownloadMenu)}
                disabled={isDownloading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-gray-400 hover:text-white border border-gray-700 hover:border-gray-600 transition-all disabled:opacity-50"
              >
                {isDownloading ? (
                  <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : (
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                )}
                {isDownloading ? "Zipping..." : "Download"}
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {showDownloadMenu && (
                <div className="absolute right-0 top-full mt-1 bg-gray-900 border border-gray-700 rounded-lg shadow-xl z-50 w-52 py-1">
                  <button
                    onClick={handleDownloadPage}
                    className="w-full text-left px-4 py-2.5 text-xs text-gray-300 hover:bg-gray-800 hover:text-white transition-colors flex items-center gap-2"
                  >
                    <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                    </svg>
                    Optimized Page (.html)
                  </button>
                  <button
                    onClick={handleDownloadReport}
                    className="w-full text-left px-4 py-2.5 text-xs text-gray-300 hover:bg-gray-800 hover:text-white transition-colors flex items-center gap-2"
                  >
                    <svg className="w-4 h-4 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Changes Report (.html)
                  </button>
                </div>
              )}
            </div>

            <button
              onClick={handleNewGeneration}
              className="ml-1 flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-gray-400 hover:text-white border border-gray-700 hover:border-gray-600 transition-all"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New
            </button>
          </div>

          {activeTab === "viewer" ? (
            <PageViewer
              originalHtml={result.originalHtml}
              modifiedHtml={result.modifiedHtml}
              changes={result.changes}
              failedChanges={result.failedChanges}
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

                {/* Previous Runs */}
                {runs.length > 0 && (
                  <details className="mb-6 bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                    <summary className="px-4 py-3 cursor-pointer text-sm font-medium text-gray-300 hover:text-white flex items-center gap-2">
                      <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Previous Runs
                      <span className="text-xs text-gray-500 ml-1">({runs.length})</span>
                    </summary>
                    <div className="px-3 pb-3 border-t border-gray-800 pt-2">
                      <RunsList
                        runs={runs}
                        activeRunId={activeRunId}
                        onSelect={loadRun}
                        onDelete={handleDeleteRun}
                        onRename={handleRenameRun}
                      />
                    </div>
                  </details>
                )}

                {error && (
                  <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
                    <strong>Error:</strong> {error}
                  </div>
                )}

                <InputForm
                  key={activeRunId || "new"}
                  onSubmit={handleSubmit}
                  isLoading={loadingStage !== null}
                  selectedModel={selectedModel}
                  initialValues={loadedFormValues}
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
