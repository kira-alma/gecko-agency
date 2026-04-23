import { NextResponse } from "next/server";

export async function GET() {
  try {
    const response = await fetch("https://openrouter.ai/api/v1/models", {
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      },
    });

    if (!response.ok) {
      throw new Error(`OpenRouter API error: ${response.status}`);
    }

    const data = await response.json();

    // Curated list of recent flagship models (last ~6 months)
    const curatedModels = new Set([
      // OpenAI GPT-5 family
      "openai/gpt-5.4",
      "openai/gpt-5.4-pro",
      "openai/gpt-5.4-mini",
      "openai/gpt-5.4-nano",
      "openai/gpt-5.3-chat",
      "openai/gpt-5.3-codex",
      "openai/gpt-5.2",
      "openai/gpt-5.2-pro",
      "openai/gpt-5.2-chat",
      "openai/gpt-5.1",
      "openai/gpt-5.1-chat",
      "openai/gpt-5",
      "openai/gpt-5-pro",
      "openai/gpt-5-chat",
      "openai/gpt-5-mini",
      "openai/gpt-5-nano",
      // OpenAI reasoning
      "openai/o4-mini",
      "openai/o4-mini-high",
      "openai/o3",
      "openai/o3-pro",
      "openai/o3-mini",
      // Anthropic Claude 4.x
      "anthropic/claude-opus-4.7",
      "anthropic/claude-opus-4.6",
      "anthropic/claude-opus-4.6-fast",
      "anthropic/claude-sonnet-4.6",
      "anthropic/claude-opus-4.5",
      "anthropic/claude-sonnet-4.5",
      "anthropic/claude-opus-4.1",
      "anthropic/claude-sonnet-4",
      "anthropic/claude-opus-4",
      // Google Gemini 2.5
      "google/gemini-2.5-pro",
      "google/gemini-2.5-flash",
      "google/gemini-2.5-flash-lite",
      // xAI
      "x-ai/grok-3-mini",
      // DeepSeek
      "deepseek/deepseek-r1",
      "deepseek/deepseek-chat",
      // Meta Llama 4
      "meta-llama/llama-4-maverick",
      "meta-llama/llama-4-scout",
    ]);

    const models = data.data
      .filter((m: { id: string }) => curatedModels.has(m.id))
      .map(
        (m: {
          id: string;
          name: string;
          pricing?: { prompt?: string; completion?: string };
          context_length?: number;
        }) => ({
          id: m.id,
          name: m.name,
          pricing: m.pricing,
          context_length: m.context_length,
        })
      )
      .sort((a: { name: string }, b: { name: string }) =>
        a.name.localeCompare(b.name)
      );

    return NextResponse.json({ models });
  } catch (error) {
    console.error("Models fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch models" },
      { status: 500 }
    );
  }
}
