import { AgendaError } from "@/lib/agenda/errors";
import { listUsersWithoutTwoFactor, type PracticeContext } from "./access";
import { can } from "./permissions";

/**
 * "Exigir 2FA" of Configurações da conta (PRD 11; D-16, D-36, D-71). The switch is the
 * practice's, but its effect is the user's: the guard (`requireUser`) sends whoever
 * reaches a practice that requires it and has not set it up to the security page, on
 * every page of every practice. So the screen says who that is before the manager
 * decides, and the manager's own case apart.
 */

export type TwoFactorRequirement = {
  required: boolean;
  /** The user looking at the screen has not set it up, and would be stopped too. */
  currentUserMissing: boolean;
  /** Names of the others who reach the practice and have not set it up. */
  othersMissing: string[];
};

function assertManages({ access }: PracticeContext) {
  if (!can(access.role, "practice-settings:edit")) throw new AgendaError("not_allowed", "Only the manager changes the two-factor requirement");
}

export async function getTwoFactorRequirement(context: PracticeContext): Promise<TwoFactorRequirement> {
  assertManages(context);
  const { access, user } = context;
  const missing = await listUsersWithoutTwoFactor(access);
  return {
    required: access.requireTwoFactor,
    currentUserMissing: missing.some((person) => person.id === user.id),
    othersMissing: missing
      .filter((person) => person.id !== user.id)
      .map((person) => person.name)
      .sort((a, b) => a.localeCompare(b, "pt-BR")),
  };
}

/** Takes the value wanted, not a toggle: a second tab on an old screen does not undo the first. */
export async function setTwoFactorRequired(context: PracticeContext, required: boolean) {
  assertManages(context);
  const { access, db, user } = context;
  const current = await db.practice.findFirstOrThrow({ select: { requireTwoFactor: true } });
  if (current.requireTwoFactor === required) return;
  await db.$transaction(async (tx) => {
    await tx.practice.update({ where: { id: access.practiceId }, data: { requireTwoFactor: required } });
    await tx.auditEvent.create({
      data: {
        practiceId: access.practiceId,
        actorType: "USER",
        actorUserId: user.id,
        action: required ? "practice.two_factor_required" : "practice.two_factor_not_required",
        entityType: "Practice",
        entityId: access.practiceId,
        changedFields: ["requireTwoFactor"],
      },
    });
  });
}
