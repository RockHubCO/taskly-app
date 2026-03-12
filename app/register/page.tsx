"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function RegisterPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    });

    if (res.ok) {
      router.push("/login");
    } else {
      const data = await res.json();
      setError(data.error || "Erro ao registrar");
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50">
      <div className="w-full max-w-md space-y-8 rounded-2xl bg-white p-8 shadow-sm border border-zinc-100">
        <div>
          <h2 className="mt-6 text-center text-3xl font-bold tracking-tight text-zinc-900">
            Criar Conta
          </h2>
          <p className="mt-2 text-center text-sm text-zinc-600">
            Crie sua conta no TaskForge
          </p>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="space-y-4 rounded-md shadow-sm">
            <div>
              <label className="sr-only" htmlFor="name">
                Nome
              </label>
              <input
                id="name"
                name="name"
                type="text"
                required
                className="relative block w-full rounded-md border-0 py-1.5 text-zinc-900 ring-1 ring-inset ring-zinc-300 placeholder:text-zinc-400 focus:z-10 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6 px-3"
                placeholder="Nome"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div>
              <label className="sr-only" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                className="relative block w-full rounded-md border-0 py-1.5 text-zinc-900 ring-1 ring-inset ring-zinc-300 placeholder:text-zinc-400 focus:z-10 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6 px-3"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label className="sr-only" htmlFor="password">
                Senha
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                className="relative block w-full rounded-md border-0 py-1.5 text-zinc-900 ring-1 ring-inset ring-zinc-300 placeholder:text-zinc-400 focus:z-10 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6 px-3"
                placeholder="Senha"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          {error && <p className="text-sm text-red-600 text-center">{error}</p>}

          <div>
            <button
              type="submit"
              className="group relative flex w-full justify-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
            >
              Registrar
            </button>
          </div>
          <div className="text-center text-sm">
            <Link href="/login" className="font-medium text-indigo-600 hover:text-indigo-500">
              Já tem uma conta? Entre aqui
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
