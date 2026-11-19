// Client-side mirror of the server password policy (the server is authoritative).
export const passwordChecks = (pw: string) => [
  { ok: pw.length >= 8 && pw.length <= 128, label: "8 bis 128 Zeichen" },
  { ok: /\p{Ll}/u.test(pw), label: "Kleinbuchstabe" },
  { ok: /\p{Lu}/u.test(pw), label: "Großbuchstabe" },
  { ok: /[0-9]/.test(pw), label: "Ziffer" },
  { ok: /[^\p{L}\p{N}]/u.test(pw), label: "Sonderzeichen" },
];

export function generatePassword(): string {
  const pick = (set: string) => set[randomInt(set.length)] as string;
  const lower = "abcdefghijkmnopqrstuvwxyz";
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const digit = "23456789";
  const special = "!#$%&*+-=?@_";
  const chars = [pick(lower), pick(upper), pick(digit), pick(special)];
  const all = lower + upper + digit + special;
  while (chars.length < 16) chars.push(pick(all));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j] as string, chars[i] as string];
  }
  return chars.join("");
}

function randomInt(max: number): number {
  const a = new Uint32Array(1);
  const limit = Math.floor(0x100000000 / max) * max;
  do crypto.getRandomValues(a);
  while ((a[0] as number) >= limit);
  return (a[0] as number) % max;
}
