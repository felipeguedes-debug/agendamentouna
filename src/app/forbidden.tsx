import Link from "next/link";
import { AuthCard, linkClass } from "@/components/app-ui";

export default function Forbidden() {
  return (
    <AuthCard title="Sem permissão">
      <p className="text-sm text-zinc-700">Seu papel nesta conta não dá acesso a esta tela.</p>
      <p className="mt-4 text-sm">
        <Link href="/" className={linkClass}>
          Voltar para o início
        </Link>
      </p>
    </AuthCard>
  );
}
