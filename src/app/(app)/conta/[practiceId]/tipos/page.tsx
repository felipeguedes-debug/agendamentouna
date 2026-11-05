import type { Metadata } from "next";
import Link from "next/link";
import type { AppointmentCategory } from "@/generated/prisma/enums";
import { PageHeader } from "@/components/app-ui";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listAppointmentTypes, TYPE_CATEGORIES, type AppointmentTypeRow } from "@/lib/appointment-types/appointment-types";
import { requirePracticePermission } from "@/lib/auth/guard";
import { can } from "@/lib/auth/permissions";
import { CATEGORY_COLORS } from "@/lib/domain/colors";
import { CATEGORY_LABELS } from "@/lib/domain/labels";
import { formatCents } from "@/lib/domain/money";
import { cn } from "@/lib/utils";
import { ToggleTypeButton, TypeForm, type TypeFormValues } from "./type-form";

export const metadata: Metadata = { title: "Tipos de atendimento" };

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function centsToInput(cents: number) {
  return formatCents(cents).replace("R$ ", "");
}

function formValues(type: AppointmentTypeRow | null): TypeFormValues {
  if (!type) {
    return { id: null, name: "", displayName: "", category: "CONSULTATION", durationMinutes: "30", price: "", color: CATEGORY_COLORS.CONSULTATION, preparation: "", cadenceId: "", prices: {} };
  }
  return {
    id: type.id,
    name: type.name,
    displayName: type.displayName ?? "",
    category: type.category,
    durationMinutes: String(type.durationMinutes),
    price: centsToInput(type.defaultPriceCents),
    color: type.color,
    preparation: type.preparation ?? "",
    cadenceId: type.cadenceId ?? "",
    prices: Object.fromEntries(type.professionalPrices.map((price) => [price.professionalId, centsToInput(price.priceCents)])),
  };
}

/** "Tipos de atendimento" (PRD 4, mockup TiposAtendimento): table, category chips and the inline form. */
export default async function AppointmentTypesPage({ params, searchParams }: PageProps<"/conta/[practiceId]/tipos">) {
  const { practiceId } = await params;
  const context = await requirePracticePermission(practiceId, ["appointment-types:view", "appointment-types:view-own"]);
  const { access, db } = context;
  const query = await searchParams;
  const canEdit = can(access.role, "appointment-types:edit");
  const ownOnly = !can(access.role, "appointment-types:view");
  const types = await listAppointmentTypes(context);

  const categoryParam = first(query.categoria);
  const category = (TYPE_CATEGORIES as readonly string[]).includes(categoryParam ?? "") ? (categoryParam as AppointmentCategory) : null;
  const editId = canEdit ? first(query.editar) : undefined;
  const editing = editId === "novo" ? null : types.find((type) => type.id === editId);
  const showForm = canEdit && (editId === "novo" || Boolean(editing));
  const [cadences, professionals] = showForm
    ? await Promise.all([
        db.cadence.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
        db.professional.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
      ])
    : [[], []];

  const visible = category ? types.filter((type) => type.category === category) : types;
  const base = `/conta/${practiceId}/tipos`;
  const chip = (active: boolean) =>
    cn("inline-flex h-8 items-center rounded-full px-3 text-sm", active ? "bg-foreground font-semibold text-white" : "border border-input bg-white text-[#3A4542] hover:bg-muted");

  return (
    <>
      <div className="flex flex-wrap items-start gap-3">
        <PageHeader
          title="Tipos de atendimento"
          description={
            ownOnly
              ? "Os tipos desta conta com o seu valor."
              : "Cada tipo carrega categoria, duração, valor, cor e régua. A secretária escolhe o tipo e o resto vem preenchido."
          }
        />
        {canEdit ? (
          <Link href={`${base}?editar=novo`} className={cn(buttonVariants({ size: "lg" }), "ml-auto")}>
            + Novo tipo
          </Link>
        ) : null}
      </div>

      <nav aria-label="Categorias" className="mb-4 flex flex-wrap gap-2">
        <Link href={base} className={chip(!category)}>
          Todos · {types.length}
        </Link>
        {TYPE_CATEGORIES.map((option) => {
          const count = types.filter((type) => type.category === option).length;
          return count > 0 ? (
            <Link key={option} href={`${base}?categoria=${option}`} className={chip(category === option)}>
              {CATEGORY_LABELS[option]} · {count}
            </Link>
          ) : null;
        })}
      </nav>

      {showForm ? (
        <div className="mb-6">
          <TypeForm
            key={editing?.id ?? "novo"}
            practiceId={practiceId}
            values={formValues(editing ?? null)}
            categories={[...TYPE_CATEGORIES]}
            cadences={cadences}
            professionals={professionals}
          />
        </div>
      ) : null}

      <section className="rounded-xl border border-border bg-white">
        <Table className="min-w-[820px]">
          <TableHeader>
            <TableRow className="text-xs tracking-wide text-muted-foreground uppercase">
              <TableHead className="px-4">Tipo</TableHead>
              <TableHead>Categoria</TableHead>
              <TableHead>Duração</TableHead>
              <TableHead>Valor</TableHead>
              <TableHead>Régua</TableHead>
              <TableHead>Preparo</TableHead>
              <TableHead>Online</TableHead>
              {canEdit ? <TableHead className="sr-only">Ações</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="px-4 py-6 text-center text-muted-foreground">
                  Nenhum tipo de atendimento.
                </TableCell>
              </TableRow>
            ) : null}
            {visible.map((type) => (
              <TableRow key={type.id} className={cn(!type.active && "text-muted-foreground")}>
                <TableCell className="px-4 py-3">
                  <span className="inline-flex items-center gap-2.5 font-semibold">
                    <span className="size-3 rounded-sm" style={{ background: type.color }} />
                    {type.name}
                    {!type.active ? <Badge variant="outline">Inativo</Badge> : null}
                  </span>
                  {type.displayName ? <span className="block pl-5.5 text-xs text-muted-foreground">Exibido como {type.displayName}</span> : null}
                </TableCell>
                <TableCell>{CATEGORY_LABELS[type.category]}</TableCell>
                <TableCell>{type.durationMinutes} min</TableCell>
                <TableCell className="font-semibold">
                  {formatCents(type.priceCents, { compact: true })}
                  {type.professionalPrices.length > 0 ? (
                    <span className="block text-xs font-normal text-muted-foreground">
                      {type.professionalPrices.map((price) => `${price.professionalName}: ${formatCents(price.priceCents, { compact: true })}`).join(" · ")}
                    </span>
                  ) : null}
                </TableCell>
                <TableCell>{type.cadenceName ?? "—"}</TableCell>
                <TableCell className="max-w-56 whitespace-normal text-muted-foreground">{type.preparation ?? "—"}</TableCell>
                <TableCell>
                  <span className="text-xs font-semibold text-muted-foreground">Fase 3</span>
                </TableCell>
                {canEdit ? (
                  <TableCell className="pr-4 text-right whitespace-nowrap">
                    <Link href={`${base}?editar=${type.id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                      Editar
                    </Link>{" "}
                    <ToggleTypeButton practiceId={practiceId} typeId={type.id} active={type.active} />
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>
    </>
  );
}
