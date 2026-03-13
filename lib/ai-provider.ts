import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";

export type AIProvider = "anthropic" | "gemini";

interface StreamChunk {
  text: string;
}

/**
 * Detecta qual provider está configurado e disponível.
 * Prioridade: Anthropic > Gemini
 */
export function getActiveProvider(): AIProvider | null {
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.GEMINI_API_KEY) return "gemini";
  return null;
}

/**
 * Cria um stream de texto unificado independente do provider.
 * Retorna um AsyncGenerator que emite chunks de texto.
 */
export async function* createAIStream(
  provider: AIProvider,
  systemPrompt: string,
  messages: Array<{ role: "user" | "assistant"; content: string }>
): AsyncGenerator<StreamChunk> {
  if (provider === "anthropic") {
    yield* streamAnthropic(systemPrompt, messages);
  } else {
    yield* streamGemini(systemPrompt, messages);
  }
}

async function* streamAnthropic(
  systemPrompt: string,
  messages: Array<{ role: "user" | "assistant"; content: string }>
): AsyncGenerator<StreamChunk> {
  const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  const stream = await anthropic.messages.create({
    model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514",
    max_tokens: 4096,
    system: systemPrompt,
    messages,
    stream: true,
  });

  for await (const chunk of stream) {
    if (chunk.type === "content_block_delta" && chunk.delta.type === "text_delta") {
      yield { text: chunk.delta.text };
    }
  }
}

async function* streamGemini(
  systemPrompt: string,
  messages: Array<{ role: "user" | "assistant"; content: string }>
): AsyncGenerator<StreamChunk> {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

  // Converter histórico para formato Gemini
  const contents = messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const response = await ai.models.generateContentStream({
    model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
    config: {
      systemInstruction: systemPrompt,
      maxOutputTokens: 4096,
    },
    contents,
  });

  for await (const chunk of response) {
    const text = chunk.text;
    if (text) {
      yield { text };
    }
  }
}
