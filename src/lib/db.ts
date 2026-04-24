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

      CREATE TABLE IF NOT EXISTS generic_instructions_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        custom_instructions TEXT NOT NULL DEFAULT '',
        change_note TEXT NOT NULL DEFAULT '',
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS page_instructions_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        page_url TEXT NOT NULL,
        custom_instructions TEXT NOT NULL DEFAULT '',
        change_note TEXT NOT NULL DEFAULT '',
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_page_instructions_url ON page_instructions_history(page_url);

      CREATE TABLE IF NOT EXISTS runs (
        id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL DEFAULT '',
        page_url TEXT NOT NULL,
        page_title TEXT NOT NULL DEFAULT '',
        model TEXT NOT NULL DEFAULT '',
        brand_guidelines TEXT NOT NULL DEFAULT '',
        customer_queries TEXT NOT NULL DEFAULT '',
        llm_links TEXT NOT NULL DEFAULT '',
        llm_sources TEXT NOT NULL DEFAULT '',
        llm_answers TEXT NOT NULL DEFAULT '',
        llm_chain_of_thought TEXT NOT NULL DEFAULT '',
        action_items TEXT NOT NULL DEFAULT '',
        gecko_insights TEXT NOT NULL DEFAULT '',
        project_description TEXT NOT NULL DEFAULT '',
        design_reference_url TEXT NOT NULL DEFAULT '',
        system_prompt TEXT NOT NULL DEFAULT '',
        user_prompt TEXT NOT NULL DEFAULT '',
        generic_prompt TEXT NOT NULL DEFAULT '',
        page_specific_prompt TEXT NOT NULL DEFAULT '',
        changes_json TEXT NOT NULL DEFAULT '[]',
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_runs_created ON runs(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_runs_page_url ON runs(page_url);

      CREATE TABLE IF NOT EXISTS run_html (
        run_id TEXT PRIMARY KEY REFERENCES runs(id) ON DELETE CASCADE,
        original_html TEXT NOT NULL,
        modified_html TEXT NOT NULL
      );
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

    // Add new columns to runs table if they don't exist
    try { db.prepare("ALTER TABLE runs ADD COLUMN display_name TEXT NOT NULL DEFAULT ''").run(); } catch { /* already exists */ }
    try { db.prepare("ALTER TABLE runs ADD COLUMN project_description TEXT NOT NULL DEFAULT ''").run(); } catch { /* already exists */ }
    try { db.prepare("ALTER TABLE runs ADD COLUMN design_reference_url TEXT NOT NULL DEFAULT ''").run(); } catch { /* already exists */ }
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

// --- Generic Instructions (versioned) ---

export function getGenericInstructions(): string | null {
  const row = getDb()
    .prepare("SELECT custom_instructions FROM generic_instructions_history ORDER BY id DESC LIMIT 1")
    .get() as { custom_instructions: string } | undefined;
  return row?.custom_instructions || null;
}

export function setGenericInstructions(customInstructions: string, changeNote: string = ""): void {
  const current = getGenericInstructions();
  if (current === customInstructions) return;
  getDb()
    .prepare("INSERT INTO generic_instructions_history (custom_instructions, change_note) VALUES (?, ?)")
    .run(customInstructions, changeNote);
}

// --- Runs (full session persistence) ---

export interface RunSummary {
  id: string;
  display_name: string;
  page_url: string;
  page_title: string;
  model: string;
  created_at: string;
  change_count: number;
}

export interface RunInput {
  id: string;
  displayName?: string;
  pageUrl: string;
  pageTitle: string;
  model: string;
  brandGuidelines: string;
  customerQueries: string;
  llmLinks: string;
  llmSources: string;
  llmAnswers: string;
  llmChainOfThought: string;
  actionItems: string;
  geckoInsights: string;
  projectDescription?: string;
  designReferenceUrl?: string;
  systemPrompt: string;
  userPrompt: string;
  genericPrompt: string;
  pageSpecificPrompt: string;
  changesJson: string;
  originalHtml: string;
  modifiedHtml: string;
}

export function saveRun(run: RunInput): void {
  const db = getDb();
  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO runs (id, display_name, page_url, page_title, model, brand_guidelines, customer_queries,
        llm_links, llm_sources, llm_answers, llm_chain_of_thought, action_items,
        gecko_insights, project_description, design_reference_url, system_prompt, user_prompt, generic_prompt, page_specific_prompt, changes_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      run.id, run.displayName || "", run.pageUrl, run.pageTitle, run.model, run.brandGuidelines,
      run.customerQueries, run.llmLinks, run.llmSources, run.llmAnswers,
      run.llmChainOfThought, run.actionItems, run.geckoInsights,
      run.projectDescription || "", run.designReferenceUrl || "",
      run.systemPrompt, run.userPrompt, run.genericPrompt, run.pageSpecificPrompt,
      run.changesJson
    );
    db.prepare(`
      INSERT INTO run_html (run_id, original_html, modified_html) VALUES (?, ?, ?)
    `).run(run.id, run.originalHtml, run.modifiedHtml);
  });
  tx();
}

export function listRuns(): RunSummary[] {
  return getDb().prepare(`
    SELECT id, display_name, page_url, page_title, model, created_at,
      json_array_length(changes_json) as change_count
    FROM runs ORDER BY created_at DESC LIMIT 50
  `).all() as RunSummary[];
}

export function renameRun(id: string, displayName: string): void {
  getDb().prepare("UPDATE runs SET display_name = ? WHERE id = ?").run(displayName, id);
}

export function getRun(id: string): (RunInput & { created_at: string }) | null {
  const row = getDb().prepare(`
    SELECT r.*, h.original_html, h.modified_html
    FROM runs r JOIN run_html h ON h.run_id = r.id
    WHERE r.id = ?
  `).get(id) as Record<string, string> | undefined;
  if (!row) return null;
  return {
    id: row.id,
    pageUrl: row.page_url,
    pageTitle: row.page_title,
    model: row.model,
    brandGuidelines: row.brand_guidelines,
    customerQueries: row.customer_queries,
    llmLinks: row.llm_links,
    llmSources: row.llm_sources,
    llmAnswers: row.llm_answers,
    llmChainOfThought: row.llm_chain_of_thought,
    actionItems: row.action_items,
    geckoInsights: row.gecko_insights,
    projectDescription: row.project_description || "",
    designReferenceUrl: row.design_reference_url || "",
    systemPrompt: row.system_prompt,
    userPrompt: row.user_prompt,
    genericPrompt: row.generic_prompt,
    pageSpecificPrompt: row.page_specific_prompt,
    changesJson: row.changes_json,
    originalHtml: row.original_html,
    modifiedHtml: row.modified_html,
    created_at: row.created_at,
  };
}

export function deleteRun(id: string): void {
  const db = getDb();
  const tx = db.transaction(() => {
    db.prepare("DELETE FROM run_html WHERE run_id = ?").run(id);
    db.prepare("DELETE FROM runs WHERE id = ?").run(id);
  });
  tx();
}
