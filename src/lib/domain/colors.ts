import type { AppointmentCategory } from "@/generated/prisma/enums";

/**
 * Colors of appointment types (PRD 4): one per type, from the mockup palette, with
 * a light tint for the agenda cards. The category suggests the family (D-25, D-42).
 */

export const TYPE_COLORS = [
  { hex: "#0F766E", label: "Verde", tint: "#E6F4F1" },
  { hex: "#3B5BDB", label: "Azul", tint: "#EEF2FB" },
  { hex: "#D97706", label: "Laranja", tint: "#FEF3E2" },
  { hex: "#7C3AED", label: "Roxo", tint: "#F3EEFB" },
  { hex: "#DB2777", label: "Rosa", tint: "#FCE7F3" },
  { hex: "#9AA6A2", label: "Cinza", tint: "#F4F6F5" },
] as const;

export const CATEGORY_COLORS: Record<AppointmentCategory, string> = {
  CONSULTATION: "#0F766E",
  FOLLOW_UP: "#3B5BDB",
  PROCEDURE: "#D97706",
  EXAM: "#7C3AED",
  TELECONSULTATION: "#0F766E",
  BLOCK: "#9AA6A2",
};

export const BLOCK_COLOR = { hex: "#9AA6A2", tint: "#F4F6F5" };

export function findTypeColor(hex: string) {
  return TYPE_COLORS.find((color) => color.hex.toLowerCase() === hex.toLowerCase());
}

export function tintOf(hex: string) {
  return findTypeColor(hex)?.tint ?? BLOCK_COLOR.tint;
}
