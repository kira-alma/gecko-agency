import { NextRequest, NextResponse } from "next/server";
import { scrapePage } from "@/lib/scraper";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json();

    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    // Validate URL
    try {
      new URL(url);
    } catch {
      return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
    }

    const result = await scrapePage(url);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Scrape error:", error);
    return NextResponse.json(
      { error: "Failed to scrape page: " + (error as Error).message },
      { status: 500 }
    );
  }
}
