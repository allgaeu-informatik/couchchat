import { z } from "zod";

export const USERNAME_RE = /^[a-z0-9._-]{3,32}$/;
const ROOM_RE = /^[A-Za-z0-9._-]{1,128}$/;

export const usernameSchema = z
  .string({ error: "Benutzername fehlt." })
  .trim()
  .toLowerCase()
  .regex(USERNAME_RE, "Benutzername: 3-32 Zeichen, nur a-z, 0-9, Punkt, Unterstrich, Bindestrich.");

export const displaynameSchema = z
  .string({ error: "Name fehlt." })
  .trim()
  .min(1, "Name darf nicht leer sein.")
  .max(64, "Name: höchstens 64 Zeichen.");

/** Password as typed: only a sanity limit here; the policy check lives in security/password.ts. */
export const passwordInput = z.string({ error: "Passwort fehlt." }).max(128, "Passwort: höchstens 128 Zeichen.");

export const roleSchema = z.enum(["admin", "user"], { error: "Ungültige Rolle." });

export const allowedRoomsSchema = z
  .array(
    z
      .string()
      .trim()
      .refine((r) => r === "*" || ROOM_RE.test(r), "Ungültiger Raumname."),
    { error: "Ungültige Raumliste." },
  )
  .min(1, "Mindestens ein Raum oder * (alle).")
  .max(200)
  .transform((a) => (a.includes("*") ? ["*"] : [...new Set(a)]));

export const loginSchema = z.strictObject({
  username: z.string().max(64),
  password: z.string().max(256),
});

export const selfUpdateSchema = z
  .strictObject({ username: usernameSchema.optional(), displayname: displaynameSchema.optional() })
  .refine((v) => v.username !== undefined || v.displayname !== undefined, { message: "Keine Änderung angegeben." });

export const createUserSchema = z.strictObject({
  username: usernameSchema,
  displayname: displaynameSchema,
  password: passwordInput,
  role: roleSchema.default("user"),
  allowedRooms: allowedRoomsSchema.default(["*"]),
  active: z.boolean().default(true),
});

export const adminUpdateSchema = z
  .strictObject({
    username: usernameSchema.optional(),
    displayname: displaynameSchema.optional(),
    role: roleSchema.optional(),
    allowedRooms: allowedRoomsSchema.optional(),
    active: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Keine Änderung angegeben." });

export const ownPasswordSchema = z.strictObject({
  currentPassword: z.string().max(256),
  newPassword: passwordInput,
});

export const resetPasswordSchema = z.strictObject({ newPassword: passwordInput });
