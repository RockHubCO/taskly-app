import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'TaskForge — Assistente de Tarefas',
  description: 'Assistente de criação de tarefas Asana com memória persistente.',
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="pt-BR">
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
