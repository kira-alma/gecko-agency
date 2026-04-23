import { NextRequest, NextResponse } from "next/server";
import { callOpenRouter } from "@/lib/claude";

export const maxDuration = 30;

export async function POST(request: NextRequest) {
  try {
    const {
      feedbackMessages,
      existingGenericInstructions,
      existingPageInstructions,
      pageUrl,
      model,
    } = await request.json();

    if (!feedbackMessages || feedbackMessages.length === 0) {
      return NextResponse.json(
        { error: "Feedback messages are required" },
        { status: 400 }
      );
    }

    const systemPrompt = `You are a prompt engineering assistant for GeckoCheck, a tool that optimizes retailer product pages. You receive feedback from a sales team reviewer. Your job is to convert their feedback into clear, concise instructions AND classify each instruction as either GENERIC or PAGE-SPECIFIC.

CLASSIFICATION RULES:
- GENERIC instructions apply to ALL pages across ALL brands. Examples:
  "Always include pricing comparisons", "Keep FAQs to 5 questions max", "Never invent claims not on the source page", "Always add JSON-LD structured data", "Use bullet points instead of paragraphs for key features"
- PAGE-SPECIFIC instructions apply only to this particular page/brand. Examples:
  "Add SodaStream cylinder compatibility info", "Include the $16.99 exchange price", "Mention the pink vs blue cylinder difference", "Shorten the CO2 refill FAQ section"

When in doubt, classify as PAGE-SPECIFIC (safer — doesn't affect other pages).

MERGE RULES:
1. Merge new feedback with existing instructions — do not duplicate
2. Update or override conflicting instructions
3. Max 15 bullet points per category
4. Preserve the reviewer's intent faithfully

OUTPUT FORMAT (strict — no other text):
[GENERIC]
- instruction 1
- instruction 2

[PAGE-SPECIFIC]
- instruction 1
- instruction 2

If a category has no instructions, still include the header with no items below it.`;

    const conversationText = feedbackMessages
      .map((m: { role: string; content: string }) =>
        `${m.role === "user" ? "Reviewer" : "System"}: ${m.content}`
      )
      .join("\n");

    const userPrompt = `Page being optimized: ${pageUrl || "unknown"}

${existingGenericInstructions ? `=== CURRENT GENERIC INSTRUCTIONS ===\n${existingGenericInstructions}\n` : ""}
${existingPageInstructions ? `=== CURRENT PAGE-SPECIFIC INSTRUCTIONS ===\n${existingPageInstructions}\n` : ""}
=== NEW FEEDBACK FROM REVIEWER ===
${conversationText}

Classify and produce the updated instructions. Output ONLY the [GENERIC] and [PAGE-SPECIFIC] sections.`;

    const text = await callOpenRouter(
      systemPrompt,
      userPrompt,
      model || "openai/gpt-5"
    );

    // Parse the two sections
    const genericMatch = text.match(/\[GENERIC\]([\s\S]*?)(?=\[PAGE-SPECIFIC\]|$)/i);
    const pageMatch = text.match(/\[PAGE-SPECIFIC\]([\s\S]*?)$/i);

    const extractLines = (section: string | undefined): string => {
      if (!section) return "";
      return section
        .split("\n")
        .map((l: string) => l.trim())
        .filter((l: string) => l.startsWith("-"))
        .join("\n");
    };

    const genericInstructions = extractLines(genericMatch?.[1]);
    const pageInstructions = extractLines(pageMatch?.[1]);

    return NextResponse.json({
      genericInstructions,
      pageInstructions,
    });
  } catch (error) {
    console.error("Summarize feedback error:", error);
    return NextResponse.json(
      { error: "Failed to summarize: " + (error as Error).message },
      { status: 500 }
    );
  }
}
