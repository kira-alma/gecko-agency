import { NextRequest, NextResponse } from "next/server";
import { callOpenRouter } from "@/lib/claude";

export const maxDuration = 30;

export async function POST(request: NextRequest) {
  try {
    const { feedbackMessages, existingInstructions, model } = await request.json();

    if (!feedbackMessages || feedbackMessages.length === 0) {
      return NextResponse.json(
        { error: "Feedback messages are required" },
        { status: 400 }
      );
    }

    const systemPrompt = `You are a prompt engineering assistant for GeckoCheck, a tool that optimizes retailer product pages. You receive feedback from a sales team reviewer about AI-generated page changes. Your job is to convert their feedback into clear, concise instructions that will be added to the page generation prompt.

Rules:
1. Summarize feedback into actionable directives (e.g., "Shorten the FAQ section to 3 questions maximum" not "the user said the FAQ is too long")
2. If there are existing instructions, merge new feedback with them — do not duplicate. Update or override conflicting instructions.
3. Keep instructions concise — no more than 15 bullet points total
4. Preserve the reviewer's intent faithfully
5. Output ONLY the final list of instructions, one per line, each starting with a dash (-)
6. Do NOT include any preamble, explanation, or commentary — just the dash-prefixed list`;

    const conversationText = feedbackMessages
      .map((m: { role: string; content: string }) =>
        `${m.role === "user" ? "Reviewer" : "System"}: ${m.content}`
      )
      .join("\n");

    const userPrompt = `${
      existingInstructions
        ? `=== CURRENT INSTRUCTIONS ===\n${existingInstructions}\n\n`
        : ""
    }=== NEW FEEDBACK FROM REVIEWER ===
${conversationText}

Produce the updated list of instructions incorporating all feedback. Remember: output ONLY the dash-prefixed list, nothing else.`;

    const text = await callOpenRouter(
      systemPrompt,
      userPrompt,
      model || "openai/gpt-5"
    );

    // Clean up — ensure we only have the dash-prefixed lines
    const instructions = text
      .split("\n")
      .map((l: string) => l.trim())
      .filter((l: string) => l.startsWith("-"))
      .join("\n");

    return NextResponse.json({ instructions: instructions || text.trim() });
  } catch (error) {
    console.error("Summarize feedback error:", error);
    return NextResponse.json(
      { error: "Failed to summarize: " + (error as Error).message },
      { status: 500 }
    );
  }
}
