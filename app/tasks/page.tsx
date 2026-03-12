import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, CheckCircle2 } from "lucide-react";

export default async function TasksPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const tasks = await prisma.generatedTask.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="min-h-screen bg-zinc-50 p-8">
      <div className="mx-auto max-w-5xl space-y-8">
        <header className="flex items-center gap-4">
          <Link href="/" className="text-zinc-500 hover:text-zinc-900">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900">Tarefas Geradas</h1>
        </header>

        <div className="rounded-xl border border-zinc-200 bg-white shadow-sm overflow-hidden">
          <div className="border-b border-zinc-200 px-6 py-4">
            <h2 className="font-semibold text-zinc-900">Histórico de Tarefas</h2>
          </div>
          <div className="divide-y divide-zinc-100">
            {tasks.length === 0 ? (
              <div className="p-6 text-center text-zinc-500">
                Nenhuma tarefa gerada ainda. Comece criando uma nova!
              </div>
            ) : (
              tasks.map((task) => (
                <div key={task.id} className="p-6 hover:bg-zinc-50 transition-colors">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-medium text-zinc-900">{task.title}</h3>
                    <span className="inline-flex items-center gap-1 rounded-md bg-green-50 px-2 py-1 text-xs font-medium text-green-700 ring-1 ring-inset ring-green-600/20">
                      <CheckCircle2 className="h-3 w-3" />
                      {task.status}
                    </span>
                  </div>
                  <p className="text-sm text-zinc-500 mb-2">
                    Responsável: {task.assignee || "Não definido"}
                  </p>
                  <pre className="mt-2 rounded-md bg-zinc-100 p-3 text-sm text-zinc-800 overflow-x-auto whitespace-pre-wrap">
                    {task.description}
                  </pre>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
