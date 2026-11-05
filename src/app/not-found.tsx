import Link from "next/link";
import { AuthCard, linkClass } from "@/components/app-ui";

export default function NotFound() {
  return (
    <AuthCard title="Página não encontrada">
      <p className="text-sm text-zinc-700">O endereço não existe ou você não tem acesso a ele.</p>
      <p className="mt-4 text-sm">
        <Link href="/" className={linkClass}>
          Voltar para o início
        </Link>
      </p>
    </AuthCard>
  );
}
