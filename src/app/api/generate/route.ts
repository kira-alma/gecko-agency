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

    return NextResponse.json(result);
  } catch (error) {
    console.error("Generation error:", error);
    return NextResponse.json(
      { error: "Failed to generate: " + (error as Error).message },
      { status: 500 }
    );
  }
}
