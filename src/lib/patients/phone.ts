/**
 * Patients' phones (PRD 3): stored in E.164 and unique per practice, since the
 * import deduplicates on them (D-18). Brazilian numbers need the area code; a
 * nine-digit number is a mobile and starts with 9.
 */

export function phoneDigits(input: string) {
  return input.replace(/\D/g, "");
}

export function normalizePhone(input: string): string | null {
  let digits = phoneDigits(input);
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) digits = digits.slice(2);
  else if (digits.startsWith("0") && (digits.length === 11 || digits.length === 12)) digits = digits.slice(1);
  if (digits.length !== 10 && digits.length !== 11) return null;
  const areaCode = digits.slice(0, 2);
  const number = digits.slice(2);
  if (areaCode.startsWith("0")) return null;
  if (number.length === 9 && !number.startsWith("9")) return null;
  return `+55${digits}`;
}

/**
 * The E.164 forms of one mobile. Numbers registered before the ninth digit often keep
 * the old 8-digit form in WhatsApp ("+558598124455"), so both are tried, the given one first.
 */
export function phoneVariants(phone: string) {
  const match = /^\+55(\d{2})(\d{8,9})$/.exec(phone);
  if (!match) return [phone];
  const [, areaCode, local] = match;
  if (local.length === 8 && /^[6-9]/.test(local)) return [phone, `+55${areaCode}9${local}`];
  if (local.length === 9 && local.startsWith("9")) return [phone, `+55${areaCode}${local.slice(1)}`];
  return [phone];
}

/** "(85) 99812-4455" for a Brazilian number; anything else as stored. */
export function formatPhone(phone: string | null) {
  if (!phone) return "";
  const match = /^\+55(\d{2})(\d{4,5})(\d{4})$/.exec(phone);
  return match ? `(${match[1]}) ${match[2]}-${match[3]}` : phone;
}
