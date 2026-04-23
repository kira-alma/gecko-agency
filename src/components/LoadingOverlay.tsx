"use client";

interface LoadingOverlayProps {
  stage: "scraping" | "generating" | null;
}

export default function LoadingOverlay({ stage }: LoadingOverlayProps) {
  if (!stage) return null;

  return (
    <div className="fixed inset-0 bg-gray-950/80 backdrop-blur-sm z-50 flex items-center justify-center">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 max-w-md w-full mx-4 text-center">
        {/* Animated gecko */}
        <div className="mb-6 relative">
          <div className="w-20 h-20 mx-auto rounded-full bg-emerald-500/10 flex items-center justify-center">
            <svg
              className="w-10 h-10 text-emerald-500 animate-pulse"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
              />
            </svg>
          </div>
          {/* Progress dots */}
          <div className="flex justify-center gap-1.5 mt-4">
            <div
              className={`w-2 h-2 rounded-full transition-all duration-500 ${
                stage === "scraping" ? "bg-emerald-500 animate-bounce" : "bg-emerald-500"
              }`}
              style={{ animationDelay: "0ms" }}
            />
            <div
              className={`w-2 h-2 rounded-full transition-all duration-500 ${
                stage === "scraping"
                  ? "bg-emerald-500 animate-bounce"
                  : stage === "generating"
                    ? "bg-emerald-500 animate-bounce"
                    : "bg-gray-700"
              }`}
              style={{ animationDelay: "150ms" }}
            />
            <div
              className={`w-2 h-2 rounded-full transition-all duration-500 ${
                stage === "generating" ? "bg-emerald-500 animate-bounce" : "bg-gray-700"
              }`}
              style={{ animationDelay: "300ms" }}
            />
          </div>
        </div>

        <h3 className="text-xl font-bold text-white mb-2">
          {stage === "scraping"
            ? "Scraping Retailer Page"
            : "Generating Optimizations"}
        </h3>
        <p className="text-gray-400 text-sm">
          {stage === "scraping"
            ? "Loading the full page with JavaScript rendering..."
            : "Claude is analyzing the page and applying GeckoCheck insights..."}
        </p>

        {/* Steps indicator */}
        <div className="mt-6 flex items-center justify-center gap-3 text-xs">
          <div
            className={`flex items-center gap-1.5 ${
              stage === "scraping" ? "text-emerald-400" : "text-emerald-600"
            }`}
          >
            {stage === "generating" ? (
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                  clipRule="evenodd"
                />
              </svg>
            ) : (
              <svg
                className="w-4 h-4 animate-spin"
                fill="none"
                viewBox="0 0 24 24"
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
            )}
            Scrape
          </div>
          <div className="w-6 h-px bg-gray-700" />
          <div
            className={`flex items-center gap-1.5 ${
              stage === "generating" ? "text-emerald-400" : "text-gray-600"
            }`}
          >
            {stage === "generating" ? (
              <svg
                className="w-4 h-4 animate-spin"
                fill="none"
                viewBox="0 0 24 24"
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
            ) : (
              <div className="w-4 h-4 rounded-full border-2 border-gray-700" />
            )}
            Generate
          </div>
          <div className="w-6 h-px bg-gray-700" />
          <div className="flex items-center gap-1.5 text-gray-600">
            <div className="w-4 h-4 rounded-full border-2 border-gray-700" />
            Done
          </div>
        </div>
      </div>
    </div>
  );
}
