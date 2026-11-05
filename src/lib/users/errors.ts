/** Expected failures of invitations and member management, with the text shown to the user. */

export const USERS_ERROR_TEXT = {
  not_allowed: "Você não tem permissão para isso nesta conta.",
  role_not_allowed: "Você não pode convidar ou gerenciar esse papel.",
  invalid_email: "Informe um e-mail válido.",
  professional_required: "Escolha o cadastro de profissional que a pessoa vai usar.",
  professional_unavailable: "Esse cadastro de profissional não está disponível.",
  already_member: "Essa pessoa já tem acesso a esta conta.",
  not_found: "Convite ou usuário não encontrado.",
  expired: "Este convite expirou. Peça um novo a quem convidou você.",
  used: "Este convite já foi usado.",
  revoked: "Este convite foi cancelado.",
  terms_required: "Para continuar, aceite os termos de uso.",
  name_required: "Informe seu nome.",
  weak_password: "A senha precisa ter entre 8 e 128 caracteres.",
  account_exists: "Já existe um acesso com este e-mail. Entre com ele para aceitar o convite.",
  email_mismatch: "Este convite é para outro e-mail. Entre com a conta do e-mail convidado.",
  cannot_revoke_self: "Você não pode remover o próprio acesso.",
} as const;

export type UsersErrorCode = keyof typeof USERS_ERROR_TEXT;

export class UsersError extends Error {
  override name = "UsersError";

  constructor(
    readonly code: UsersErrorCode,
    message: string,
  ) {
    super(message);
  }
}
