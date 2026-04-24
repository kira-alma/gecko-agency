import { NextRequest, NextResponse } from "next/server";
import { listRuns, getRun, saveRun, deleteRun, renameRun } from "@/lib/db";

export const maxDuration = 30;

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");

  if (id) {
    const run = getRun(id);
    if (!run) return NextResponse.json({ error: "Run not found" }, { status: 404 });
    return NextResponse.json(run);
  }

  return NextResponse.json({ runs: listRuns() });
}

export async function PATCH(request: NextRequest) {
  try {
    const { id, displayName } = await request.json();
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    renameRun(id, displayName || "");
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: "Failed to rename: " + (error as Error).message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    saveRun(body);
    return NextResponse.json({ ok: true, id: body.id });
  } catch (error) {
    console.error("Save run error:", error);
    return NextResponse.json(
      { error: "Failed to save: " + (error as Error).message },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { id } = await request.json();
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    deleteRun(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Delete run error:", error);
    return NextResponse.json(
      { error: "Failed to delete: " + (error as Error).message },
      { status: 500 }
    );
  }
}
