/**
 * Create an admin, so somebody can sign in.
 *
 * Phase 5 shipped an admin interface with no way to produce the account that
 * opens it. The seed creates no user and says why in its own header — hashing a
 * password belongs to the auth phase — and that phase is now over, so what was a
 * deferral is a hole: a fresh clone can install, migrate and boot, and nobody
 * can get past the sign-in screen.
 *
 * A CLI rather than a screen, because an admin-creating screen would need an
 * admin to reach it. That is the problem it would be solving.
 *
 *   npm run create-admin -- --phone 08012345678 --name "Yoyo"
 *   npm run create-admin -- --email me@example.com
 *
 * The password is read from `ADMIN_PASSWORD`, or from `--password`, and when
 * neither is given one is generated and printed exactly once. Generating by
 * default is deliberate: a password typed on the command line is in the shell
 * history and in the process listing, and the habit is what leaks, not this
 * particular password.
 */

import { randomBytes } from "node:crypto";
import { parseArgs } from "node:util";

import { prisma } from "@kanofood/db";

import { hashPassword } from "../lib/auth/password.ts";

const { values } = parseArgs({
  options: {
    phone: { type: "string" },
    email: { type: "string" },
    name: { type: "string" },
    password: { type: "string" },
  },
  allowPositionals: false,
});

const phone = values.phone?.trim() || null;
const email = values.email?.trim().toLowerCase() || null;
const name = values.name?.trim() || "Admin";

if (!phone && !email) {
  console.error("Give a --phone or an --email. One of the two identifies the account.");
  process.exit(1);
}

/**
 * Only ASCII letters and digits, and no look-alike pairs: this string gets read
 * off a terminal and typed into a sign-in form, so `l` next to `1` and `O` next
 * to `0` are a support call. 24 characters from a 32-symbol alphabet is ~120
 * bits, which is far past what a password needs.
 */
function generatePassword(): string {
  const alphabet = "abcdefghijkmnpqrstuvwxyz23456789";
  const bytes = randomBytes(24);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

async function main(): Promise<void> {
  // Refuse rather than update. A script that silently resets an existing
  // account's password is a way to lock out the person who owns it, and
  // "I re-ran the setup script" is not something anybody should have to
  // discover after the fact.
  const existing = await prisma.user.findFirst({
    where: { OR: [...(phone ? [{ phone }] : []), ...(email ? [{ email }] : [])] },
    select: { id: true, phone: true, email: true, role: true },
  });

  if (existing) {
    console.error(
      `A user already exists on that phone or email (id ${existing.id}, role ${existing.role}).`,
    );
    console.error("Nothing was changed. Pick a different phone or email, or sign in as them.");
    process.exitCode = 1;
    return;
  }

  const supplied = values.password ?? process.env.ADMIN_PASSWORD ?? null;
  const password = supplied ?? generatePassword();

  const user = await prisma.user.create({
    data: {
      role: "admin",
      name,
      phone,
      email,
      passwordHash: await hashPassword(password),
    },
    select: { id: true, name: true, phone: true, email: true },
  });

  console.log("Admin created.");
  console.log(`  id    ${user.id}`);
  console.log(`  name  ${user.name}`);
  if (user.phone) console.log(`  phone ${user.phone}`);
  if (user.email) console.log(`  email ${user.email}`);

  if (supplied) {
    console.log("  password  the one you supplied");
  } else {
    console.log("");
    console.log(`  password  ${password}`);
    console.log("");
    console.log("Shown once — it is stored only as a hash. Save it now.");
  }
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
