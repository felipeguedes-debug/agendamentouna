"use client";

import { inferAdditionalFields, twoFactorClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

/**
 * Browser client for the auth endpoints. Sign-in, Google, two-factor and sign-out
 * go through /api/auth, where Better Auth sets the cookies and applies its rate
 * limiter; Server Actions calling auth.api would skip the limiter.
 */
export const authClient = createAuthClient({
  plugins: [twoFactorClient(), inferAdditionalFields({ session: { rememberedDevice: { type: "boolean", required: false, input: false } } })],
});

/** The session and its cookie last 30 days from now (D-77). Better Auth refuses a POST with no JSON body. */
export function rememberThisDevice() {
  return authClient.$fetch("/remember-device", { method: "POST", body: {} });
}

type AuthClientError = { status?: number; code?: string } | null | undefined;

export function signInErrorText(error: AuthClientError) {
  if (error?.status === 429) return "Muitas tentativas. Aguarde um pouco e tente de novo.";
  if (error?.status === 401) return "E-mail ou senha incorretos.";
  return "Não foi possível entrar. Tente de novo.";
}

export function secondFactorErrorText(error: AuthClientError) {
  switch (error?.code) {
    case "INVALID_CODE":
    case "INVALID_BACKUP_CODE":
      return "Código inválido. Confira e tente de novo.";
    case "INVALID_TWO_FACTOR_COOKIE":
    case "TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE":
      return "A verificação expirou ou passou do limite de tentativas. Entre de novo.";
    case "ACCOUNT_TEMPORARILY_LOCKED":
      return "Muitas tentativas erradas. Sua conta está bloqueada por 15 minutos.";
  }
  if (error?.status === 429) return "Muitas tentativas. Aguarde um pouco e tente de novo.";
  return "Não foi possível verificar o código. Tente de novo.";
}
