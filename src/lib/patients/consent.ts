import type { PracticeContext } from "@/lib/auth/access";
import { can } from "@/lib/auth/permissions";
import { isUuid } from "@/lib/db";
import { AgendaError } from "@/lib/agenda/errors";
import { applyConsentToCadence } from "@/lib/cadence/plan";
import { consentStateOf, isManualConsentChannel, type ConsentState, type ManualConsentChannel } from "@/lib/domain/consent";

export { consentStateOf, isManualConsentChannel, MANUAL_CONSENT_CHANNELS, type ConsentState, type ManualConsentChannel } from "@/lib/domain/consent";

/**
 * Contact consent for the WhatsApp cadence (PRD 6 rule 1, PRD 7 LGPD; D-19, D-47).
 * `ContactConsent` is an append-only log, enforced by a database trigger: giving
 * and revoking consent are new rows with date and channel, and the latest row is
 * the current state. Without any row the patient stays out of the cadence.
 * Revoking cancels the patient's scheduled dispatches and granting plans the future
 * appointments (src/lib/cadence/plan.ts). The PARAR reply revokes through the
 * cadence (src/lib/cadence/replies.ts); here the office records it by hand.
 */

const ORG_ADMIN_AUTHOR = "Admin da organização";

/** The latest row of each patient, keyed by patient id. */
export async function latestConsents({ db }: PracticeContext, patientIds: string[]) {
  if (patientIds.length === 0) return new Map<string, ConsentState>();
  const rows = await db.contactConsent.findMany({
    where: { patientId: { in: patientIds } },
    orderBy: [{ recordedAt: "desc" }, { id: "desc" }],
    distinct: ["patientId"],
    select: { patientId: true, granted: true },
  });
  return new Map(rows.map((row) => [row.patientId, consentStateOf(row)]));
}

export async function currentConsent(context: PracticeContext, patientId: string): Promise<ConsentState> {
  return (await latestConsents(context, [patientId])).get(patientId) ?? "unknown";
}

/** The log, latest first, with the name of who recorded each row. */
export async function consentHistory({ db }: PracticeContext, patientId: string) {
  const rows = await db.contactConsent.findMany({ where: { patientId }, orderBy: [{ recordedAt: "desc" }, { id: "desc" }] });
  const authorIds = [...new Set(rows.flatMap((row) => (row.recordedByUserId ? [row.recordedByUserId] : [])))];
  // Members of the practice, revoked ones included; an organization admin has no membership.
  const authors = new Map((await db.user.findMany({ where: { id: { in: authorIds } }, select: { id: true, name: true } })).map((user) => [user.id, user.name]));
  return rows.map((row) => ({
    id: row.id,
    granted: row.granted,
    channel: row.channel,
    recordedAt: row.recordedAt,
    recordedByName: row.recordedByUserId ? (authors.get(row.recordedByUserId) ?? ORG_ADMIN_AUTHOR) : null,
  }));
}

/**
 * Records consent (granted) or its refusal or revocation. A row that would not
 * change the current state is refused, so a double click records once.
 */
export async function recordConsent(context: PracticeContext, input: { patientId: string; granted: boolean; channel: ManualConsentChannel }) {
  const { user, access, db } = context;
  if (!can(access.role, "patients:consent")) throw new AgendaError("not_allowed", "Cannot record consent");
  if (!isManualConsentChannel(input.channel)) throw new AgendaError("invalid_channel", "Invalid consent channel");
  const patient = isUuid(input.patientId) ? await db.patient.findFirst({ where: { id: input.patientId, anonymizedAt: null }, select: { id: true } }) : null;
  if (!patient) throw new AgendaError("patient_unavailable", "Patient not found");

  await db.$transaction(async (tx) => {
    const latest = await tx.contactConsent.findFirst({ where: { patientId: patient.id }, orderBy: [{ recordedAt: "desc" }, { id: "desc" }] });
    if (latest && latest.granted === input.granted) throw new AgendaError("consent_unchanged", "Consent already in this state");
    const consent = await tx.contactConsent.create({
      data: { practiceId: access.practiceId, patientId: patient.id, granted: input.granted, channel: input.channel, recordedByUserId: user.id },
    });
    await tx.auditEvent.create({
      data: {
        practiceId: access.practiceId,
        actorType: "USER",
        actorUserId: user.id,
        action: "contact_consent.recorded",
        entityType: "ContactConsent",
        entityId: consent.id,
        changedFields: ["granted", "channel"],
      },
    });
    await applyConsentToCadence(tx, patient.id, input.granted, new Date());
  });
}
