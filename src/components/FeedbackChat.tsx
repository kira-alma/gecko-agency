"use client";

import { useState, useRef, useEffect } from "react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface FeedbackChatProps {
  messages: Message[];
  onSendMessage: (message: string) => Promise<void>;
  onRegenerate: () => void;
  onClear?: () => void;
  isRegenerating: boolean;
  customInstructions: string;
  previousInstructions?: string;
}

/** Render assistant message with colored [NEW] and [REMOVED] sections */
function FormattedAssistantMessage({ content }: { content: string }) {
  const parts = content.split(/(\[NEW\]|\[REMOVED\])/);
  let mode: "normal" | "new" | "removed" = "normal";

  return (
    <div className="text-sm whitespace-pre-wrap">
      {parts.map((part, i) => {
        if (part === "[NEW]") {
          mode = "new";
          return (
            <span key={i} className="text-emerald-400 font-semibold text-xs block mt-2 mb-1">
              Added:
            </span>
          );
        }
        if (part === "[REMOVED]") {
          mode = "removed";
          return (
            <span key={i} className="text-red-400 font-semibold text-xs block mt-2 mb-1">
              Removed:
            </span>
          );
        }
        if (mode === "new") {
          // Color each line green
          return (
            <span key={i}>
              {part.split("\n").map((line, j) => (
                <span key={j} className={line.trim().startsWith("-") ? "text-emerald-400 block" : ""}>
                  {line}
                  {j < part.split("\n").length - 1 ? "\n" : ""}
                </span>
              ))}
            </span>
          );
        }
        if (mode === "removed") {
          return (
            <span key={i}>
              {part.split("\n").map((line, j) => (
                <span key={j} className={line.trim().startsWith("-") ? "text-red-400 line-through block" : ""}>
                  {line}
                  {j < part.split("\n").length - 1 ? "\n" : ""}
                </span>
              ))}
            </span>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </div>
  );
}

/** Color-code instruction lines — new ones get highlight */
function ColoredInstructions({ instructions, previousInstructions }: { instructions: string; previousInstructions?: string }) {
  const prevLines = new Set(
    (previousInstructions || "").split("\n").map((l) => l.trim()).filter(Boolean)
  );
  const lines = instructions.split("\n").filter((l) => l.trim());

  return (
    <div className="text-xs mt-2 space-y-0.5">
      {lines.map((line, i) => {
        const isNew = prevLines.size > 0 && !prevLines.has(line.trim());
        return (
          <div
            key={i}
            className={`leading-relaxed ${
              isNew
                ? "text-emerald-400 bg-emerald-500/10 px-1 py-0.5 rounded"
                : "text-emerald-400/70"
            }`}
          >
            {isNew && <span className="text-emerald-500 text-[10px] font-bold mr-1">NEW</span>}
            {line}
          </div>
        );
      })}
    </div>
  );
}

export default function FeedbackChat({
  messages,
  onSendMessage,
  onRegenerate,
  onClear,
  isRegenerating,
  customInstructions,
  previousInstructions,
}: FeedbackChatProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isSending) return;
    setInput("");
    setIsSending(true);
    try {
      await onSendMessage(text);
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <>
      {/* Floating toggle button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all ${
          isOpen
            ? "bg-gray-700 hover:bg-gray-600"
            : "bg-emerald-600 hover:bg-emerald-500"
        }`}
      >
        {isOpen ? (
          <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <>
            <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            {messages.length > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full text-white text-xs flex items-center justify-center font-bold">
                {messages.filter((m) => m.role === "user").length}
              </span>
            )}
          </>
        )}
      </button>

      {/* Chat panel */}
      {isOpen && (
        <div className="fixed bottom-24 right-6 z-40 w-96 bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl flex flex-col" style={{ maxHeight: "calc(100vh - 140px)" }}>
          {/* Header */}
          <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between shrink-0">
            <div>
              <h3 className="text-sm font-semibold text-white">Feedback Chat</h3>
              <p className="text-xs text-gray-500">Tell us what to change</p>
            </div>
            <div className="flex items-center gap-2">
              {customInstructions && (
                <span className="text-xs text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded">
                  {customInstructions.split("\n").filter(Boolean).length} active
                </span>
              )}
              {onClear && (messages.length > 0 || customInstructions) && (
                <button
                  onClick={onClear}
                  className="text-xs text-gray-500 hover:text-red-400 transition-colors"
                  title="Clear all feedback and instructions"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* Active instructions (collapsible) */}
          {customInstructions && (
            <details className="px-4 py-2 border-b border-gray-800 bg-gray-800/30">
              <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-300">
                View active instructions
              </summary>
              <ColoredInstructions
                instructions={customInstructions}
                previousInstructions={previousInstructions}
              />
            </details>
          )}

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
            {messages.length === 0 && (
              <div className="text-center py-8">
                <svg className="w-10 h-10 text-gray-700 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                <p className="text-sm text-gray-500">Share feedback on the generated changes.</p>
                <p className="text-xs text-gray-600 mt-1">e.g. &quot;Make the FAQ shorter&quot; or &quot;Add more pricing info&quot;</p>
              </div>
            )}
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-xl px-3 py-2 leading-relaxed ${
                    msg.role === "user"
                      ? "bg-emerald-600 text-white text-sm"
                      : "bg-gray-800 text-gray-200"
                  }`}
                >
                  {msg.role === "assistant" ? (
                    <FormattedAssistantMessage content={msg.content} />
                  ) : (
                    <p className="whitespace-pre-wrap text-sm">{msg.content}</p>
                  )}
                </div>
              </div>
            ))}
            {isSending && (
              <div className="flex justify-start">
                <div className="bg-gray-800 rounded-xl px-3 py-2 text-sm text-gray-400">
                  <span className="animate-pulse">Processing feedback...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Re-generate button */}
          {customInstructions && (
            <div className="px-4 py-2 border-t border-gray-800">
              <button
                onClick={onRegenerate}
                disabled={isRegenerating}
                className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-medium rounded-lg transition-all flex items-center justify-center gap-2"
              >
                {isRegenerating ? (
                  <>
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Re-generating...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Re-generate with Feedback
                  </>
                )}
              </button>
            </div>
          )}

          {/* Input */}
          <div className="px-4 py-3 border-t border-gray-800 shrink-0">
            <div className="flex gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type your feedback..."
                rows={1}
                disabled={isSending}
                className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent resize-none disabled:opacity-50"
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || isSending}
                className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg transition-all shrink-0"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
