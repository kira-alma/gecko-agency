import { NextRequest, NextResponse } from "next/server";
import { generateModifiedPage } from "@/lib/claude";

export const maxDuration = 120;

export async function POST(request: NextRequest) {
  try {
    const {
      originalHtml, pageUrl, brandGuidelines, geckoInsights,
      model, customInstructions, customGenericPrompt, customPagePrompt,
    } = await request.json();

    if (!originalHtml || !geckoInsights) {
      return NextResponse.json(
        { error: "Original HTML and insights are required" },
        { status: 400 }
      );
    }

    const result = await generateModifiedPage(
      originalHtml,
      pageUrl || "",
      brandGuidelines || "",
      geckoInsights,
      model || "anthropic/claude-sonnet-4.6",
      customInstructions || undefined,
      customGenericPrompt || undefined,
      customPagePrompt || undefined
    );

    // Don't send userPrompt back — it contains full HTML and bloats the response
    return NextResponse.json({
      modifiedHtml: result.modifiedHtml,
      changes: result.changes,
      failedChanges: result.failedChanges,
      systemPrompt: result.systemPrompt,
      userPrompt: "", // omit to save memory
      genericPrompt: result.genericPrompt,
      pageSpecificPrompt: result.pageSpecificPrompt,
    });
  } catch (error) {
    const msg = (error as Error).message || "Unknown error";
    console.error("Generation error:", msg);

    // Check for common issues
    if (msg.includes("abort") || msg.includes("timeout")) {
      return NextResponse.json(
        { error: "The model timed out. Try a faster model or a smaller page." },
        { status: 504 }
      );
    }

    return NextResponse.json(
      { error: "Failed to generate: " + msg },
      { status: 500 }
    );
  }
}
