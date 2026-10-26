import { prisma } from "@kanofood/db";

import { audit, snapshot } from "../admin/audit";
import type { OrderActor } from "../admin/orders";
import { platformPhone as envPhone, platformWhatsApp as envWhatsApp } from "../env";

/**
 * Platform settings that are read on a request path.
 *
 * Screen 7.12 in docs/UX_SPEC.md asks for an editable settings screen. Phase 5
 * shipped it read only because there was no table to write to; `PlatformSetting`
 * is that table, and this module is the only place it is read or written.
 *
 * **Two values, and that is the whole table on purpose.** Branding, session
 * lifetimes, storage and provider keys are read at startup by process-level code
 * and stay in the environment: a screen that rewrote them would change a row
 * nothing reads until the next restart, which looks like it worked. The contact
 * numbers are the opposite: they are read while a customer is standing on a
 * page, and a number that cannot be reached is a reason a launch stops.
 *
 * **The environment stays the fallback, and it wins when the table is empty.**
 * That keeps every existing deployment working with no migration of values, and
 * it means an operator clearing a number falls back to whatever the host is
 * configured with rather than to nothing.
 *
 * **A failure here never fails the page.** The contact line is a nicety; a
 * storefront or a tracking page that answers 500 because one row could not be
 * read is worse than a page with no phone number on it. So a database error is
 * caught and the environment values are used, and the screen says so when it is
 * the screen asking.
 */

export interface PlatformContact {
  /** The number customers call, or null when nothing is configured anywhere. */
  readonly phone: string | null;
  readonly whatsapp: string | null;
  /** What the row actually holds, which is what the settings form edits. */
  readonly storedPhone: string | null;
  readonly storedWhatsapp: string | null;
  /** Where the value in effect came from, for the settings screen. */
  readonly source: "database" | "environment";
  /** False when the table could not be read and the environment was used. */
  readonly readFromDatabase: boolean;
}

function trimmedOrNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/**
 * The contact numbers in effect.
 *
 * The environment is read per call rather than captured at module scope for the
 * same reason `lib/env.ts` is written that way: a module-scope read evaluates
 * during the build, where the values are absent on purpose.
 */
export async function loadPlatformContact(): Promise<PlatformContact> {
  const fromEnvironment: PlatformContact = {
    phone: envPhone(),
    whatsapp: envWhatsApp(),
    storedPhone: null,
    storedWhatsapp: null,
    source: "environment",
    readFromDatabase: false,
  };

  let row: { platformPhone: string | null; platformWhatsapp: string | null } | null;
  try {
    row = await prisma.platformSetting.findUnique({
      where: { id: 1 },
      select: { platformPhone: true, platformWhatsapp: true },
    });
  } catch {
    // Covered above: an unreadable settings row is not a reason to fail a page.
    return fromEnvironment;
  }

  if (!row) return fromEnvironment;

  const phone = trimmedOrNull(row.platformPhone);
  const whatsapp = trimmedOrNull(row.platformWhatsapp);
  const usedDatabase = phone !== null || whatsapp !== null;

  return {
    phone: phone ?? fromEnvironment.phone,
    whatsapp: whatsapp ?? fromEnvironment.whatsapp,
    storedPhone: phone,
    storedWhatsapp: whatsapp,
    source: usedDatabase ? "database" : "environment",
    readFromDatabase: true,
  };
}

export interface PlatformContactInput {
  readonly phone?: string | null;
  readonly whatsapp?: string | null;
}

/**
 * Write the contact numbers.
 *
 * An absent field means "leave it alone" and a null means "clear it", which is
 * the same three-state rule `nullableNumberField` documents for a kitchen's
 * coordinate: a form that submits one field must not silently clear the other.
 *
 * The audit row commits in the same transaction as the change, so a settings
 * change without its record, or a record without the change, cannot happen.
 */
export async function savePlatformContact(input: {
  readonly patch: PlatformContactInput;
  readonly actor: OrderActor;
}): Promise<void> {
  const before = await prisma.platformSetting.findUnique({ where: { id: 1 } });

  const data: Record<string, unknown> = { updatedByUserId: input.actor.userId };
  if (input.patch.phone !== undefined) data.platformPhone = input.patch.phone;
  if (input.patch.whatsapp !== undefined) data.platformWhatsapp = input.patch.whatsapp;

  await prisma.$transaction(async (tx) => {
    const after = await tx.platformSetting.upsert({
      where: { id: 1 },
      // The row is created by the migration, so this branch exists for a database
      // restored from before it rather than for the normal path.
      create: { id: 1, ...data },
      update: data,
    });

    await audit(
      {
        actorUserId: input.actor.userId,
        actorRole: "admin",
        action: "settings.updated",
        entityType: "platform_settings",
        entityId: "1",
        before: snapshot({
          platformPhone: before?.platformPhone ?? null,
          platformWhatsapp: before?.platformWhatsapp ?? null,
        }),
        after: snapshot({
          platformPhone: after.platformPhone,
          platformWhatsapp: after.platformWhatsapp,
        }),
      },
      tx,
    );
  });
}
