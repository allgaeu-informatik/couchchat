"use client";

import Image from "next/image";
import { ChevronDown, KeyRound, LogOut, Pencil, Plus, ScrollText, Search, Trash2, UserCog, UserRound } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { PublicUser } from "@/server/types";
import { AuditModal, DeleteModal, PasswordModal, ProfileModal, UserFormModal } from "./modals";
import { StatsPanel } from "./StatsPanel";
import { Badge, Button } from "./ui";

type Modal =
  | { kind: "none" }
  | { kind: "create" }
  | { kind: "edit"; user: PublicUser }
  | { kind: "reset"; user: PublicUser }
  | { kind: "delete"; user: PublicUser }
  | { kind: "profile" }
  | { kind: "ownPassword" }
  | { kind: "audit" };

export function Dashboard({ initialProfile, initialUsers }: { initialProfile: PublicUser; initialUsers: PublicUser[] }) {
  const [me, setMe] = useState(initialProfile);
  const [users, setUsers] = useState(initialUsers);
  const [modal, setModal] = useState<Modal>({ kind: "none" });
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [tab, setTab] = useState<"overview" | "users">("overview");
  const isAdmin = me.role === "admin";

  // Server-side warning (e.g. host-users.json could not be written); stays until dismissed.
  useEffect(() => {
    const h = (e: Event) => setWarning(String((e as CustomEvent).detail));
    window.addEventListener("cc:warning", h);
    return () => window.removeEventListener("cc:warning", h);
  }, []);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(t);
  }, [notice]);

  const close = () => setModal({ kind: "none" });

  async function reloadUsers() {
    try {
      setUsers((await api<{ users: PublicUser[] }>("GET", "/api/users")).users);
    } catch {
      /* the api helper redirects on 401; other errors keep the old list */
    }
  }

  function onSaved(u: PublicUser, msg: string) {
    if (u.id === me.id) setMe(u);
    setNotice(msg);
    if (isAdmin) void reloadUsers();
  }

  async function logout() {
    try {
      await api("POST", "/api/auth/logout");
    } finally {
      window.location.replace("/login");
    }
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => u.username.includes(q) || u.displayname.toLowerCase().includes(q));
  }, [users, query]);

  return (
    <div className="min-h-dvh">
      <header className="border-b border-line bg-bg/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-3">
            <Image src="/images/logo.svg" alt="" width={32} height={32} className="rounded-full" unoptimized priority />
            <span className="text-lg font-bold tracking-wide">CouchChat Admin</span>
          </div>
          <UserMenu
            me={me}
            onProfile={() => setModal({ kind: "profile" })}
            onPassword={() => setModal({ kind: "ownPassword" })}
            onLogout={logout}
          />
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:py-8">
        <div role="status" aria-live="polite" className="mb-4 min-h-6 text-sm text-lime">
          {notice}
        </div>
        {warning && (
          <div role="alert" className="mb-4 flex items-start justify-between gap-3 rounded-card border border-amber-500/50 bg-amber-500/10 p-3 text-sm">
            <span>{warning}</span>
            <button type="button" onClick={() => setWarning(null)} className="shrink-0 underline">
              Schließen
            </button>
          </div>
        )}

        {isAdmin && (
          <div role="tablist" aria-label="Bereich" className="mb-5 inline-flex rounded-lg border border-line bg-surface p-0.5">
            {([
              ["overview", "Übersicht"],
              ["users", "Benutzer"],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                id={`tab-${id}`}
                aria-selected={tab === id}
                aria-controls={`panel-${id}`}
                onClick={() => setTab(id)}
                className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${tab === id ? "bg-primary text-white" : "text-muted hover:text-fg"}`}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {isAdmin && tab === "overview" ? (
          <div role="tabpanel" id="panel-overview" aria-labelledby="tab-overview">
            <h1 className="sr-only">Übersicht</h1>
            <StatsPanel />
          </div>
        ) : isAdmin ? (
          <section id="panel-users" role="tabpanel" aria-labelledby="tab-users" className="rounded-card border border-line bg-surface">
            <div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row sm:items-center sm:justify-between">
              <h1 id="users-h" className="text-lg font-semibold">
                Benutzer <span className="text-sm font-normal text-muted">({users.length})</span>
              </h1>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="relative">
                  <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
                  <input
                    type="search"
                    aria-label="Benutzer suchen"
                    placeholder="Suchen..."
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className="w-full rounded-lg border border-line bg-ink py-2 pl-9 pr-3 text-sm placeholder:text-muted/60 focus:border-primary-hover focus:outline-none sm:w-60"
                  />
                </div>
                <Button onClick={() => setModal({ kind: "audit" })}>
                  <ScrollText size={16} aria-hidden /> Audit-Log
                </Button>
                <Button variant="primary" onClick={() => setModal({ kind: "create" })}>
                  <Plus size={16} aria-hidden /> Benutzer anlegen
                </Button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[44rem] text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-4 py-3 font-medium">Benutzer</th>
                    <th className="px-4 py-3 font-medium">Rolle</th>
                    <th className="px-4 py-3 font-medium">Räume</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 text-right font-medium">Aktionen</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {filtered.map((u) => (
                    <tr key={u.id} className="hover:bg-raised/40">
                      <td className="px-4 py-3">
                        <div className="font-medium">{u.displayname}</div>
                        <div className="text-xs text-muted">{u.username}</div>
                      </td>
                      <td className="px-4 py-3">{u.role === "admin" ? <Badge tone="gold">Administrator</Badge> : <Badge tone="muted">Benutzer</Badge>}</td>
                      <td className="px-4 py-3 text-muted">{u.allowedRooms.includes("*") ? "Alle" : `${u.allowedRooms.length}`}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {u.locked ? <Badge tone="danger">Gesperrt</Badge> : u.active ? <Badge tone="brand">Aktiv</Badge> : <Badge tone="muted">Inaktiv</Badge>}
                          {u.legacyPassword ? <Badge tone="muted">Altes Jitsi-Passwort</Badge> : null}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <IconBtn label={`${u.username} bearbeiten`} onClick={() => setModal({ kind: "edit", user: u })}>
                            <Pencil size={16} aria-hidden />
                          </IconBtn>
                          <IconBtn
                            label={`Passwort für ${u.username} setzen`}
                            disabled={u.id === me.id}
                            onClick={() => setModal({ kind: "reset", user: u })}
                          >
                            <KeyRound size={16} aria-hidden />
                          </IconBtn>
                          <IconBtn
                            label={`${u.username} löschen`}
                            danger
                            disabled={u.id === me.id}
                            onClick={() => setModal({ kind: "delete", user: u })}
                          >
                            <Trash2 size={16} aria-hidden />
                          </IconBtn>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-muted">
                        Keine Benutzer gefunden.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        ) : (
          <section aria-labelledby="me-h" className="mx-auto max-w-lg rounded-card border border-line bg-surface p-6">
            <h1 id="me-h" className="mb-4 text-lg font-semibold">
              Mein Profil
            </h1>
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-muted">Anzeigename</dt>
                <dd className="font-medium">{me.displayname}</dd>
              </div>
              <div>
                <dt className="text-muted">Benutzername (CouchChat-Host-Login)</dt>
                <dd className="font-medium">{me.username}</dd>
              </div>
            </dl>
            <div className="mt-6 flex flex-col gap-2 sm:flex-row">
              <Button variant="primary" onClick={() => setModal({ kind: "profile" })}>
                <Pencil size={16} aria-hidden /> Profil bearbeiten
              </Button>
              <Button onClick={() => setModal({ kind: "ownPassword" })}>
                <KeyRound size={16} aria-hidden /> Passwort ändern
              </Button>
            </div>
          </section>
        )}
      </main>

      {isAdmin && (
        <>
          <UserFormModal
            creating={modal.kind === "create"}
            user={modal.kind === "edit" ? modal.user : null}
            onClose={close}
            onSaved={(u) => onSaved(u, `Benutzer ${u.username} gespeichert.`)}
          />
          <DeleteModal
            user={modal.kind === "delete" ? modal.user : null}
            onClose={close}
            onDeleted={(u) => onSaved(me, `Benutzer ${u.username} gelöscht.`)}
          />
          <AuditModal open={modal.kind === "audit"} onClose={close} />
        </>
      )}
      <PasswordModal
        open={modal.kind === "reset" || modal.kind === "ownPassword"}
        target={modal.kind === "reset" ? modal.user : null}
        onClose={close}
        onDone={setNotice}
      />
      <ProfileModal open={modal.kind === "profile"} profile={me} onClose={close} onSaved={(u) => onSaved(u, "Profil gespeichert.")} />
    </div>
  );
}

function IconBtn({
  label,
  onClick,
  children,
  danger = false,
  disabled = false,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`rounded-lg p-2 text-muted transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        danger ? "hover:bg-danger-bg/40 hover:text-danger" : "hover:bg-raised hover:text-fg"
      }`}
    >
      {children}
    </button>
  );
}

function UserMenu({
  me,
  onProfile,
  onPassword,
  onLogout,
}: {
  me: PublicUser;
  onProfile: () => void;
  onPassword: () => void;
  onLogout: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const item = (icon: React.ReactNode, label: string, fn: () => void) => (
    <button
      type="button"
      role="menuitem"
      onClick={() => {
        setOpen(false);
        fn();
      }}
      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-raised"
    >
      {icon}
      {label}
    </button>
  );

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-raised"
      >
        <span className="flex size-8 items-center justify-center rounded-full bg-primary/30 text-brand">
          {me.role === "admin" ? <UserCog size={16} aria-hidden /> : <UserRound size={16} aria-hidden />}
        </span>
        <span className="hidden max-w-40 truncate font-medium sm:inline">{me.displayname}</span>
        <ChevronDown size={16} aria-hidden className="text-muted" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-20 mt-2 w-56 rounded-card border border-line bg-surface p-1.5 shadow-2xl">
          <div className="px-3 py-2 text-xs text-muted">
            Angemeldet als <span className="font-medium text-fg">{me.username}</span>
          </div>
          {item(<Pencil size={16} aria-hidden />, "Profil bearbeiten", onProfile)}
          {item(<KeyRound size={16} aria-hidden />, "Passwort ändern", onPassword)}
          {item(<LogOut size={16} aria-hidden />, "Abmelden", onLogout)}
        </div>
      )}
    </div>
  );
}
