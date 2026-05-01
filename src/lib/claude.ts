import { trimHtmlForLlm } from "./html-utils";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

export interface Change {
  id: string;
  selector: string;
  originalText: string;
  originalSnippet: string;
  modifiedSnippet: string;
  description: string;
  reasoning: string;
  sourceInsight: string;
  brandAlignment: string;
  category: "content" | "seo" | "structure" | "branding";
}

export interface GenerationResult {
  modifiedHtml: string;
  changes: Change[];
  failedChanges: Change[];
  systemPrompt: string;
  userPrompt: string;
  genericPrompt: string;
  pageSpecificPrompt: string;
}

// The generic system prompt — same for every page, handles both optimize and create modes
export const GENERIC_SYSTEM_PROMPT = `You are GeckoCheck's page optimization engine. You work in two modes:

MODE 1 — OPTIMIZE: You receive an existing retailer page's HTML and modify it based on insights.
MODE 2 — CREATE: You receive a project description and create a brand new HTML page from scratch.

The user prompt will specify which mode to use.

CONTEXT ON THE INSIGHTS YOU RECEIVE:
- "Customer Queries": Real questions users are asking AI assistants (e.g. "cheapest SodaStream CO2 refill"). These reveal what information the page MUST contain to be surfaced by AI search.
- "LLM Links Given to User": The links AI assistants actually included in their answers. If this page is NOT among them, the changes must make it more likely to be included. If competitors ARE listed, the page must match or beat the information they provide.
- "Sources the LLM Looked At": Pages the AI crawled. This shows what the AI considers authoritative. The changes should make this page at least as comprehensive.
- "LLM Answers Given to User": The actual answers AI gave to customers. These reveal what SPECIFIC data points (prices, comparisons, compatibility info, pros/cons) customers receive. The page should contain all these data points so the AI can source them from THIS page.
- "LLM Chain of Thought": The internal search queries the AI issued. These reveal the EXACT keywords and phrases the AI uses to find information. The page content should naturally include these terms.
- "GeckoCheck Action Items": Specific changes that GeckoCheck's analysis recommends. Execute ALL of these.

RULES:
1. Every change/section MUST be deeply connected to specific insights. In your reasoning, QUOTE the specific customer query, LLM answer excerpt, competitor link, or chain-of-thought search term that drives the change.
2. BRAND GUIDELINES COMPLIANCE IS MANDATORY. Every piece of copy must:
   - Use the brand's exact terminology (e.g. "sparkling water makers" not "soda machines", "CO2 cylinders" not "gas tanks")
   - Match the brand's tone (e.g. if guidelines say "clean, modern, upbeat, simple" — no fear-based or aggressive language)
   - Follow the brand's capitalization rules exactly (e.g. "SodaStream" not "Sodastream" or "SODASTREAM")
   - NOT make claims the brand hasn't published
   - Use the brand's preferred framing
3. For "reasoning": Write 3-5 sentences explaining: (a) which insight triggered this, (b) what gap it fills, (c) how it aligns with brand guidelines.
4. For "sourceInsight": Quote the EXACT text from the insights that triggered this change.
5. For "brandAlignment": Explain which brand guideline rule was followed.

=== OPTIMIZE MODE OUTPUT FORMAT ===
When optimizing an existing page, respond with a JSON array of changes:
[
  {
    "id": "change-1",
    "selector": "description of where in the page this element is",
    "originalText": "the exact visible TEXT content to find (NOT HTML tags — just the text a user would see on the page)",
    "originalSnippet": "the HTML snippet containing that text (best effort — include the innermost tag wrapping it)",
    "modifiedSnippet": "the new HTML to replace it with",
    "description": "Short description of what was changed",
    "reasoning": "3-5 sentence explanation",
    "sourceInsight": "Direct quote from insights",
    "brandAlignment": "Which brand guideline rule was followed",
    "category": "content|seo|structure|branding"
  }
]
IMPORTANT MATCHING RULES:
- "originalText" is the PRIMARY matching key. It must be the exact visible text as seen on the page (no HTML tags). This is what we search for.
- "originalSnippet" is a SECONDARY matching key. It should be the HTML containing that text, but it does not need to be a perfect match since the HTML may have extra attributes.
- For meta tags, titles, or structured data: use the content attribute value as originalText (e.g., for <meta name="description" content="xyz">, originalText should be "xyz").
- For new sections being ADDED (not replacing existing content): set originalText to "" and originalSnippet to the HTML location marker (e.g., "</body>" or the last element before insertion).

=== CREATE MODE OUTPUT FORMAT ===
When creating a new page, respond with JSON:
{
  "html": "complete HTML page (<!DOCTYPE html>...</html>) with inline CSS, responsive design, structured data",
  "title": "page title",
  "changes": [
    {
      "id": "section-1",
      "selector": "description of the section",
      "originalSnippet": "",
      "modifiedSnippet": "brief description of section content",
      "description": "What this section does",
      "reasoning": "Why this section was created — reference specific insights",
      "sourceInsight": "The insight that drove this section",
      "brandAlignment": "How it aligns with brand guidelines",
      "category": "content|seo|structure|branding"
    }
  ]
}
For create mode: build a complete, modern, responsive HTML page with inline <style>. Include FAQ sections from customer queries, comparison tables where relevant, JSON-LD structured data, and clear CTAs.`;

/** Build the page-specific portion of the prompt */
export function buildPageSpecificPrompt(
  pageUrl: string,
  brandGuidelines: string,
  customInstructions?: string
): string {
  let prompt = "";

  if (brandGuidelines) {
    prompt += `\n=== BRAND GUIDELINES FOR THIS PAGE ===\n${brandGuidelines}\n`;
  }

  if (customInstructions) {
    prompt += `\n=== REVIEWER INSTRUCTIONS (HIGHEST PRIORITY) ===\nThe following instructions come from the sales team reviewer. These OVERRIDE any conflicting default behavior. Follow them precisely:\n${customInstructions}\n`;
  }

  prompt += `\nTarget page: ${pageUrl}`;

  return prompt;
}

export async function callOpenRouter(
  systemPrompt: string,
  userPrompt: string,
  model: string = "anthropic/claude-sonnet-4.6"
): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not set");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120000); // 2 min timeout

  const response = await fetch(OPENROUTER_API_URL, {
    method: "POST",
    signal: controller.signal,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://geckocheck.com",
      "X-Title": "GeckoCheck Page Optimizer",
    },
    body: JSON.stringify({
      model,
      max_tokens: 32000,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
  });

  clearTimeout(timeout);

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`OpenRouter API error: ${response.status} ${errorBody}`);
  }

  const data = await response.json();

  if (!data.choices || !data.choices[0]) {
    throw new Error("No response from model. Full response: " + JSON.stringify(data).slice(0, 500));
  }

  const choice = data.choices[0];
  const message = choice.message;

  // Handle provider errors embedded in the choice
  if (choice.error) {
    throw new Error(`Provider error: ${choice.error.message || JSON.stringify(choice.error)}`);
  }

  // Models put content in different fields:
  // - Standard models: message.content
  // - Reasoning models (o1/o3/GPT-5): message.reasoning (the thinking) + message.content (final answer)
  // - Some reasoning models only have message.reasoning
  const content = message.content || message.reasoning || message.reasoning_content || "";

  if (!content) {
    throw new Error("Empty response from model. Full response: " + JSON.stringify(data).slice(0, 500));
  }

  return content;
}

export async function generateModifiedPage(
  originalHtml: string,
  pageUrl: string,
  brandGuidelines: string,
  geckoInsights: string,
  model: string = "anthropic/claude-sonnet-4.6",
  customInstructions?: string,
  customGenericPrompt?: string,
  customPagePrompt?: string
): Promise<GenerationResult> {
  const trimmedHtml = trimHtmlForLlm(originalHtml);

  console.log(`HTML trimmed: ${originalHtml.length} → ${trimmedHtml.length} chars (${Math.round((1 - trimmedHtml.length / originalHtml.length) * 100)}% reduction)`);

  const genericPrompt = customGenericPrompt || GENERIC_SYSTEM_PROMPT;
  const pageSpecificPrompt = customPagePrompt || buildPageSpecificPrompt(pageUrl, brandGuidelines, customInstructions);
  const analysisPrompt = genericPrompt + "\n" + pageSpecificPrompt;

  const userPrompt = `MODE: OPTIMIZE — Modify the existing page HTML.

URL: ${pageUrl}

=== PAGE HTML ===
${trimmedHtml}

=== BRAND GUIDELINES ===
${brandGuidelines}

=== GECKOCHECK INSIGHTS ===
${geckoInsights}

Execute ALL the GeckoCheck action items. Respond with the OPTIMIZE MODE JSON format (array of changes). For each change, provide detailed reasoning that directly references the specific insights.`;

  const text = await callOpenRouter(analysisPrompt, userPrompt, model);

  console.log("Model response length:", text.length);
  console.log("Model response preview:", text.slice(0, 300));

  // Extract JSON from the response
  let jsonStr = text;
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1].trim();
  }

  let changes: Change[];
  try {
    changes = JSON.parse(jsonStr);
  } catch {
    // Try to find array in the text
    const arrayMatch = text.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      try {
        changes = JSON.parse(arrayMatch[0]);
      } catch {
        // JSON may be truncated — try to repair by closing open objects/arrays
        let repaired = arrayMatch[0];
        // Count open braces and brackets
        const openBraces = (repaired.match(/{/g) || []).length - (repaired.match(/}/g) || []).length;
        const openBrackets = (repaired.match(/\[/g) || []).length - (repaired.match(/]/g) || []).length;
        // Try to find the last complete object and close the array
        const lastCompleteObj = repaired.lastIndexOf("}");
        if (lastCompleteObj > 0) {
          repaired = repaired.slice(0, lastCompleteObj + 1) + "]";
          try {
            changes = JSON.parse(repaired);
            console.warn(`Repaired truncated JSON: recovered ${changes.length} changes`);
          } catch {
            throw new Error(
              `Failed to parse or repair JSON (${openBraces} unclosed braces, ${openBrackets} unclosed brackets). Response ends: ...${text.slice(-300)}`
            );
          }
        } else {
          throw new Error(
            "Failed to parse changes. Response: " + text.slice(0, 500)
          );
        }
      }
    } else {
      throw new Error(
        "Failed to parse changes — no JSON array found. Response: " + text.slice(0, 500)
      );
    }
  }

  // Apply changes to the original HTML using find-and-replace
  let modifiedHtml = originalHtml;
  const appliedChanges: Change[] = [];
  const failedChanges: Change[] = [];

  function tagModified(modified: string, changeId: string): string {
    const tagMatch = modified.match(/^<(\w+)/);
    if (tagMatch) {
      return modified.replace(/^<(\w+)/, `<$1 data-gecko-change="${changeId}"`);
    }
    return `<span data-gecko-change="${changeId}">${modified}</span>`;
  }

  /** Find the enclosing HTML element around a text match position */
  function findEnclosingElement(html: string, textIdx: number, textLen: number): { start: number; end: number } | null {
    // Walk backwards to find the opening tag
    let depth = 0;
    let start = textIdx;
    while (start > 0) {
      start--;
      if (html[start] === ">" && start < textIdx) {
        // Check if this is a closing tag
        let tagStart = start;
        while (tagStart > 0 && html[tagStart] !== "<") tagStart--;
        const tag = html.slice(tagStart, start + 1);
        if (tag.startsWith("</")) {
          depth++;
        } else if (!tag.startsWith("<!") && !tag.endsWith("/>")) {
          if (depth === 0) {
            start = tagStart;
            break;
          }
          depth--;
        }
      }
    }

    // Walk forwards to find the matching closing tag
    let end = textIdx + textLen;
    const openTag = html.slice(start).match(/^<(\w+)/);
    if (openTag) {
      const tagName = openTag[1];
      let innerDepth = 1;
      let pos = start + openTag[0].length;
      const closeTag = `</${tagName}>`;
      const openPattern = new RegExp(`<${tagName}[\\s>]`);
      while (pos < html.length && innerDepth > 0) {
        if (html.slice(pos).startsWith(closeTag)) {
          innerDepth--;
          if (innerDepth === 0) {
            end = pos + closeTag.length;
            break;
          }
          pos += closeTag.length;
        } else if (openPattern.test(html.slice(pos, pos + tagName.length + 2))) {
          innerDepth++;
          pos++;
        } else {
          pos++;
        }
      }
    }

    if (start >= 0 && end > start) {
      return { start, end };
    }
    return null;
  }

  for (const change of changes) {
    if (!change || !change.modifiedSnippet) {
      console.warn("Skipping invalid change:", JSON.stringify(change)?.slice(0, 200));
      continue;
    }

    const original = change.originalSnippet || "";
    const originalText = change.originalText || "";
    let matched = false;

    // Strategy 1: Exact HTML snippet match
    if (original && modifiedHtml.includes(original)) {
      modifiedHtml = modifiedHtml.replace(original, tagModified(change.modifiedSnippet, change.id));
      matched = true;
    }

    // Strategy 2: Text-based match (primary — uses originalText field)
    if (!matched && originalText && originalText.length > 5) {
      // Try exact text match
      const textIdx = modifiedHtml.indexOf(originalText);
      if (textIdx !== -1) {
        const elem = findEnclosingElement(modifiedHtml, textIdx, originalText.length);
        if (elem) {
          const fullMatch = modifiedHtml.slice(elem.start, elem.end);
          modifiedHtml = modifiedHtml.replace(fullMatch, tagModified(change.modifiedSnippet, change.id));
          matched = true;
        }
      }

      // Try whitespace-normalized text match
      if (!matched) {
        const normalizedText = originalText.replace(/\s+/g, " ").trim();
        // Search through HTML stripping tags for text matching
        const htmlText = modifiedHtml.replace(/<[^>]+>/g, "\x00").replace(/\s+/g, " ");
        const normIdx = htmlText.indexOf(normalizedText);
        if (normIdx !== -1) {
          // Map back to original HTML position
          let origPos = 0, strippedPos = 0;
          while (strippedPos < normIdx && origPos < modifiedHtml.length) {
            if (modifiedHtml[origPos] === "<") {
              while (origPos < modifiedHtml.length && modifiedHtml[origPos] !== ">") origPos++;
              origPos++;
              strippedPos++; // for the \x00
            } else {
              origPos++;
              strippedPos++;
            }
          }
          const elem = findEnclosingElement(modifiedHtml, origPos, 1);
          if (elem) {
            const fullMatch = modifiedHtml.slice(elem.start, elem.end);
            modifiedHtml = modifiedHtml.replace(fullMatch, tagModified(change.modifiedSnippet, change.id));
            matched = true;
          }
        }
      }
    }

    // Strategy 3: Whitespace-normalized HTML snippet match
    if (!matched && original) {
      try {
        const normalizedEscaped = original
          .replace(/\s+/g, " ").trim()
          .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
          .replace(/ /g, "\\s+");
        const regex = new RegExp(normalizedEscaped);
        const match = modifiedHtml.match(regex);
        if (match) {
          modifiedHtml = modifiedHtml.replace(match[0], tagModified(change.modifiedSnippet, change.id));
          matched = true;
        }
      } catch { /* regex too complex */ }
    }

    // Strategy 4: Strip attributes from snippet, match tag structure + text
    if (!matched && original) {
      try {
        const textContent = original.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
        if (textContent.length > 15 && modifiedHtml.includes(textContent)) {
          const idx = modifiedHtml.indexOf(textContent);
          const elem = findEnclosingElement(modifiedHtml, idx, textContent.length);
          if (elem) {
            const fullMatch = modifiedHtml.slice(elem.start, elem.end);
            modifiedHtml = modifiedHtml.replace(fullMatch, tagModified(change.modifiedSnippet, change.id));
            matched = true;
          }
        }
      } catch { /* ignore */ }
    }

    // Strategy 5: For meta/title changes, match by attribute
    if (!matched && original) {
      try {
        if (original.includes('name="description"') || original.includes('name="title"')) {
          const metaRegex = /<meta[^>]*name=["'](?:description|title)["'][^>]*>/i;
          const match = modifiedHtml.match(metaRegex);
          if (match) {
            modifiedHtml = modifiedHtml.replace(match[0], tagModified(change.modifiedSnippet, change.id));
            matched = true;
          }
        } else if (original.includes("<title")) {
          const titleRegex = /<title[^>]*>[\s\S]*?<\/title>/i;
          const match = modifiedHtml.match(titleRegex);
          if (match) {
            modifiedHtml = modifiedHtml.replace(match[0], tagModified(change.modifiedSnippet, change.id));
            matched = true;
          }
        } else if (original.includes('property="og:')) {
          const propMatch = original.match(/property=["']([^"']+)["']/);
          if (propMatch) {
            const ogRegex = new RegExp(`<meta[^>]*property=["']${propMatch[1].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'][^>]*>`, "i");
            const match = modifiedHtml.match(ogRegex);
            if (match) {
              modifiedHtml = modifiedHtml.replace(match[0], tagModified(change.modifiedSnippet, change.id));
              matched = true;
            }
          }
        }
      } catch { /* ignore */ }
    }

    // Strategy 6: For insertions (empty originalText), insert before </body>
    if (!matched && !originalText && !original) {
      const insertPoint = modifiedHtml.lastIndexOf("</body>");
      if (insertPoint !== -1) {
        modifiedHtml = modifiedHtml.slice(0, insertPoint) + tagModified(change.modifiedSnippet, change.id) + "\n" + modifiedHtml.slice(insertPoint);
        matched = true;
      }
    }

    if (matched) {
      appliedChanges.push(change);
    } else {
      console.warn(`[${change.id}] No match found for: text="${(originalText || "").slice(0, 50)}" snippet="${original.slice(0, 50)}..."`);
      failedChanges.push(change);
    }
  }

  console.log(`Applied ${appliedChanges.length}/${changes.length} changes`);

  return {
    modifiedHtml,
    changes: appliedChanges,
    failedChanges,
    systemPrompt: analysisPrompt,
    userPrompt,
    genericPrompt,
    pageSpecificPrompt,
  };
}
