import { trimHtmlForLlm } from "./html-utils";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

export interface Change {
  id: string;
  selector: string;
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

// The generic system prompt — same for every page
export const GENERIC_SYSTEM_PROMPT = `You are GeckoCheck's page optimization engine. You receive a retailer product page along with rich data about how AI assistants (GPT, Gemini, etc.) answer customer questions about this product category. Your job is to modify the page so that AI assistants will find, understand, and recommend this page's products.

CONTEXT ON THE INSIGHTS YOU RECEIVE:
- "Customer Queries": Real questions users are asking AI assistants (e.g. "cheapest SodaStream CO2 refill"). These reveal what information the page MUST contain to be surfaced by AI search.
- "LLM Links Given to User": The links AI assistants actually included in their answers. If this page is NOT among them, the changes must make it more likely to be included. If competitors ARE listed, the page must match or beat the information they provide.
- "Sources the LLM Looked At": Pages the AI crawled. This shows what the AI considers authoritative. The changes should make this page at least as comprehensive.
- "LLM Answers Given to User": The actual answers AI gave to customers. These reveal what SPECIFIC data points (prices, comparisons, compatibility info, pros/cons) customers receive. The page should contain all these data points so the AI can source them from THIS page.
- "LLM Chain of Thought": The internal search queries the AI issued. These reveal the EXACT keywords and phrases the AI uses to find information. The page content should naturally include these terms.
- "GeckoCheck Action Items": Specific changes that GeckoCheck's analysis recommends. Execute ALL of these.

RULES:
1. Only modify content elements (text, headings, descriptions, bullet points, meta tags, structured data, adding new sections)
2. Every change MUST be deeply connected to specific insights. In your reasoning, QUOTE the specific customer query, LLM answer excerpt, competitor link, or chain-of-thought search term that drives the change.
3. BRAND GUIDELINES COMPLIANCE IS MANDATORY. Every piece of new or modified copy must:
   - Use the brand's exact terminology (e.g. "sparkling water makers" not "soda machines", "CO2 cylinders" not "gas tanks")
   - Match the brand's tone (e.g. if guidelines say "clean, modern, upbeat, simple" — no fear-based or aggressive language)
   - Follow the brand's capitalization rules exactly (e.g. "SodaStream" not "Sodastream" or "SODASTREAM")
   - NOT make claims the brand hasn't published (e.g. if guidelines say "avoid inventing environmental claims" — don't add new sustainability claims)
   - Use the brand's preferred framing (e.g. if they frame around "personalization" and "sustainability", weave those themes into new content)
4. Be precise about which elements to change — use enough surrounding context to identify them uniquely
5. For "reasoning": Write 3-5 sentences explaining:
   a) The INSIGHT that triggered this (quote the customer query, LLM answer, competitor URL, or chain-of-thought term)
   b) WHY this change addresses that insight (what gap it fills, what question it answers)
   c) HOW it aligns with brand guidelines (which specific brand rule or terminology was applied)
6. For "sourceInsight": Quote the EXACT text from the insights that triggered this change. For example: "Customer query: 'Where is the most cost-effective place to buy a gas cylinder'" or "LLM answer cited SimpliSoda at $13.99 but did not mention SodaStream's $16.99 exchange" or "Action item: Create a cost-first brief..."
7. For "brandAlignment": Explain which brand guideline rule was followed in crafting this change.

Respond with a JSON array of changes:
[
  {
    "id": "change-1",
    "selector": "description of where in the page this element is",
    "originalSnippet": "exact original text/HTML to find and replace",
    "modifiedSnippet": "the new text/HTML to replace it with",
    "description": "Short description of what was changed",
    "reasoning": "3-5 sentence explanation: (a) which insight triggered this, (b) what gap it fills, (c) how it aligns with brand guidelines",
    "sourceInsight": "Direct quote from the insights that triggered this change",
    "brandAlignment": "Which brand guideline rule was followed (e.g. 'Used SodaStream capitalization exactly; kept tone clean/modern/upbeat per guidelines; used approved term CO2 cylinders instead of gas tanks')",
    "category": "content|seo|structure|branding"
  }
]

IMPORTANT: originalSnippet must be an EXACT substring of the HTML so we can do find-and-replace. Include enough context to be unique. Do NOT include data-gecko-change attributes in originalSnippet.`;

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

  const userPrompt = `URL: ${pageUrl}

=== PAGE HTML ===
${trimmedHtml}

=== BRAND GUIDELINES ===
${brandGuidelines}

=== GECKOCHECK INSIGHTS ===
${geckoInsights}

Execute ALL the GeckoCheck action items. For each change, provide detailed reasoning that directly references the specific insights (customer queries, LLM answers, competitor data, chain-of-thought terms) that justify it. A reader of the report should understand exactly WHY each change was made and WHAT data from the insights drove it.`;

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

  for (const change of changes) {
    if (!change || !change.originalSnippet || !change.modifiedSnippet) {
      console.warn("Skipping invalid change:", JSON.stringify(change)?.slice(0, 200));
      continue;
    }
    const original = change.originalSnippet;

    // Strategy 1: Exact match
    if (modifiedHtml.includes(original)) {
      modifiedHtml = modifiedHtml.replace(original, tagModified(change.modifiedSnippet, change.id));
      appliedChanges.push(change);
      continue;
    }

    // Strategy 2: Match ignoring data-* and style attributes (LLM saw trimmed HTML)
    try {
      const escaped = original
        .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
        .replace(/\\s+/g, "\\s+");
      // Allow optional attributes between tag name and the rest
      const flexiblePattern = escaped.replace(
        /(<\w+)(\\s)/g,
        "$1(?:\\s+[\\w-]+=\"[^\"]*\")*$2"
      );
      const regex = new RegExp(flexiblePattern);
      const match = modifiedHtml.match(regex);
      if (match) {
        modifiedHtml = modifiedHtml.replace(match[0], tagModified(change.modifiedSnippet, change.id));
        appliedChanges.push(change);
        continue;
      }
    } catch { /* regex too complex, try next strategy */ }

    // Strategy 3: Whitespace-normalized match
    try {
      const normalizedEscaped = original
        .replace(/\s+/g, " ")
        .trim()
        .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
        .replace(/ /g, "\\s+");
      const regex = new RegExp(normalizedEscaped);
      const match = modifiedHtml.match(regex);
      if (match) {
        modifiedHtml = modifiedHtml.replace(match[0], tagModified(change.modifiedSnippet, change.id));
        appliedChanges.push(change);
        continue;
      }
    } catch { /* ignore */ }

    // Strategy 4: Try matching just the text content (strip tags from snippet, find in HTML)
    try {
      const textContent = original.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
      if (textContent.length > 20 && modifiedHtml.includes(textContent)) {
        // Find the full HTML element containing this text
        const idx = modifiedHtml.indexOf(textContent);
        // Look backwards for the opening tag
        let start = idx;
        while (start > 0 && modifiedHtml[start - 1] !== ">") start--;
        // Look forwards for closing tag after the text
        let end = idx + textContent.length;
        while (end < modifiedHtml.length && modifiedHtml[end] !== "<") end++;

        const fullMatch = modifiedHtml.slice(start, end);
        modifiedHtml = modifiedHtml.replace(fullMatch, tagModified(change.modifiedSnippet, change.id));
        appliedChanges.push(change);
        continue;
      }
    } catch { /* ignore */ }

    // Strategy 5: Strip ALL attributes from the snippet and try to match tag structure + text
    try {
      const stripAttrs = (s: string) => s.replace(/<(\w+)\s[^>]*>/g, "<$1>").replace(/\s+/g, " ").trim();
      const strippedOriginal = stripAttrs(original);
      if (strippedOriginal.length > 30) {
        // Build a regex that matches the same tags with any attributes
        const escaped = strippedOriginal
          .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
          .replace(/<(\w+)>/g, "<$1[^>]*>")
          .replace(/ /g, "\\s*");
        const regex = new RegExp(escaped);
        const match = modifiedHtml.match(regex);
        if (match) {
          modifiedHtml = modifiedHtml.replace(match[0], tagModified(change.modifiedSnippet, change.id));
          appliedChanges.push(change);
          continue;
        }
      }
    } catch { /* regex too complex */ }

    console.warn(`[${change.id}] No match found for: "${original.slice(0, 80)}..."`);
    // Track as failed change
    failedChanges.push(change);
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
