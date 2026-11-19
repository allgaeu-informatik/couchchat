"use client";

import { Eye, EyeOff, Loader2, X } from "lucide-react";
import { useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from "react";

/** Accessible modal on the native <dialog>: focus trap, Esc, inert background, focus returns to the opener. */
export function Modal({
  open,
  onClose,
  title,
  children,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className={`m-auto w-[calc(100%-2rem)] ${wide ? "max-w-3xl" : "max-w-md"} rounded-card border border-line bg-surface p-0 text-fg shadow-2xl`}
    >
      {open && (
        <div className="max-h-[85dvh] overflow-y-auto p-5 sm:p-6">
          <div className="mb-4 flex items-start justify-between gap-4">
            <h2 id={titleId} className="text-lg font-semibold">
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Schließen"
              className="-mr-2 -mt-1 rounded-lg p-2 text-muted hover:bg-raised hover:text-fg"
            >
              <X size={18} aria-hidden />
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}

type Variant = "primary" | "secondary" | "danger" | "ghost";
const VARIANTS: Record<Variant, string> = {
  primary: "bg-primary text-white hover:bg-primary-hover",
  secondary: "border border-line bg-raised text-fg hover:border-brand/50",
  danger: "bg-danger-bg text-white hover:bg-[#9a2f3d]",
  ghost: "text-muted hover:bg-raised hover:text-fg",
};

export function Button({
  variant = "secondary",
  busy = false,
  className = "",
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; busy?: boolean }) {
  return (
    <button
      {...rest}
      disabled={disabled || busy}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${VARIANTS[variant]} ${className}`}
    >
      {busy && <Loader2 size={16} className="animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

export function Field({
  label,
  error,
  hint,
  type = "text",
  className = "",
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string; hint?: string }) {
  const id = useId();
  const [shown, setShown] = useState(false);
  const isPw = type === "password";
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-muted">
        {label}
      </label>
      <div className="relative">
        <input
          {...rest}
          id={id}
          type={isPw && shown ? "text" : type}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-e` : hint ? `${id}-h` : undefined}
          className={`w-full rounded-lg border bg-ink px-3 py-2 text-sm text-fg placeholder:text-muted/60 focus:border-primary-hover focus:outline-none ${
            error ? "border-danger" : "border-line"
          } ${isPw ? "pr-10" : ""}`}
        />
        {isPw && (
          <button
            type="button"
            onClick={() => setShown((s) => !s)}
            aria-label={shown ? "Passwort verbergen" : "Passwort anzeigen"}
            className="absolute inset-y-0 right-0 px-3 text-muted hover:text-fg"
          >
            {shown ? <EyeOff size={16} aria-hidden /> : <Eye size={16} aria-hidden />}
          </button>
        )}
      </div>
      {error ? (
        <p id={`${id}-e`} className="mt-1 text-xs text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-h`} className="mt-1 text-xs text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function FormError({ message }: { message: string | null }) {
  return message ? (
    <p role="alert" className="rounded-lg border border-danger/40 bg-danger-bg/30 px-3 py-2 text-sm text-danger">
      {message}
    </p>
  ) : null;
}

export function ModalActions({ children }: { children: ReactNode }) {
  return <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">{children}</div>;
}

export function Badge({ tone, children }: { tone: "brand" | "gold" | "muted" | "danger"; children: ReactNode }) {
  const t = {
    brand: "bg-primary/25 text-brand",
    gold: "bg-gold/15 text-gold",
    muted: "bg-raised text-muted",
    danger: "bg-danger-bg/40 text-danger",
  }[tone];
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${t}`}>{children}</span>;
}
