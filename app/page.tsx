import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { PlusCircle, MessageSquare, BrainCircuit, CheckSquare } from "lucide-react";

export default async function Dashboard() {
  const session = await auth();
  
  if (!session?.user?.id) return null;

  const conversations = await prisma.conversation.findMany({
    where: { userId: session.user.id },
    orderBy: { updatedAt: "desc" },
    take: 10,
  });

  const stats = await prisma.$transaction([
    prisma.conversation.count({ where: { userId: session.user.id } }),
    prisma.generatedTask.count({ where: { userId: session.user.id } }),
    prisma.userMemory.count({ where: { userId: session.user.id } }),
  ]);

  return (
    <div className="min-h-screen bg-zinc-50 p-8">
      <div className="mx-auto max-w-5xl space-y-8">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-zinc-900">TaskForge</h1>
            <p className="text-zinc-500">Bem-vindo(a), {session.user.name}</p>
          </div>
          <div className="flex items-center gap-4">
            <Link
              href="/api/auth/signout"
              className="text-sm font-medium text-zinc-500 hover:text-zinc-900"
            >
              Sair
            </Link>
            <Link
              href="/chat/new"
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              <PlusCircle className="h-4 w-4" />
              Nova Tarefa
            </Link>
          </div>
        </header>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Link href="/chat/new" className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm hover:bg-zinc-50 transition-colors">
            <div className="flex items-center gap-3 text-zinc-600">
              <MessageSquare className="h-5 w-5" />
              <h3 className="font-medium">Conversas</h3>
            </div>
            <p className="mt-4 text-3xl font-semibold text-zinc-900">{stats[0]}</p>
          </Link>
          <Link href="/tasks" className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm hover:bg-zinc-50 transition-colors">
            <div className="flex items-center gap-3 text-zinc-600">
              <CheckSquare className="h-5 w-5" />
              <h3 className="font-medium">Tarefas Geradas</h3>
            </div>
            <p className="mt-4 text-3xl font-semibold text-zinc-900">{stats[1]}</p>
          </Link>
          <Link href="/memory" className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm hover:bg-zinc-50 transition-colors">
            <div className="flex items-center gap-3 text-zinc-600">
              <BrainCircuit className="h-5 w-5" />
              <h3 className="font-medium">Memórias</h3>
            </div>
            <p className="mt-4 text-3xl font-semibold text-zinc-900">{stats[2]}</p>
          </Link>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white shadow-sm overflow-hidden">
          <div className="border-b border-zinc-200 px-6 py-4">
            <h2 className="font-semibold text-zinc-900">Conversas Recentes</h2>
          </div>
          <div className="divide-y divide-zinc-100">
            {conversations.length === 0 ? (
              <div className="p-6 text-center text-zinc-500">
                Nenhuma conversa ainda. Comece criando uma nova tarefa!
              </div>
            ) : (
              conversations.map((conv) => (
                <Link
                  key={conv.id}
                  href={`/chat/${conv.id}`}
                  className="block px-6 py-4 hover:bg-zinc-50 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-zinc-900">
                      {conv.title || "Nova Conversa"}
                    </p>
                    <span className="text-sm text-zinc-500">
                      {new Date(conv.updatedAt).toLocaleDateString()}
                    </span>
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
