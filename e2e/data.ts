// Fixed data of the end-to-end tests, created by e2e/prepare-database.ts in the
// test database. Fictional names and a password used nowhere else.

export const E2E_PASSWORD = "e2e-agenda-2026";
export const SECRETARY_EMAIL = "secretaria.e2e@example.com";
export const MANAGER_EMAIL = "gestora.e2e@example.com";
export const PRACTICE_NAME = "Consultório E2E";
export const PROFESSIONAL_NAME = "Dra. Ana E2E";
export const TYPE_NAME = "Primeira consulta";

// The cadence flows (Block 5): the professional's WhatsAPI instance, with fixed id
// and token, so the test can call its webhook as WhatsAPI would.
export const INSTANCE_ID = "5e2e0000-0000-4000-8000-000000000001";
export const INSTANCE_TOKEN = "e2e-instance-token";
/** Asked to confirm by WhatsApp; the test answers "1". */
export const CONFIRMING_APPOINTMENT_ID = "5e2e0000-0000-4000-8000-000000000002";
export const CONFIRMING_PATIENT = { name: "Carla Régua E2E", phone: "+5585997770001" };
/** The last confirmation request went unanswered: on the "Sem confirmação" list. */
export const UNCONFIRMED_PATIENT = { name: "Paulo Sem Resposta E2E", phone: "+5585997770002" };

/** A calendar day `days` from today in Fortaleza (UTC-3, no daylight saving), "YYYY-MM-DD". */
export function fortalezaDay(days: number) {
  return new Date(Date.now() - 3 * 3_600_000 + days * 86_400_000).toISOString().slice(0, 10);
}

// Google Agenda (Block 6): a practice of its own, so the other flows keep their one
// practice and one professional. Its professional is linked to a sandbox Google
// account, and the spec plays the professional's side in Google with
// scripts/google-sandbox.ts (npm run google:sandbox).
export const GOOGLE_PRACTICE_NAME = "Clínica Google E2E";
export const GOOGLE_SECRETARY_EMAIL = "secretaria.google.e2e@example.com";
export const GOOGLE_PROFESSIONAL_NAME = "Dr. Caio Google E2E";
export const GOOGLE_ACCOUNT_EMAIL = "caio.google.e2e@example.com";
/** Exported to the professional's secondary calendar; the test drags its event in Google. */
export const GOOGLE_APPOINTMENT_ID = "5e2e0000-0000-4000-8000-000000000010";
export const GOOGLE_PATIENT = { name: "Gabriela Google E2E", phone: "+5585997770010" };

// SynkronosCRM (Block 7): a practice of its own, not connected yet: the manager
// connects it on the screen, and the spec plays the secretary's side in the CRM with
// scripts/crm-sandbox.ts (npm run crm:sandbox).
export const CRM_PRACTICE_NAME = "Clínica CRM E2E";
export const CRM_MANAGER_EMAIL = "gestora.crm.e2e@example.com";
export const CRM_SECRETARY_EMAIL = "secretaria.crm.e2e@example.com";
export const CRM_PROFESSIONAL_NAME = "Dra. Clara CRM E2E";
export const CRM_TOKEN = "sandbox-token-e2e";
/** Asked to confirm by WhatsApp; the secretary confirms in the CRM. */
export const CRM_APPOINTMENT_ID = "5e2e0000-0000-4000-8000-000000000020";
export const CRM_PATIENT = { name: "Renata CRM E2E", phone: "+5585997770020" };

// "Exigir 2FA" (PRD 11, D-71): a practice of its own, because the requirement stops
// everyone who reaches the practice and has not set it up.
export const TWO_FACTOR_PRACTICE_NAME = "Clínica 2FA E2E";
export const TWO_FACTOR_MANAGER_EMAIL = "gestora.2fa.e2e@example.com";
export const TWO_FACTOR_SECRETARY_EMAIL = "secretaria.2fa.e2e@example.com";
export const TWO_FACTOR_SECRETARY_NAME = "Secretária 2FA E2E";

// PWA and indicators (Block 8): a practice of its own, because the flows mark arrivals
// and read counts. Its professional has a login; the patients are all fictional.
export const PWA_PRACTICE_NAME = "Clínica PWA E2E";
export const PWA_PROFESSIONAL_EMAIL = "profissional.pwa.e2e@example.com";
export const PWA_PROFESSIONAL_NAME = "Dra. Paula PWA E2E";
export const PWA_SECRETARY_EMAIL = "secretaria.pwa.e2e@example.com";
export const PWA_MANAGER_EMAIL = "gestora.pwa.e2e@example.com";
/** Confirmed, later today: the next appointment on the screen. */
export const PWA_NEXT_PATIENT = { name: "Nina Próxima E2E", phone: "+5585997770030" };
export const PWA_CANCELED_PATIENT = { name: "Otávio Cancelado E2E", phone: "+5585997770031" };
/** Agendado, later today: the secretary confirms it and the professional hears. */
export const PWA_CONFIRM_APPOINTMENT_ID = "5e2e0000-0000-4000-8000-000000000030";
export const PWA_CONFIRM_PATIENT = { name: "Rita Confirma E2E", phone: "+5585997770032" };
/** Tomorrow, with a change made in Google waiting for the professional. */
export const PWA_GOOGLE_PATIENT = { name: "Gil Google E2E", phone: "+5585997770033" };
export const PWA_PAST_PATIENT = { name: "Passado Indicadores E2E", phone: "+5585997770034" };
