"use client";

import { Check, Dices, Circle } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "@/lib/api";
import { generatePassword, passwordChecks } from "@/lib/password";
import type { PublicUser } from "@/server/types";
import { Badge, Button, Field, FormError, Modal, ModalActions } from "./ui";

/** Small submit helper: busy flag + error message + per-field errors. */
function useSubmit<T>(run: () => Promise<T>, onDone: (r: T) => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFields({});
    try {
      onDone(await run());
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setFields(err.fields);
      } else setError("Unbekannter Fehler.");
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, fields, submit };
}

function PasswordChecklist({ value }: { value: string }) {
  return (
    <ul className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs" aria-label="Passwort-Anforderungen">
      {passwordChecks(value).map((c) => (
        <li key={c.label} className={`flex items-center gap-1.5 ${c.ok ? "text-lime" : "text-muted"}`}>
          {c.ok ? <Check size={12} aria-hidden /> : <Circle size={12} aria-hidden />}
          {c.label}
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Create / edit user (admin)
// ---------------------------------------------------------------------------------------------------------------------
export function UserFormModal({
  user,
  creating,
  onClose,
  onSaved,
}: {
  user: PublicUser | null;
  creating: boolean;
  onClose: () => void;
  onSaved: (u: PublicUser) => void;
}) {
  const open = creating || user !== null;
  return (
    <Modal open={open} onClose={onClose} title={creating ? "Benutzer anlegen" : "Benutzer bearbeiten"}>
      {open && <UserForm key={user?.id ?? "new"} user={creating ? null : user} onClose={onClose} onSaved={onSaved} />}
    </Modal>
  );
}

function UserForm({
  user,
  onClose,
  onSaved,
}: {
  user: PublicUser | null;
  onClose: () => void;
  onSaved: (u: PublicUser) => void;
}) {
  const [username, setUsername] = useState(user?.username ?? "");
  const [displayname, setDisplayname] = useState(user?.displayname ?? "");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<PublicUser["role"]>(user?.role ?? "user");
  const [allRooms, setAllRooms] = useState(user ? user.allowedRooms.includes("*") : true);
  const [rooms, setRooms] = useState(user && !user.allowedRooms.includes("*") ? user.allowedRooms.join("\n") : "");
  const [active, setActive] = useState(user?.active ?? true);

  const { busy, error, fields, submit } = useSubmit(
    async () => {
      const allowedRooms = allRooms ? ["*"] : rooms.split(/[\s,;]+/).filter(Boolean);
      const base = { username, displayname, role, allowedRooms, active };
      const r = user
        ? await api<{ user: PublicUser }>("PATCH", `/api/users/${user.id}`, base)
        : await api<{ user: PublicUser }>("POST", "/api/users", { ...base, password });
      return r.user;
    },
    (u) => {
      onSaved(u);
      onClose();
    },
  );

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <Field
        label="Benutzername"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        error={fields.username}
        hint="3-32 Zeichen: a-z, 0-9, Punkt, Unterstrich, Bindestrich. Gleichzeitig der CouchChat-Host-Login."
        autoCapitalize="none"
        autoComplete="off"
        spellCheck={false}
        required
      />
      <Field label="Anzeigename" value={displayname} onChange={(e) => setDisplayname(e.target.value)} error={fields.displayname} maxLength={64} required />
      {!user && (
        <div className="space-y-2">
          <Field
            label="Startpasswort"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={fields.password}
            autoComplete="new-password"
            required
          />
          <div className="flex items-start justify-between gap-3">
            <PasswordChecklist value={password} />
            <Button type="button" variant="ghost" onClick={() => setPassword(generatePassword())} className="shrink-0 !px-2 !py-1 text-xs">
              <Dices size={14} aria-hidden /> Erzeugen
            </Button>
          </div>
        </div>
      )}
      <div>
        <label htmlFor="uf-role" className="mb-1 block text-sm font-medium text-muted">
          Rolle
        </label>
        <select
          id="uf-role"
          value={role}
          onChange={(e) => setRole(e.target.value as PublicUser["role"])}
          className="w-full rounded-lg border border-line bg-ink px-3 py-2 text-sm text-fg focus:border-primary-hover focus:outline-none"
        >
          <option value="user">Benutzer</option>
          <option value="admin">Administrator</option>
        </select>
        {fields.role && <p className="mt-1 text-xs text-danger">{fields.role}</p>}
      </div>
      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm font-medium text-muted">Erlaubte Räume</legend>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={allRooms} onChange={(e) => setAllRooms(e.target.checked)} className="size-4 accent-primary" />
          Alle Räume
        </label>
        {!allRooms && (
          <div>
            <textarea
              aria-label="Raumnamen"
              value={rooms}
              onChange={(e) => setRooms(e.target.value)}
              rows={3}
              placeholder="ein Raumname pro Zeile oder kommagetrennt"
              className="w-full rounded-lg border border-line bg-ink px-3 py-2 text-sm text-fg placeholder:text-muted/60 focus:border-primary-hover focus:outline-none"
            />
            {fields.allowedRooms && <p className="mt-1 text-xs text-danger">{fields.allowedRooms}</p>}
          </div>
        )}
      </fieldset>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="size-4 accent-primary" />
        Konto aktiv (inaktive Benutzer können sich nirgends anmelden)
      </label>
      <FormError message={error} />
      <ModalActions>
        <Button type="button" onClick={onClose}>
          Abbrechen
        </Button>
        <Button type="submit" variant="primary" busy={busy}>
          {user ? "Speichern" : "Anlegen"}
        </Button>
      </ModalActions>
    </form>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Password: admin reset (target set) or own change (target null, needs current password)
// ---------------------------------------------------------------------------------------------------------------------
export function PasswordModal({
  open,
  target,
  onClose,
  onDone,
}: {
  open: boolean;
  target: PublicUser | null; // null: own password
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  return (
    <Modal open={open} onClose={onClose} title={target ? `Passwort setzen: ${target.username}` : "Passwort ändern"}>
      {open && <PasswordForm key={target?.id ?? "self"} target={target} onClose={onClose} onDone={onDone} />}
    </Modal>
  );
}

function PasswordForm({
  target,
  onClose,
  onDone,
}: {
  target: PublicUser | null;
  onClose: () => void;
  onDone: (m: string) => void;
}) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const mismatch = repeat.length > 0 && next !== repeat;

  const { busy, error, fields, submit } = useSubmit(
    async () => {
      if (next !== repeat) throw new ApiError("Die Passwörter stimmen nicht überein.", 0, { repeat: "Stimmt nicht überein." });
      if (target) await api("POST", `/api/users/${target.id}/password`, { newPassword: next });
      else await api("POST", "/api/me/password", { currentPassword: current, newPassword: next });
    },
    () => {
      onDone(target ? `Passwort für ${target.username} gesetzt. Dessen Sitzungen wurden beendet.` : "Passwort geändert.");
      onClose();
    },
  );

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {target && (
        <p className="text-sm text-muted">
          Das neue Passwort gilt sofort auch für den CouchChat-Host-Login. Bestehende Sitzungen von {target.displayname} werden beendet.
        </p>
      )}
      {!target && (
        <Field
          label="Aktuelles Passwort"
          type="password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          error={fields.currentPassword}
          autoComplete="current-password"
          required
        />
      )}
      <Field
        label="Neues Passwort"
        type="password"
        value={next}
        onChange={(e) => setNext(e.target.value)}
        error={fields.newPassword}
        autoComplete="new-password"
        required
      />
      <div className="flex items-start justify-between gap-3">
        <PasswordChecklist value={next} />
        {target && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              const p = generatePassword();
              setNext(p);
              setRepeat(p);
            }}
            className="shrink-0 !px-2 !py-1 text-xs"
          >
            <Dices size={14} aria-hidden /> Erzeugen
          </Button>
        )}
      </div>
      <Field
        label="Neues Passwort wiederholen"
        type="password"
        value={repeat}
        onChange={(e) => setRepeat(e.target.value)}
        error={fields.repeat ?? (mismatch ? "Stimmt nicht überein." : undefined)}
        autoComplete="new-password"
        required
      />
      <FormError message={error} />
      <ModalActions>
        <Button type="button" onClick={onClose}>
          Abbrechen
        </Button>
        <Button type="submit" variant="primary" busy={busy} disabled={!next || mismatch || (!target && !current)}>
          Passwort speichern
        </Button>
      </ModalActions>
    </form>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Delete confirmation
// ---------------------------------------------------------------------------------------------------------------------
export function DeleteModal({
  user,
  onClose,
  onDeleted,
}: {
  user: PublicUser | null;
  onClose: () => void;
  onDeleted: (u: PublicUser) => void;
}) {
  return (
    <Modal open={user !== null} onClose={onClose} title="Benutzer löschen">
      {user && <DeleteForm user={user} onClose={onClose} onDeleted={onDeleted} />}
    </Modal>
  );
}

function DeleteForm({ user, onClose, onDeleted }: { user: PublicUser; onClose: () => void; onDeleted: (u: PublicUser) => void }) {
  const { busy, error, submit } = useSubmit(
    () => api("DELETE", `/api/users/${user.id}`),
    () => {
      onDeleted(user);
      onClose();
    },
  );
  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="text-sm">
        <strong>{user.displayname}</strong> ({user.username}) wird endgültig gelöscht und kann sich weder im Panel noch bei CouchChat
        anmelden. Das lässt sich nicht rückgängig machen.
      </p>
      <FormError message={error} />
      <ModalActions>
        <Button type="button" onClick={onClose}>
          Abbrechen
        </Button>
        <Button type="submit" variant="danger" busy={busy}>
          Endgültig löschen
        </Button>
      </ModalActions>
    </form>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Own profile
// ---------------------------------------------------------------------------------------------------------------------
export function ProfileModal({
  open,
  profile,
  onClose,
  onSaved,
}: {
  open: boolean;
  profile: PublicUser;
  onClose: () => void;
  onSaved: (u: PublicUser) => void;
}) {
  return (
    <Modal open={open} onClose={onClose} title="Profil bearbeiten">
      {open && <ProfileForm profile={profile} onClose={onClose} onSaved={onSaved} />}
    </Modal>
  );
}

function ProfileForm({ profile, onClose, onSaved }: { profile: PublicUser; onClose: () => void; onSaved: (u: PublicUser) => void }) {
  const [username, setUsername] = useState(profile.username);
  const [displayname, setDisplayname] = useState(profile.displayname);
  const { busy, error, fields, submit } = useSubmit(
    async () => (await api<{ user: PublicUser }>("PATCH", "/api/me", { username, displayname })).user,
    (u) => {
      onSaved(u);
      onClose();
    },
  );
  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <Field
        label="Benutzername"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        error={fields.username}
        hint="Ändert auch Ihren CouchChat-Host-Login."
        autoCapitalize="none"
        autoComplete="username"
        spellCheck={false}
        required
      />
      <Field label="Anzeigename" value={displayname} onChange={(e) => setDisplayname(e.target.value)} error={fields.displayname} maxLength={64} required />
      <FormError message={error} />
      <ModalActions>
        <Button type="button" onClick={onClose}>
          Abbrechen
        </Button>
        <Button type="submit" variant="primary" busy={busy}>
          Speichern
        </Button>
      </ModalActions>
    </form>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Audit log (admin)
// ---------------------------------------------------------------------------------------------------------------------
const ACTION_LABELS: Record<string, string> = {
  "login.success": "Anmeldung",
  "login.failed": "Anmeldung fehlgeschlagen",
  "login.locked": "Konto gesperrt",
  logout: "Abmeldung",
  "user.create": "Benutzer angelegt",
  "user.update": "Benutzer geändert",
  "user.delete": "Benutzer gelöscht",
  "password.change": "Passwort geändert",
  "password.reset": "Passwort zurückgesetzt",
  "password.rehash": "Passwort umgestellt",
  "user.import": "Benutzer importiert",
  "hostsync.error": "Sync-Fehler",
};

interface AuditItem {
  id: number;
  ts: string;
  actor: string | null;
  action: string;
  target: string | null;
  ip: string | null;
  details: Record<string, unknown> | null;
}

export function AuditModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Audit-Log (30 Tage)" wide>
      {open && <AuditViewer />}
    </Modal>
  );
}

function AuditViewer() {
  const [page, setPage] = useState(1);
  const [action, setAction] = useState("");
  const [data, setData] = useState<{ items: AuditItem[]; total: number; pageSize: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const q = new URLSearchParams({ page: String(page), pageSize: "15" });
      if (action) q.set("action", action);
      setData(await api("GET", `/api/audit?${q}`));
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Fehler beim Laden.");
    }
  }, [page, action]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetching on filter/page change
    void load();
  }, [load]);

  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const fmt = new Intl.DateTimeFormat("de-DE", { dateStyle: "short", timeStyle: "medium" });

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <label htmlFor="audit-filter" className="text-sm text-muted">
          Aktion
        </label>
        <select
          id="audit-filter"
          value={action}
          onChange={(e) => {
            setAction(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-line bg-ink px-3 py-1.5 text-sm focus:border-primary-hover focus:outline-none"
        >
          <option value="">Alle</option>
          {Object.entries(ACTION_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </div>
      <FormError message={error} />
      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full min-w-[40rem] text-left text-sm">
          <thead className="bg-ink text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-3 py-2 font-medium">Zeit</th>
              <th className="px-3 py-2 font-medium">Aktion</th>
              <th className="px-3 py-2 font-medium">Von</th>
              <th className="px-3 py-2 font-medium">Betrifft</th>
              <th className="px-3 py-2 font-medium">IP</th>
              <th className="px-3 py-2 font-medium">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {data?.items.map((i) => (
              <tr key={i.id}>
                <td className="whitespace-nowrap px-3 py-2 text-muted">{fmt.format(new Date(i.ts))}</td>
                <td className="px-3 py-2">
                  <Badge tone={i.action.includes("failed") || i.action.includes("locked") || i.action.includes("error") ? "danger" : "brand"}>
                    {ACTION_LABELS[i.action] ?? i.action}
                  </Badge>
                </td>
                <td className="px-3 py-2">{i.actor ?? "-"}</td>
                <td className="px-3 py-2">{i.target ?? "-"}</td>
                <td className="px-3 py-2 text-muted">{i.ip ?? "-"}</td>
                <td className="px-3 py-2 text-xs text-muted">{i.details ? summarize(i.details) : ""}</td>
              </tr>
            ))}
            {data && data.items.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-muted">
                  Keine Einträge.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted">{data ? `${data.total} Einträge` : "Lädt..."}</span>
        <div className="flex items-center gap-2">
          <Button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
            Zurück
          </Button>
          <span aria-live="polite">
            Seite {page} / {pages}
          </span>
          <Button onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={page >= pages}>
            Weiter
          </Button>
        </div>
      </div>
    </div>
  );
}

function summarize(d: Record<string, unknown>): string {
  return Object.entries(d)
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : String(v)}`)
    .join(" · ");
}
