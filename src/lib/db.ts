import Database from "better-sqlite3";
import path from "path";

const DB_PATH = path.join(process.cwd(), "data", "geckocheck.db");

let db: Database.Database | null = null;

export interface PromptVersion {
  id: number;
  content: string;
  change_note: string;
  created_at: string;
}

function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");

    // Versioned history tables — never delete, always append
    db.exec(`
      CREATE TABLE IF NOT EXISTS generic_prompt_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        content TEXT NOT NULL,
        change_note TEXT NOT NULL DEFAULT '',
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS page_prompt_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        page_url TEXT NOT NULL,
        content TEXT NOT NULL,
        change_note TEXT NOT NULL DEFAULT '',
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_page_prompt_url ON page_prompt_history(page_url);

      CREATE TABLE IF NOT EXISTS page_instructions_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        page_url TEXT NOT NULL,
        custom_instructions TEXT NOT NULL DEFAULT '',
        change_note TEXT NOT NULL DEFAULT '',
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_page_instructions_url ON page_instructions_history(page_url);
    `);

    // Migrate data from old tables if they exist
    try {
      const oldGeneric = db.prepare("SELECT content FROM generic_prompt WHERE id = 1").get() as { content: string } | undefined;
      if (oldGeneric?.content) {
        const exists = db.prepare("SELECT id FROM generic_prompt_history LIMIT 1").get();
        if (!exists) {
          db.prepare("INSERT INTO generic_prompt_history (content, change_note) VALUES (?, 'migrated from v1')").run(oldGeneric.content);
        }
      }
    } catch { /* old table doesn't exist, that's fine */ }

    try {
      const oldPages = db.prepare("SELECT page_url, content FROM page_prompts").all() as { page_url: string; content: string }[];
      for (const row of oldPages) {
        const exists = db.prepare("SELECT id FROM page_prompt_history WHERE page_url = ? LIMIT 1").get(row.page_url);
        if (!exists) {
          db.prepare("INSERT INTO page_prompt_history (page_url, content, change_note) VALUES (?, ?, 'migrated from v1')").run(row.page_url, row.content);
        }
      }
    } catch { /* old table doesn't exist */ }

    try {
      const oldFeedback = db.prepare("SELECT page_url, custom_instructions FROM page_feedback WHERE custom_instructions != ''").all() as { page_url: string; custom_instructions: string }[];
      for (const row of oldFeedback) {
        const exists = db.prepare("SELECT id FROM page_instructions_history WHERE page_url = ? LIMIT 1").get(row.page_url);
        if (!exists) {
          db.prepare("INSERT INTO page_instructions_history (page_url, custom_instructions, change_note) VALUES (?, ?, 'migrated from v1')").run(row.page_url, row.custom_instructions);
        }
      }
    } catch { /* old table doesn't exist */ }
  }
  return db;
}

// --- Generic Prompt (versioned) ---

export function getGenericPrompt(): string | null {
  const row = getDb()
    .prepare("SELECT content FROM generic_prompt_history ORDER BY id DESC LIMIT 1")
    .get() as { content: string } | undefined;
  return row?.content || null;
}

export function getGenericPromptHistory(): PromptVersion[] {
  return getDb()
    .prepare("SELECT id, content, change_note, created_at FROM generic_prompt_history ORDER BY id DESC")
    .all() as PromptVersion[];
}

export function setGenericPrompt(content: string, changeNote: string = ""): void {
  // Only insert if different from current
  const current = getGenericPrompt();
  if (current === content) return;
  getDb()
    .prepare("INSERT INTO generic_prompt_history (content, change_note) VALUES (?, ?)")
    .run(content, changeNote);
}

export function revertGenericPrompt(versionId: number): string | null {
  const row = getDb()
    .prepare("SELECT content FROM generic_prompt_history WHERE id = ?")
    .get(versionId) as { content: string } | undefined;
  if (row) {
    getDb()
      .prepare("INSERT INTO generic_prompt_history (content, change_note) VALUES (?, ?)")
      .run(row.content, `reverted to version #${versionId}`);
    return row.content;
  }
  return null;
}

// --- Page-Specific Prompt (versioned) ---

export function getPagePrompt(pageUrl: string): string | null {
  const row = getDb()
    .prepare("SELECT content FROM page_prompt_history WHERE page_url = ? ORDER BY id DESC LIMIT 1")
    .get(pageUrl) as { content: string } | undefined;
  return row?.content || null;
}

export function getPagePromptHistory(pageUrl: string): PromptVersion[] {
  return getDb()
    .prepare("SELECT id, content, change_note, created_at FROM page_prompt_history WHERE page_url = ? ORDER BY id DESC")
    .all(pageUrl) as PromptVersion[];
}

export function setPagePrompt(pageUrl: string, content: string, changeNote: string = ""): void {
  const current = getPagePrompt(pageUrl);
  if (current === content) return;
  getDb()
    .prepare("INSERT INTO page_prompt_history (page_url, content, change_note) VALUES (?, ?, ?)")
    .run(pageUrl, content, changeNote);
}

export function revertPagePrompt(pageUrl: string, versionId: number): string | null {
  const row = getDb()
    .prepare("SELECT content FROM page_prompt_history WHERE id = ? AND page_url = ?")
    .get(versionId, pageUrl) as { content: string } | undefined;
  if (row) {
    getDb()
      .prepare("INSERT INTO page_prompt_history (page_url, content, change_note) VALUES (?, ?, ?)")
      .run(pageUrl, row.content, `reverted to version #${versionId}`);
    return row.content;
  }
  return null;
}

// --- Page Instructions / Feedback (versioned, no chat storage) ---

export function getPageInstructions(pageUrl: string): string | null {
  const row = getDb()
    .prepare("SELECT custom_instructions FROM page_instructions_history WHERE page_url = ? ORDER BY id DESC LIMIT 1")
    .get(pageUrl) as { custom_instructions: string } | undefined;
  return row?.custom_instructions || null;
}

export function getPageInstructionsHistory(pageUrl: string): PromptVersion[] {
  return getDb()
    .prepare("SELECT id, custom_instructions as content, change_note, created_at FROM page_instructions_history WHERE page_url = ? ORDER BY id DESC")
    .all(pageUrl) as PromptVersion[];
}

export function setPageInstructions(pageUrl: string, customInstructions: string, changeNote: string = ""): void {
  const current = getPageInstructions(pageUrl);
  if (current === customInstructions) return;
  getDb()
    .prepare("INSERT INTO page_instructions_history (page_url, custom_instructions, change_note) VALUES (?, ?, ?)")
    .run(pageUrl, customInstructions, changeNote);
}

export function revertPageInstructions(pageUrl: string, versionId: number): string | null {
  const row = getDb()
    .prepare("SELECT custom_instructions FROM page_instructions_history WHERE id = ? AND page_url = ?")
    .get(versionId, pageUrl) as { custom_instructions: string } | undefined;
  if (row) {
    getDb()
      .prepare("INSERT INTO page_instructions_history (page_url, custom_instructions, change_note) VALUES (?, ?, ?)")
      .run(pageUrl, row.custom_instructions, `reverted to version #${versionId}`);
    return row.custom_instructions;
  }
  return null;
}
