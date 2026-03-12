import { prisma } from "@/lib/prisma";

export interface MemoryUpdate {
  action: "upsert" | "delete" | "correct";
  scope: "PERSONAL" | "ORGANIZATION";
  category: "PERSON" | "PROJECT" | "PREFERENCE" | "TEMPLATE" | "CORRECTION";
  key: string;
  value?: any;
  reason?: string;
}

export async function processMemoryUpdates(
  userId: string,
  updates: MemoryUpdate[]
) {
  for (const update of updates) {
    switch (update.action) {
      case "upsert":
        await prisma.userMemory.upsert({
          where: {
            userId_scope_category_key: {
              userId,
              scope: update.scope,
              category: update.category,
              key: update.key,
            },
          },
          update: {
            value: update.value,
            confidence: 1.0,
            updatedAt: new Date(),
          },
          create: {
            userId,
            scope: update.scope,
            category: update.category,
            key: update.key,
            value: update.value,
            confidence: 1.0,
          },
        });
        break;

      case "correct":
        // Correções têm prioridade máxima
        // 1. Reduz confidence da memória antiga
        await prisma.userMemory.updateMany({
          where: { userId, key: update.key },
          data: { confidence: 0.3 },
        });
        // 2. Cria/atualiza com a correção
        await prisma.userMemory.upsert({
          where: {
            userId_scope_category_key: {
              userId,
              scope: update.scope,
              category: "CORRECTION",
              key: update.key,
            },
          },
          update: {
            value: update.value,
            confidence: 1.0,
            updatedAt: new Date(),
          },
          create: {
            userId,
            scope: update.scope,
            category: "CORRECTION",
            key: update.key,
            value: update.value,
            confidence: 1.0,
          },
        });
        break;

      case "delete":
        await prisma.userMemory.deleteMany({
          where: { userId, scope: update.scope, key: update.key },
        });
        break;
    }
  }
}

// Formata memórias para injetar no prompt do Claude
export function formatMemoriesForPrompt(memories: any[]): string {
  if (memories.length === 0) return "(nenhuma memória registrada)";

  return memories
    .sort((a, b) => {
      // Correções primeiro, depois por confidence
      if (a.category === "CORRECTION" && b.category !== "CORRECTION") return -1;
      if (b.category === "CORRECTION" && a.category !== "CORRECTION") return 1;
      return b.confidence - a.confidence;
    })
    .map((m) => {
      const prefix = m.category === "CORRECTION" ? "⚠️ CORREÇÃO: " : "";
      return `${prefix}[${m.key}]: ${JSON.stringify(m.value)}`;
    })
    .join("\n");
}
