"use client";

import Image from "next/image";
import { LogIn } from "lucide-react";
import { useState, type FormEvent } from "react";
import { api, ApiError } from "@/lib/api";
import { Button, Field, FormError } from "./ui";

export function LoginForm() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("POST", "/api/auth/login", { username, password });
      window.location.replace("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Anmeldung fehlgeschlagen.");
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm rounded-card border border-line bg-surface p-6 shadow-2xl sm:p-8">
        <div className="mb-6 flex items-center gap-3">
          <Image src="/images/logo.svg" alt="" width={40} height={40} className="rounded-full" unoptimized priority />
          <div>
            <h1 className="text-lg font-bold leading-tight">CouchChat Admin</h1>
            <p className="text-sm text-muted">Anmelden mit Ihrem CouchChat-Login</p>
          </div>
        </div>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <Field
            label="Benutzername"
            name="username"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            autoFocus
            required
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <Field
            label="Passwort"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <FormError message={error} />
          <Button type="submit" variant="primary" busy={busy} disabled={!username || !password} className="w-full">
            <LogIn size={16} aria-hidden /> Anmelden
          </Button>
        </form>
      </div>
    </main>
  );
}
