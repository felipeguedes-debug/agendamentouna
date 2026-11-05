/** Money in cents (Int, `...Cents` fields), shown and typed in Brazilian reais. */

const reais = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const wholeReais = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });

/** "R$ 1.200,50"; compact drops ",00", as the mockups show values ("R$ 800"). */
export function formatCents(cents: number, options: { compact?: boolean } = {}) {
  if (options.compact && cents % 100 === 0) return `R$ ${wholeReais.format(cents / 100)}`;
  return `R$ ${reais.format(cents / 100)}`;
}

// "800", "800,5", "1.200,50": dots only as thousands separators, comma for cents.
const MONEY = /^(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?$/;

/** Cents from what a person types in a value field, or null when it is not a valid amount. */
export function parseMoneyToCents(input: string): number | null {
  const value = input.replace(/^\s*R\$\s*/, "").trim();
  const match = MONEY.exec(value);
  if (!match) return null;
  const whole = Number(match[1].replaceAll(".", ""));
  const cents = Number((match[2] ?? "0").padEnd(2, "0"));
  const total = whole * 100 + cents;
  return Number.isSafeInteger(total) ? total : null;
}
