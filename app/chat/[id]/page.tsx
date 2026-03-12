import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import ChatInterface from "./chat-interface";

export default async function ChatPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { id } = await params;

  const conversation = await prisma.conversation.findUnique({
    where: { id, userId: session.user.id },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });

  if (!conversation) redirect("/");

  return <ChatInterface initialMessages={conversation.messages} conversationId={id} />;
}
