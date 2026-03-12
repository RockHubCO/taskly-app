import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default async function MemoryPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const memories = await prisma.userMemory.findMany({
    where: { userId: session.user.id },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <div className="min-h-screen bg-zinc-50 p-8">
      <div className="mx-auto max-w-5xl space-y-8">
        <header className="flex items-center gap-4">
          <Link href="/" className="text-zinc-500 hover:text-zinc-900">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900">Banco de Memória</h1>
        </header>

        <div className="rounded-xl border border-zinc-200 bg-white shadow-sm overflow-hidden">
          <div className="border-b border-zinc-200 px-6 py-4">
            <h2 className="font-semibold text-zinc-900">Suas Memórias</h2>
          </div>
          <div className="divide-y divide-zinc-100">
            {memories.length === 0 ? (
              <div className="p-6 text-center text-zinc-500">
                Nenhuma memória registrada ainda. O TaskForge aprende conforme você usa.
              </div>
            ) : (
              memories.map((memory) => (
                <div key={memory.id} className="p-6 hover:bg-zinc-50 transition-colors">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center rounded-md bg-indigo-50 px-2 py-1 text-xs font-medium text-indigo-700 ring-1 ring-inset ring-indigo-700/10">
                        {memory.category}
                      </span>
                      <span className="font-medium text-zinc-900">{memory.key}</span>
                    </div>
                    <span className="text-sm text-zinc-500">
                      {new Date(memory.updatedAt).toLocaleDateString()}
                    </span>
                  </div>
                  <pre className="mt-2 rounded-md bg-zinc-100 p-3 text-sm text-zinc-800 overflow-x-auto">
                    {JSON.stringify(memory.value, null, 2)}
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
