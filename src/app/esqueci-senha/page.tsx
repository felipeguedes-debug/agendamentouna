import type { Metadata } from "next";
import { AccessScreen } from "@/components/app-ui";
import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata: Metadata = { title: "Esqueci minha senha" };

/** "Esqueci minha senha" (D-88). Public: whoever forgot has no session. */
export default function ForgotPasswordPage() {
  return (
    <AccessScreen title="Esqueci minha senha" subtitle="Informe o e-mail da sua conta. Enviamos um link para você criar uma senha nova.">
      <ForgotPasswordForm />
    </AccessScreen>
  );
}
