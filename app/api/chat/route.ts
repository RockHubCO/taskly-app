import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { buildSystemPrompt } from "@/lib/prompt-builder";
import { processMemoryUpdates, MemoryUpdate } from "@/lib/memory-manager";
import { auth } from "@/auth";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { conversationId, message } = await req.json();
  const userId = session.user.id;

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
    userName: session.user.name || "Usuário",
  });

  // 4. Montar histórico para Claude
  const messages: Anthropic.MessageParam[] = [
    ...conversation.messages.map((m) => ({
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
    model: "claude-3-5-sonnet-20241022",
    max_tokens: 4096,
    system: systemPrompt,
    messages,
    stream: true,
  });

  // 6. Retornar como SSE
  const encoder = new TextEncoder();
  let fullResponse = "";

  const readable = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of stream) {
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
  try {
    const titleMatch = content.match(/📌 TÍTULO:\s*\n?([\s\S]*?)\s*\n📝/);
    const descMatch = content.match(/📝 DESCRIÇÃO:\s*\n?([\s\S]*?)\s*\n👤/);
    
    let assigneeMatch = content.match(/👤 RESPONSÁVEL:\s*(.*?)\s*\n/);
    if (!assigneeMatch) assigneeMatch = content.match(/👤 RESPONSÁVEL:\s*(.*)/); // Fallback
    
    const dueDateMatch = content.match(/📅 DATA DE ENTREGA:\s*(.*?)\s*\n/);
    const priorityMatch = content.match(/🔴🟡🟢 PRIORIDADE:\s*(Alta|Média|Baixa)/i);
    const projectMatch = content.match(/📁 PROJETO:\s*(.*?)\s*\n/);

    let priority: 'HIGH' | 'MEDIUM' | 'LOW' = 'MEDIUM';
    if (priorityMatch) {
      const p = priorityMatch[1].toLowerCase();
      if (p === 'alta') priority = 'HIGH';
      if (p === 'baixa') priority = 'LOW';
    }

    let title = titleMatch ? titleMatch[1].trim() : ("Nova Tarefa " + Date.now().toString().slice(-4));

    await prisma.generatedTask.create({
      data: {
        conversationId,
        userId,
        title,
        description: descMatch ? descMatch[1].trim() : "",
        assignee: assigneeMatch ? assigneeMatch[1].trim() : null,
        dueDate: dueDateMatch ? new Date(dueDateMatch[1].trim()) : null,
        priority: priority,
        project: projectMatch ? projectMatch[1].trim() : null,
        status: "DRAFT"
      }
    });
  } catch(e) {
    console.error("Erro extraindo tarefa", e);
  }
}
