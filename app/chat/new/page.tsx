import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

export default async function NewChatPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const conversation = await prisma.conversation.create({
    data: {
      userId: session.user.id,
      title: "Nova Conversa",
    },
  });

  redirect(`/chat/${conversation.id}`);
}
