"use client";

import { useState } from "react";
import {
  DEFAULT_URL,
  DEFAULT_BRAND_GUIDELINES,
  DEFAULT_CUSTOMER_QUERIES,
  DEFAULT_LLM_LINKS,
  DEFAULT_LLM_SOURCES,
  DEFAULT_LLM_ANSWERS,
  DEFAULT_LLM_CHAIN_OF_THOUGHT,
  DEFAULT_ACTION_ITEMS,
} from "@/lib/defaults";

export interface FormFields {
  url: string;
  brandGuidelines: string;
  customerQueries: string;
  llmLinks: string;
  llmSources: string;
  llmAnswers: string;
  llmChainOfThought: string;
  actionItems: string;
  mode: "optimize" | "create";
  projectDescription: string;
  designReferenceUrl: string;
}

interface InputFormProps {
  onSubmit: (data: {
    url: string;
    brandGuidelines: string;
    geckoInsights: string;
    fields: FormFields;
    mode: "optimize" | "create";
    projectDescription: string;
    designReferenceUrl: string;
    uploadedHtml?: string;
  }) => void;
  isLoading: boolean;
  selectedModel: string;
  initialValues?: FormFields;
  capturedHtml?: string;
}

interface CollapsibleSectionProps {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

function CollapsibleSection({
  title,
  subtitle,
  children,
  defaultOpen = false,
}: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="border border-gray-700 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-3 flex items-center justify-between bg-gray-800/50 hover:bg-gray-800 transition-colors"
      >
        <div className="text-left">
          <span className="text-sm font-semibold text-gray-200">{title}</span>
          <span className="text-xs text-gray-500 ml-2">{subtitle}</span>
        </div>
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>
      {isOpen && <div className="p-4 border-t border-gray-700">{children}</div>}
    </div>
  );
}

export default function InputForm({ onSubmit, isLoading, selectedModel, initialValues, capturedHtml }: InputFormProps) {
  const [mode, setMode] = useState<"optimize" | "create">(initialValues?.mode || "optimize");
  const [projectDescription, setProjectDescription] = useState(initialValues?.projectDescription || "");
  const [designReferenceUrl, setDesignReferenceUrl] = useState(initialValues?.designReferenceUrl || "");
  const [uploadedHtml, setUploadedHtml] = useState(capturedHtml || "");
  const [uploadedFileName, setUploadedFileName] = useState(capturedHtml ? "Captured page" : "");
  const [url, setUrl] = useState(initialValues?.url || DEFAULT_URL);
  const [brandGuidelines, setBrandGuidelines] = useState(initialValues?.brandGuidelines || DEFAULT_BRAND_GUIDELINES);
  const [customerQueries, setCustomerQueries] = useState(initialValues?.customerQueries || DEFAULT_CUSTOMER_QUERIES);
  const [llmLinks, setLlmLinks] = useState(initialValues?.llmLinks || DEFAULT_LLM_LINKS);
  const [llmSources, setLlmSources] = useState(initialValues?.llmSources || DEFAULT_LLM_SOURCES);
  const [llmAnswers, setLlmAnswers] = useState(initialValues?.llmAnswers || DEFAULT_LLM_ANSWERS);
  const [llmChainOfThought, setLlmChainOfThought] = useState(initialValues?.llmChainOfThought || DEFAULT_LLM_CHAIN_OF_THOUGHT);
  const [actionItems, setActionItems] = useState(initialValues?.actionItems || DEFAULT_ACTION_ITEMS);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Combine all insight fields into one structured text
    const geckoInsights = `=== CUSTOMER QUERIES (what users are asking AI assistants) ===
${customerQueries}

=== LLM LINKS PROVIDED TO USER (links the AI gave in its response) ===
${llmLinks}

=== SOURCES THE LLM LOOKED AT (pages the AI crawled to form its answer) ===
${llmSources}

=== LLM ANSWERS GIVEN TO USER (the actual AI responses) ===
${llmAnswers}

=== LLM CHAIN OF THOUGHT (search queries the AI issued internally) ===
${llmChainOfThought}

=== GECKOCHECK ACTION ITEMS (specific changes to make) ===
${actionItems}`;

    onSubmit({
      url: mode === "create" ? "" : url,
      brandGuidelines,
      geckoInsights,
      mode,
      projectDescription,
      designReferenceUrl: mode === "create" ? designReferenceUrl : "",
      uploadedHtml: uploadedHtml || undefined,
      fields: { url: mode === "create" ? "" : url, brandGuidelines, customerQueries, llmLinks, llmSources, llmAnswers, llmChainOfThought, actionItems, mode, projectDescription, designReferenceUrl: mode === "create" ? designReferenceUrl : "" },
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Mode Toggle */}
      <div className="flex gap-1 bg-gray-800 rounded-lg p-1 mb-1">
        <button
          type="button"
          onClick={() => setMode("optimize")}
          className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-all ${
            mode === "optimize" ? "bg-emerald-600 text-white" : "text-gray-400 hover:text-white"
          }`}
        >
          Optimize Existing Page
        </button>
        <button
          type="button"
          onClick={() => setMode("create")}
          className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-all ${
            mode === "create" ? "bg-emerald-600 text-white" : "text-gray-400 hover:text-white"
          }`}
        >
          Create New Page
        </button>
      </div>

      {mode === "optimize" ? (
        <div>
          <label
            htmlFor="url"
            className="block text-sm font-semibold text-gray-200 mb-2"
          >
            Retailer Page URL
          </label>
          <input
            id="url"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.retailer.com/product/example"
            required={!uploadedHtml}
            className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
          />
          {/* Capture / Upload fallback for sites that block scraping */}
          {uploadedHtml ? (
            <div className="mt-2 flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">
              <svg className="w-4 h-4 text-emerald-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-xs text-emerald-400 flex-1">
                Page captured: {uploadedFileName} ({Math.round(uploadedHtml.length / 1024)}KB) — will use this instead of scraping
              </span>
              <button
                type="button"
                onClick={() => { setUploadedHtml(""); setUploadedFileName(""); }}
                className="text-xs text-red-400 hover:text-red-300"
              >
                Remove
              </button>
            </div>
          ) : (
            <details className="mt-2">
              <summary className="text-xs text-gray-500 hover:text-gray-300 cursor-pointer">
                Site blocks scraping? Use page capture instead
              </summary>
              <div className="mt-2 bg-gray-800/50 border border-gray-700 rounded-lg p-3 space-y-3">
                <div>
                  <p className="text-xs text-gray-400 mb-2">
                    <strong className="text-gray-300">Option 1: Bookmarklet</strong> — Drag this to your bookmarks bar, then click it on any page:
                  </p>
                  <a
                    href={`javascript:void(fetch('${typeof window !== "undefined" ? window.location.origin : ""}/api/capture',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({html:document.documentElement.outerHTML,url:location.href,title:document.title})}).then(r=>r.json()).then(d=>{if(d.token){window.open('${typeof window !== "undefined" ? window.location.origin : ""}?capture='+d.token,'_blank')}else{alert('Capture failed')}}).catch(()=>alert('Could not reach GeckoCheck server')))`}
                    className="inline-block px-3 py-1.5 bg-emerald-600 text-white text-xs font-medium rounded cursor-grab"
                    onClick={(e) => e.preventDefault()}
                    draggable
                  >
                    Capture for GeckoCheck
                  </a>
                  <p className="text-xs text-gray-500 mt-1">Drag the green button above to your bookmarks bar</p>
                </div>
              </div>
            </details>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <label
              htmlFor="project-description"
              className="block text-sm font-semibold text-gray-200 mb-2"
            >
              Project Description
            </label>
            <textarea
              id="project-description"
              value={projectDescription}
              onChange={(e) => setProjectDescription(e.target.value)}
              placeholder="Describe the page you want to create. E.g.: A landing page for SodaStream CO2 cylinder exchange program that compares pricing options (online exchange, subscription, in-store) and helps customers find the right cylinder type for their machine..."
              rows={5}
              required
              className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all resize-y text-sm"
            />
          </div>
          <div>
            <label
              htmlFor="design-ref"
              className="block text-sm font-semibold text-gray-200 mb-1"
            >
              Design Reference URL
              <span className="text-gray-500 font-normal ml-1">(optional)</span>
            </label>
            <p className="text-xs text-gray-500 mb-2">
              The new page will match the look and feel of this URL
            </p>
            <input
              id="design-ref"
              type="url"
              value={designReferenceUrl}
              onChange={(e) => setDesignReferenceUrl(e.target.value)}
              placeholder="https://www.example.com/page-to-copy-design-from"
              className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all text-sm"
            />
          </div>
        </div>
      )}

      {/* Brand Guidelines */}
      <div>
        <label
          htmlFor="brand"
          className="block text-sm font-semibold text-gray-200 mb-2"
        >
          Brand Guidelines
        </label>
        <textarea
          id="brand"
          value={brandGuidelines}
          onChange={(e) => setBrandGuidelines(e.target.value)}
          placeholder="Paste the brand positioning, tone of voice, key terminology, and any content rules..."
          rows={5}
          className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all resize-y text-sm"
        />
      </div>

      {/* GeckoCheck Insights - Split into sections */}
      <div>
        <h3 className="text-sm font-semibold text-gray-200 mb-3">
          GeckoCheck Insights
        </h3>
        <div className="space-y-2">
          {/* Customer Queries */}
          <CollapsibleSection
            title="Customer Queries"
            subtitle="What users are asking AI assistants"
            defaultOpen={true}
          >
            <textarea
              value={customerQueries}
              onChange={(e) => setCustomerQueries(e.target.value)}
              placeholder="e.g., Where is the most cost-effective place to buy a gas cylinder..."
              rows={3}
              required
              className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all resize-y text-sm"
            />
          </CollapsibleSection>

          {/* LLM Links */}
          <CollapsibleSection
            title="LLM Links Given to User"
            subtitle="Links the AI included in its response"
          >
            <textarea
              value={llmLinks}
              onChange={(e) => setLlmLinks(e.target.value)}
              placeholder="Paste the links the LLM provided to the user..."
              rows={8}
              className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all resize-y text-sm font-mono"
            />
          </CollapsibleSection>

          {/* Sources the LLM Looked At */}
          <CollapsibleSection
            title="Sources the LLM Looked At"
            subtitle="Pages the AI crawled to form its answer"
          >
            <textarea
              value={llmSources}
              onChange={(e) => setLlmSources(e.target.value)}
              placeholder="Paste the source URLs the LLM consulted..."
              rows={10}
              className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all resize-y text-sm font-mono"
            />
          </CollapsibleSection>

          {/* LLM Answers */}
          <CollapsibleSection
            title="LLM Answers Given to User"
            subtitle="The actual AI responses shown to the customer"
          >
            <textarea
              value={llmAnswers}
              onChange={(e) => setLlmAnswers(e.target.value)}
              placeholder="Paste the full LLM answers..."
              rows={12}
              className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all resize-y text-sm"
            />
          </CollapsibleSection>

          {/* LLM Chain of Thought */}
          <CollapsibleSection
            title="LLM Chain of Thought"
            subtitle="Search queries the AI issued internally"
          >
            <textarea
              value={llmChainOfThought}
              onChange={(e) => setLlmChainOfThought(e.target.value)}
              placeholder="Paste the LLM's internal search queries..."
              rows={10}
              className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all resize-y text-sm font-mono"
            />
          </CollapsibleSection>

          {/* Action Items */}
          <CollapsibleSection
            title="GeckoCheck Action Items"
            subtitle="Specific changes to apply to the page"
            defaultOpen={true}
          >
            <textarea
              value={actionItems}
              onChange={(e) => setActionItems(e.target.value)}
              placeholder='e.g., Create a cost-first brief for the refill page: add H2 "Which official CO2 option saves you more?" with cards for Online Exchange, Subscription, and In-Store Exchange...'
              rows={6}
              required
              className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all resize-y text-sm"
            />
          </CollapsibleSection>
        </div>
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={isLoading || (mode === "optimize" && !url) || (mode === "create" && !projectDescription) || !actionItems}
        className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-semibold rounded-lg transition-all duration-200 flex items-center justify-center gap-3 text-lg cursor-pointer disabled:cursor-not-allowed"
      >
        {isLoading ? (
          <>
            <svg
              className="animate-spin h-5 w-5"
              viewBox="0 0 24 24"
              fill="none"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            Analyzing & Generating...
          </>
        ) : (
          <>
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
                d="M13 10V3L4 14h7v7l9-11h-7z"
              />
            </svg>
            {mode === "create" ? "Generate New Page" : "Generate Optimized Page"}
          </>
        )}
      </button>
    </form>
  );
}
