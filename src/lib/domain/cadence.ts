import type { CadenceAnchor, CadenceStepAction } from "@/generated/prisma/enums";

/**
 * How a cadence step reads on screen ("1 dia antes, às 18h · pedido de
 * confirmação"). Only the description: when a step really fires, with the send
 * window and the margin, is the Block 5 engine's job (D-07).
 */

/** Steps per cadence in the MVP (PRD 6: 1 to 6, up to 4 in the MVP). */
export const MAX_CADENCE_STEPS = 4;

type Step = { anchor: CadenceAnchor; offsetMinutes: number; fixedTime: string | null; action: CadenceStepAction };

const ACTION_LABELS: Record<CadenceStepAction, string> = {
  REQUEST_CONFIRMATION: "pedido de confirmação",
  REMINDER: "lembrete",
};

function amount(minutes: number) {
  if (minutes % 1440 === 0) return minutes === 1440 ? "1 dia" : `${minutes / 1440} dias`;
  if (minutes % 60 === 0) return `${minutes / 60} h`;
  return `${minutes} min`;
}

function hourText(time: string) {
  const [hour, minute] = time.split(":");
  return minute === "00" ? `${Number(hour)}h` : `${Number(hour)}h${minute}`;
}

export function describeCadenceStep(step: Step) {
  let when: string;
  if (step.anchor === "BOOKING") {
    when = step.offsetMinutes === 0 ? "Ao agendar" : `${amount(Math.abs(step.offsetMinutes))} depois de agendar`;
  } else if (step.offsetMinutes === 0) {
    when = "Na hora do atendimento";
  } else {
    const relative = `${amount(Math.abs(step.offsetMinutes))} ${step.offsetMinutes < 0 ? "antes" : "depois"}`;
    when = step.fixedTime ? `${relative}, às ${hourText(step.fixedTime)}` : relative;
  }
  return `${when} · ${ACTION_LABELS[step.action]}`;
}
