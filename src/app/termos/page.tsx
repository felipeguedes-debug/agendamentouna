import type { Metadata } from "next";
import { TERMS_VERSION } from "@/lib/legal/terms";
import { Alert, AuthCard } from "@/components/app-ui";

export const metadata: Metadata = { title: "Termos de uso" };

// Provisional text until the legal text arrives (D-38). Changing the terms means a
// new TERMS_VERSION; User.termsVersion records which version each person accepted.
export default function TermsPage() {
  return (
    <AuthCard title="Termos de uso" subtitle={`Versão ${TERMS_VERSION}`}>
      <div className="space-y-4 text-sm leading-6 text-zinc-700">
        <Alert tone="info">Texto provisório. A versão definitiva será publicada antes do uso com pacientes reais.</Alert>
        <p>
          Esta agenda é usada por consultórios para marcar atendimentos, sincronizar o Google Agenda dos profissionais e
          enviar lembretes por WhatsApp. Ao criar seu acesso, você se compromete a usá-la só para a operação dos
          consultórios em que foi convidado.
        </p>
        <p>
          Os dados de pacientes são dados pessoais, e a existência de um atendimento já é dado sensível pela LGPD. Não
          compartilhe seu acesso, não copie dados de pacientes para fora do sistema e avise o gestor da conta se
          suspeitar de uso indevido.
        </p>
        <p>
          Suas ações na agenda ficam registradas, com autor, data e conta, na trilha de auditoria exposta ao gestor.
          Quando seu acesso a uma conta é encerrado, o histórico das suas ações permanece.
        </p>
      </div>
    </AuthCard>
  );
}
