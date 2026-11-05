import { prisma } from "@/lib/db";
import { hashEndpoint } from "./subscriptions";
import type { PushMessage, PushProvider, PushTarget } from "./provider";

/** An endpoint the fake push service answers as no longer existing, for tests and development. */
export const SANDBOX_GONE_ENDPOINT = "https://sandbox.push.test/gone";

/** Records instead of delivering (the sandbox of PRD 12). Base client: a device belongs to no practice. */
export class SandboxPushProvider implements PushProvider {
  async send(target: PushTarget, message: PushMessage) {
    if (target.endpoint === SANDBOX_GONE_ENDPOINT) return "gone" as const;
    await prisma.sandboxPushMessage.create({ data: { ...message, endpointHash: hashEndpoint(target.endpoint) } });
    return "sent" as const;
  }
}
