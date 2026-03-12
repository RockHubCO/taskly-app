import { GoogleGenAI } from "@google/genai";
import { prisma } from "@/lib/prisma";
import { buildSystemPrompt } from "@/lib/prompt-builder";
import { processMemoryUpdates, MemoryUpdate } from "@/lib/memory-manager";
import { auth } from "@/auth";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;
  const userName = session.user.name || "Usuário";

  const { conversationId, message } = await req.json();

  // 1. Buscar contexto
  const [conversation, userMemories, orgMemories] = await Promise.all([
    prisma.conversation.findUnique({
      where: { id: conversationId, userId },
      include: { messages: { orderBy: { createdAt: "asc" }, take: 50 } },
    }),
    prisma.userMemory.findMany({
      where: { userId, scope: "PERSONAL" },
    }),
    prisma.userMemory.findMany({
      where: { scope: "ORGANIZATION" },
    }),
  ]);

  if (!conversation) {
    return Response.json({ error: "Conversation not found" }, { status: 404 });
  }

  // 2. Salvar mensagem do usuário
  await prisma.message.create({
    data: {
      conversationId,
      role: "USER",
      content: message,
    },
  });

  // 3. Montar prompt com memória injetada
  const systemPrompt = buildSystemPrompt({
    userMemories,
    orgMemories,
    conversationHistory: conversation.messages,
    currentDate: new Date().toISOString().split("T")[0],
    userName,
  });

  // 4. Montar histórico para Gemini
  // Gemini uses 'user' and 'model'
  const contents = [
    ...conversation.messages.map((m) => ({
      role: m.role === "USER" ? "user" : "model",
      parts: [{ text: m.content }],
    })),
    { role: "user", parts: [{ text: message }] },
  ];

  // 5. Stream da resposta
  const ai = new GoogleGenAI({ apiKey: process.env.NEXT_PUBLIC_GEMINI_API_KEY });

  const stream = await ai.models.generateContentStream({
    model: "gemini-3.1-pro-preview", // Using Gemini 3.1 Pro as requested by environment
    contents: contents as any,
    config: {
      systemInstruction: systemPrompt,
      maxOutputTokens: 4096,
    }
  });

  // 6. Retornar como SSE
  const encoder = new TextEncoder();
  let fullResponse = "";

  const readable = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of stream) {
          const text = chunk.text;
          if (text) {
            fullResponse += text;
            controller.enqueue(
              encoder.encode(`event: token\ndata: ${JSON.stringify({ content: text })}\n\n`)
            );
          }
        }

        // 7. Extrair e processar memory signals
        const { cleanContent, memoryUpdates } = extractMemorySignals(fullResponse);

        // 8. Salvar resposta do assistente (sem os signals)
        const assistantMessage = await prisma.message.create({
          data: {
            conversationId,
            role: "ASSISTANT",
            content: cleanContent,
          },
        });

        // 9. Persistir atualizações de memória
        if (memoryUpdates.length > 0) {
          await processMemoryUpdates(userId, memoryUpdates);
        }

        // 10. Detectar se há tarefa confirmada para salvar
        if (cleanContent.includes("TAREFA ASANA — PRONTA PARA INSERÇÃO")) {
          await extractAndSaveTask(conversationId, userId, cleanContent);
        }

        controller.enqueue(
          encoder.encode(
            `event: done\ndata: ${JSON.stringify({
              messageId: assistantMessage.id,
              memoryUpdates: memoryUpdates.length,
            })}\n\n`
          )
        );
        controller.close();
      } catch (error: any) {
        controller.enqueue(
          encoder.encode(`event: error\ndata: ${JSON.stringify({ error: error.message })}\n\n`)
        );
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

// Extrai blocos %%MEMORY_UPDATE%% da resposta
function extractMemorySignals(content: string) {
  const regex = /%%MEMORY_UPDATE%%([\s\S]*?)%%MEMORY_UPDATE%%/g;
  const updates: MemoryUpdate[] = [];
  let match;

  while ((match = regex.exec(content)) !== null) {
    try {
      const parsed = JSON.parse(match[1].trim());
      updates.push(...(parsed.updates || []));
    } catch {
      // Ignora JSON malformado
    }
  }

  const cleanContent = content.replace(regex, "").trim();
  return { cleanContent, memoryUpdates: updates };
}

async function extractAndSaveTask(conversationId: string, userId: string, content: string) {
  // Simple extraction logic for the task
  const titleMatch = content.match(/📌 TÍTULO:\s*(.+)/);
  const assigneeMatch = content.match(/👤 RESPONSÁVEL:\s*(.+)/);
  
  await prisma.generatedTask.create({
    data: {
      conversationId,
      userId,
      title: titleMatch ? titleMatch[1].trim() : "Nova Tarefa",
      description: content,
      assignee: assigneeMatch ? assigneeMatch[1].trim() : null,
      status: "CONFIRMED",
      confirmedAt: new Date(),
    }
  });
}
