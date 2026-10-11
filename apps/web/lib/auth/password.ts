import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

/**
 * Password hashing.
 *
 * **scrypt, not bcrypt or argon2id.** Section 7 of ARCHITECTURE.md originally
 * named those two; that line was changed to name scrypt on 2026-10-09 with the
 * project owner's agreement, so what follows is now the record of why the
 * document reads the way it does rather than a departure from it.
 *
 * The reason is this machine and this dependency graph rather than a preference:
 *
 * - bcrypt and argon2id both arrive as packages. The native ones need a compiler
 *   this box does not have, and the pure-JavaScript bcrypt is slower than what
 *   Node already ships.
 * - `node:crypto` includes scrypt, implemented in OpenSSL, so it is native
 *   speed with no install, no build step and no supply-chain surface.
 * - scrypt is memory hard and is the third entry on the OWASP Password Storage
 *   cheat sheet, behind only the two originally named. It is not a weaker
 *   choice; it is a different member of the same family.
 *
 * Switching to argon2id later means adding a branch here: the stored format
 * below is self-describing, so both can be verified side by side while existing
 * passwords are re-hashed on next sign-in.
 *
 * Parameters are stored with the hash rather than assumed, so raising them later
 * does not invalidate existing passwords.
 */

const ALGORITHM = "scrypt";
const N = 32_768; // CPU and memory cost. Must be a power of two.
const R = 8; // Block size.
const P = 1; // Parallelisation.
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

/**
 * OpenSSL refuses an scrypt call whose working set exceeds `maxmem`, and the
 * default is 32 MB. The parameters above need 128 * N * r, which is 32 MB
 * exactly, so the default would fail on a boundary. Twice the requirement
 * leaves headroom without permitting an absurd one.
 */
const MAX_MEM = 128 * N * R * 2;

const scrypt = promisify(scryptCallback) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

async function derive(password: string, salt: Buffer, n: number, r: number, p: number) {
  return scrypt(password.normalize("NFKC"), salt, KEY_LENGTH, { N: n, r, p, maxmem: MAX_MEM });
}

/**
 * Hash a password into a self-describing string:
 * `scrypt$N$r$p$<salt base64>$<hash base64>`.
 */
export async function hashPassword(password: string): Promise<string> {
  if (password.length < 8) {
    throw new Error("A password must be at least 8 characters.");
  }

  const salt = randomBytes(SALT_LENGTH);
  const hash = await derive(password, salt, N, R, P);

  return [ALGORITHM, N, R, P, salt.toString("base64"), hash.toString("base64")].join("$");
}

/**
 * Check a password against a stored hash.
 *
 * Returns false rather than throwing on a malformed or absent hash: a user row
 * with no password must fail sign-in the same way a wrong password does, so the
 * caller cannot tell the two apart and neither can an attacker.
 */
export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  if (!stored) return false;

  const parts = stored.split("$");
  if (parts.length !== 6) return false;

  const [algorithm, nRaw, rRaw, pRaw, saltRaw, hashRaw] = parts;
  if (algorithm !== ALGORITHM) return false;

  const n = Number(nRaw);
  const r = Number(rRaw);
  const p = Number(pRaw);
  if (!Number.isSafeInteger(n) || !Number.isSafeInteger(r) || !Number.isSafeInteger(p)) {
    return false;
  }
  // A stored cost far above the current one is either corruption or a
  // denial-of-service payload. Refuse rather than spend the memory.
  if (n > N * 4 || r > 32 || p > 8) return false;

  const salt = Buffer.from(saltRaw ?? "", "base64");
  const expected = Buffer.from(hashRaw ?? "", "base64");
  if (salt.length === 0 || expected.length !== KEY_LENGTH) return false;

  let actual: Buffer;
  try {
    actual = await derive(password, salt, n, r, p);
  } catch {
    return false;
  }

  return timingSafeEqual(actual, expected);
}

/**
 * A password hash never belongs in a response, a log or an error message. This
 * is here so the intent is explicit at the call sites that strip it.
 */
export const PASSWORD_FIELDS = ["passwordHash"] as const;
