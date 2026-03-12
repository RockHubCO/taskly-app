"use client";

import { useState, useRef, useEffect } from "react";
import { Message } from "@prisma/client";
import { Send, Loader2, Copy, CheckCircle2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import Link from "next/link";

export default function ChatInterface({
  initialMessages,
  conversationId,
}: {
  initialMessages: Message[];
  conversationId: string;
}) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      conversationId,
      role: "USER",
      content: input,
      metadata: null,
      createdAt: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, message: userMessage.content }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || "Failed to send message");
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let assistantContent = "";

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        conversationId,
        role: "ASSISTANT",
        content: "",
        metadata: null,
        createdAt: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split("\n\n");

          for (const line of lines) {
            if (line.startsWith("event: token")) {
              const dataLine = line.split("\n")[1];
              if (dataLine && dataLine.startsWith("data: ")) {
                try {
                  const data = JSON.parse(dataLine.slice(6));
                  assistantContent += data.content;
                  setMessages((prev) => {
                    const newMessages = [...prev];
                    newMessages[newMessages.length - 1].content = assistantContent;
                    return newMessages;
                  });
                } catch (e) {}
              }
            } else if (line.startsWith("event: done")) {
              // Finalize
            }
          }
        }
      }
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const renderMessageContent = (content: string) => {
    // Remove memory signals from display
    const cleanContent = content.replace(/%%MEMORY_UPDATE%%[\s\S]*?%%MEMORY_UPDATE%%/g, "").trim();

    if (cleanContent.includes("TAREFA ASANA — PRONTA PARA INSERÇÃO")) {
      return (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-6 shadow-sm">
          <div className="prose prose-sm prose-indigo max-w-none">
            <ReactMarkdown>{cleanContent}</ReactMarkdown>
          </div>
          <div className="mt-4 flex gap-3 border-t border-indigo-100 pt-4">
            <button
              onClick={() => navigator.clipboard.writeText(cleanContent)}
              className="inline-flex items-center gap-2 rounded-md bg-white px-3 py-2 text-sm font-medium text-indigo-700 shadow-sm ring-1 ring-inset ring-indigo-300 hover:bg-indigo-50"
            >
              <Copy className="h-4 w-4" />
              Copiar para Asana
            </button>
            <button className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-500">
              <CheckCircle2 className="h-4 w-4" />
              Confirmar Tarefa
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="prose prose-sm max-w-none text-zinc-800">
        <ReactMarkdown>{cleanContent}</ReactMarkdown>
      </div>
    );
  };

  return (
    <div className="flex h-screen flex-col bg-zinc-50">
      <header className="flex h-16 items-center justify-between border-b border-zinc-200 bg-white px-6">
        <h1 className="text-lg font-semibold text-zinc-900">TaskForge Chat</h1>
        <Link href="/" className="text-sm font-medium text-zinc-500 hover:text-zinc-900">
          Voltar ao Dashboard
        </Link>
      </header>

      <main className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-3xl space-y-6">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.role === "USER" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-5 py-4 ${
                  msg.role === "USER"
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "bg-white border border-zinc-200 shadow-sm"
                }`}
              >
                {msg.role === "USER" ? (
                  <p className="whitespace-pre-wrap text-sm">{msg.content}</p>
                ) : (
                  renderMessageContent(msg.content)
                )}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      </main>

      <footer className="border-t border-zinc-200 bg-white p-4">
        <div className="mx-auto max-w-3xl">
          <form
            onSubmit={handleSubmit}
            className="flex items-end gap-3 rounded-xl border border-zinc-300 bg-zinc-50 p-2 focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500"
          >
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Descreva a tarefa..."
              className="max-h-32 min-h-[44px] w-full resize-none bg-transparent px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-500 focus:outline-none"
              rows={1}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(e);
                }
              }}
            />
            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
            >
              {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
            </button>
          </form>
        </div>
      </footer>
    </div>
  );
}
