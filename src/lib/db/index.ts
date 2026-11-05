import { prisma } from "./client";
import { scopeToPractice, type PracticeScopedClient } from "./practice-scope";

export { prisma } from "./client";
export { isUuid, PracticeScopeError, scopeToPractice, type PracticeScopedClient } from "./practice-scope";

/** The scoped client inside `$transaction`; services that run in a caller's transaction take it. */
export type PracticeTransaction = Parameters<Parameters<PracticeScopedClient["$transaction"]>[0]>[0];

/** The client for everything that happens inside one practice (D-02). */
export function forPractice(practiceId: string) {
  return scopeToPractice(prisma, practiceId);
}
