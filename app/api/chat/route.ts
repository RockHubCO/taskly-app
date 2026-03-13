import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { buildSystemPrompt } from "@/lib/prompt-builder";
import { processMemoryUpdates, MemoryUpdate } from "@/lib/memory-manager";
import { auth } from "@/auth";
import { z } from "zod";
import { checkRateLimit } from "@/lib/rate-limiter";

const chatInputSchema = z.object({
  conversationId: z.string().min(1),
  message: z.string()
    .min(1, "Mensagem não pode ser vazia")
    .max(10000, "Mensagem muito longa (máx. 10.000 caracteres)"),
});

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Validar API Key
    if (!process.env.ANTHROPIC_API_KEY) {
      console.error("ANTHROPIC_API_KEY não configurada");
      return Response.json(
        { error: "Configuração do servidor incompleta. Contate o administrador." },
        { status: 503 }
      );
    }

    // Validar input com Zod
    const body = await req.json();
    const parseResult = chatInputSchema.safeParse(body);

    if (!parseResult.success) {
      return Response.json(
        { error: "Input inválido", details: parseResult.error.flatten() },
        { status: 400 }
      );
    }

    const { conversationId, message } = parseResult.data;
    const userId = session.user.id;

    // Rate limiting
    if (!checkRateLimit(userId)) {
      return Response.json(
        { error: "Muitas mensagens. Aguarde um momento." },
        { status: 429 }
      );
    }

    // 1. Buscar contexto (últimas 30 mensagens, reordenadas)
    const [conversation, userMemories, orgMemories] = await Promise.all([
      prisma.conversation.findUnique({
        where: { id: conversationId, userId },
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

    // Buscar últimas 30 mensagens e reordenar cronologicamente
    const recentMessages = await prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: "desc" },
      take: 30,
    });
    const orderedMessages = recentMessages.reverse();

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
      conversationHistory: orderedMessages,
      currentDate: new Date().toISOString().split("T")[0],
      userName: session.user.name || "Usuário",
    });

    // 4. Montar histórico para Claude
    const claudeMessages: Anthropic.MessageParam[] = [
      ...orderedMessages.map((m) => ({
        role: m.role.toLowerCase() as "user" | "assistant",
        content: m.content as string,
      })),
      { role: "user" as const, content: message },
    ];

    // 5. Stream da resposta
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    const stream = await anthropic.messages.create({
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: systemPrompt,
      messages: claudeMessages,
      stream: true,
    });

    // 6. Retornar como SSE (com abort signal)
    const encoder = new TextEncoder();
    let fullResponse = "";
    const abortSignal = req.signal;

    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            if (abortSignal?.aborted) {
              controller.close();
              return;
            }
            if (chunk.type === "content_block_delta" && chunk.delta.type === "text_delta") {
              const text = chunk.delta.text;
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
          if (abortSignal?.aborted) {
            controller.close();
            return;
          }
          controller.enqueue(
            encoder.encode(`event: error\ndata: ${JSON.stringify({ error: "Erro no streaming" })}\n\n`)
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
  } catch (error: any) {
    console.error("API Chat Error:", error);
    return Response.json(
      { error: "Erro interno no servidor. Tente novamente." },
      { status: 500 }
    );
  }
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

async function extractAndSaveTask(
  conversationId: string,
  userId: string,
  content: string
) {
  try {
    // Tentar primeiro o formato JSON estruturado
    const taskDataRegex = /%%TASK_DATA%%([\s\S]*?)%%TASK_DATA%%/;
    const jsonMatch = content.match(taskDataRegex);

    if (jsonMatch) {
      const taskData = JSON.parse(jsonMatch[1].trim());
      await prisma.generatedTask.create({
        data: {
          conversationId,
          userId,
          title: taskData.title || `Nova Tarefa ${Date.now().toString().slice(-4)}`,
          description: taskData.description || "",
          assignee: taskData.assignee || null,
          dueDate: taskData.dueDate ? new Date(taskData.dueDate) : null,
          priority: taskData.priority || "MEDIUM",
          project: taskData.project || null,
          status: "DRAFT",
        },
      });
      return;
    }

    // Fallback: parsing via regex (retrocompatibilidade)
    const titleMatch = content.match(/📌 TÍTULO:\s*\n?([\s\S]*?)\s*\n📝/);
    const descMatch = content.match(/📝 DESCRIÇÃO:\s*\n?([\s\S]*?)\s*\n👤/);
    let assigneeMatch = content.match(/👤 RESPONSÁVEL:\s*(.*?)\s*\n/);
    if (!assigneeMatch) assigneeMatch = content.match(/👤 RESPONSÁVEL:\s*(.*)/);
    const priorityMatch = content.match(/🔴🟡🟢 PRIORIDADE:\s*(Alta|Média|Baixa)/i);
    const projectMatch = content.match(/📁 PROJETO:\s*(.*?)\s*\n/);

    let priority: "HIGH" | "MEDIUM" | "LOW" = "MEDIUM";
    if (priorityMatch) {
      const p = priorityMatch[1].toLowerCase();
      if (p === "alta") priority = "HIGH";
      if (p === "baixa") priority = "LOW";
    }

    await prisma.generatedTask.create({
      data: {
        conversationId,
        userId,
        title: titleMatch ? titleMatch[1].trim() : `Nova Tarefa ${Date.now().toString().slice(-4)}`,
        description: descMatch ? descMatch[1].trim() : "",
        assignee: assigneeMatch ? assigneeMatch[1].trim() : null,
        dueDate: null,
        priority,
        project: projectMatch ? projectMatch[1].trim() : null,
        status: "DRAFT",
      },
    });
  } catch (e) {
    console.error("Erro extraindo tarefa:", e);
  }
}

