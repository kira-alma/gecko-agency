import { NextRequest, NextResponse } from "next/server";
import { callOpenRouter, GENERIC_SYSTEM_PROMPT, buildPageSpecificPrompt } from "@/lib/claude";
import type { Change } from "@/lib/claude";

export const maxDuration = 120;

export async function POST(request: NextRequest) {
  try {
    const {
      projectDescription, brandGuidelines, geckoInsights,
      model, customInstructions, customGenericPrompt,
      designReferenceUrl, designReferenceHtml,
    } = await request.json();

    if (!projectDescription || !geckoInsights) {
      return NextResponse.json(
        { error: "Project description and insights are required" },
        { status: 400 }
      );
    }

    const genericPrompt = customGenericPrompt || GENERIC_SYSTEM_PROMPT;
    const pageSpecificPrompt = buildPageSpecificPrompt("", brandGuidelines, customInstructions);
    const systemPrompt = genericPrompt + "\n" + pageSpecificPrompt;

    // Build design reference section
    let designSection = "";
    if (designReferenceUrl) {
      designSection = `\n=== DESIGN REFERENCE ===
URL: ${designReferenceUrl}
The new page MUST closely match the visual design, layout, color scheme, typography, and styling of this reference page. Study the CSS, layout structure, spacing, and visual hierarchy from the reference HTML below and replicate it in the new page.
`;
      if (designReferenceHtml) {
        // Trim the reference HTML to reduce tokens — keep only style-related content
        const trimmedRef = designReferenceHtml
          .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
          .replace(/<!--[\s\S]*?-->/g, "")
          .replace(/\n\s*\n/g, "\n")
          .slice(0, 50000); // Cap at ~50k chars to leave room for the response
        designSection += `\n=== REFERENCE PAGE HTML (for design only — copy the styling, NOT the content) ===\n${trimmedRef}\n`;
      }
    }

    const userPrompt = `MODE: CREATE — Generate a brand new page from scratch.

=== PROJECT DESCRIPTION ===
${projectDescription}
${designSection}
=== BRAND GUIDELINES ===
${brandGuidelines}

=== GECKOCHECK INSIGHTS ===
${geckoInsights}

Create a complete, polished HTML page based on the project description.${designReferenceUrl ? " Match the visual design and styling of the reference URL as closely as possible." : ""} Apply all GeckoCheck action items. Make sure the page contains all the data points from the LLM answers so that AI assistants will source information from THIS page. Respond with the CREATE MODE JSON format (with "html", "title", and "changes" fields).`;

    const text = await callOpenRouter(systemPrompt, userPrompt, model || "openai/gpt-5");

    // Parse the response
    let jsonStr = text;
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) jsonStr = jsonMatch[1].trim();

    let result: { html: string; title: string; changes: Change[] };
    try {
      result = JSON.parse(jsonStr);
    } catch {
      const objMatch = text.match(/\{[\s\S]*"html"[\s\S]*\}/);
      if (objMatch) {
        try {
          result = JSON.parse(objMatch[0]);
        } catch {
          let repaired = objMatch[0];
          const lastBrace = repaired.lastIndexOf("}");
          repaired = repaired.slice(0, lastBrace + 1);
          result = JSON.parse(repaired);
        }
      } else {
        throw new Error("Failed to parse page creation response: " + text.slice(0, 300));
      }
    }

    return NextResponse.json({
      modifiedHtml: result.html,
      changes: result.changes || [],
      failedChanges: [],
      title: result.title || "New Page",
      systemPrompt,
      userPrompt,
      genericPrompt,
      pageSpecificPrompt,
    });
  } catch (error) {
    const msg = (error as Error).message || "Unknown error";
    console.error("Create page error:", msg);
    return NextResponse.json(
      { error: "Failed to create page: " + msg },
      { status: 500 }
    );
  }
}
