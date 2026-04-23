import { NextRequest, NextResponse } from "next/server";
import {
  getGenericPrompt, setGenericPrompt, getGenericPromptHistory, revertGenericPrompt,
  getPagePrompt, setPagePrompt, getPagePromptHistory, revertPagePrompt,
  getPageInstructions, setPageInstructions, getPageInstructionsHistory, revertPageInstructions,
} from "@/lib/db";

// GET /api/prompts?pageUrl=...&history=true
export async function GET(request: NextRequest) {
  const pageUrl = request.nextUrl.searchParams.get("pageUrl") || "";
  const showHistory = request.nextUrl.searchParams.get("history") === "true";

  if (showHistory) {
    return NextResponse.json({
      genericHistory: getGenericPromptHistory(),
      pagePromptHistory: pageUrl ? getPagePromptHistory(pageUrl) : [],
      instructionsHistory: pageUrl ? getPageInstructionsHistory(pageUrl) : [],
    });
  }

  return NextResponse.json({
    genericPrompt: getGenericPrompt(),
    pagePrompt: pageUrl ? getPagePrompt(pageUrl) : null,
    customInstructions: pageUrl ? getPageInstructions(pageUrl) : null,
    // No chat messages — those are session-only
  });
}

// POST /api/prompts
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { action, pageUrl, content, customInstructions, changeNote, versionId } = body;

  switch (action) {
    case "setGenericPrompt":
      setGenericPrompt(content || "", changeNote || "manual edit");
      return NextResponse.json({ ok: true });

    case "setPagePrompt":
      if (!pageUrl) return NextResponse.json({ error: "pageUrl required" }, { status: 400 });
      setPagePrompt(pageUrl, content || "", changeNote || "manual edit");
      return NextResponse.json({ ok: true });

    case "setInstructions":
      if (!pageUrl) return NextResponse.json({ error: "pageUrl required" }, { status: 400 });
      setPageInstructions(pageUrl, customInstructions || "", changeNote || "feedback update");
      return NextResponse.json({ ok: true });

    case "revertGenericPrompt":
      if (!versionId) return NextResponse.json({ error: "versionId required" }, { status: 400 });
      const revertedGeneric = revertGenericPrompt(versionId);
      return NextResponse.json({ ok: true, content: revertedGeneric });

    case "revertPagePrompt":
      if (!pageUrl || !versionId) return NextResponse.json({ error: "pageUrl and versionId required" }, { status: 400 });
      const revertedPage = revertPagePrompt(pageUrl, versionId);
      return NextResponse.json({ ok: true, content: revertedPage });

    case "revertInstructions":
      if (!pageUrl || !versionId) return NextResponse.json({ error: "pageUrl and versionId required" }, { status: 400 });
      const revertedInstructions = revertPageInstructions(pageUrl, versionId);
      return NextResponse.json({ ok: true, content: revertedInstructions });

    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
}
