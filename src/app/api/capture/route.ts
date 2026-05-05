import { NextRequest, NextResponse } from "next/server";

// Store captured pages temporarily in memory (keyed by a random token)
const capturedPages = new Map<string, { html: string; url: string; title: string; timestamp: number }>();

// Clean up old captures (older than 10 minutes)
function cleanup() {
  const now = Date.now();
  for (const [key, value] of capturedPages) {
    if (now - value.timestamp > 10 * 60 * 1000) {
      capturedPages.delete(key);
    }
  }
}

// POST — receive captured HTML from the bookmarklet
export async function POST(request: NextRequest) {
  try {
    const { html, url, title } = await request.json();
    if (!html) {
      return NextResponse.json({ error: "No HTML provided" }, { status: 400 });
    }

    cleanup();

    const token = crypto.randomUUID();
    capturedPages.set(token, { html, url, title, timestamp: Date.now() });

    return NextResponse.json({ ok: true, token });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to capture: " + (error as Error).message },
      { status: 500 }
    );
  }
}

// GET — retrieve captured HTML by token
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.json({ error: "Token required" }, { status: 400 });
  }

  const captured = capturedPages.get(token);
  if (!captured) {
    return NextResponse.json({ error: "Capture not found or expired" }, { status: 404 });
  }

  // Delete after retrieval (one-time use)
  capturedPages.delete(token);

  return NextResponse.json({
    html: captured.html,
    url: captured.url,
    title: captured.title,
  });
}
