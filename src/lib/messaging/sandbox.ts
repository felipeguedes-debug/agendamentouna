import { randomUUID } from "node:crypto";
import { forPractice, isUuid } from "@/lib/db";
import type { InstanceConnection, MessagingProvider, SendTextInput } from "./provider";

/**
 * The fake provider of PRD 12 ("Sandbox dos provedores"): every message goes into
 * SandboxMessage instead of WhatsApp, so the cadence runs end to end without a real
 * number. The connection is the instance's status in the database, so a test or a
 * developer can disconnect it. Not available in production (./index.ts).
 */
export class SandboxMessagingProvider implements MessagingProvider {
  constructor(
    private readonly practiceId: string,
    private readonly instanceId: string,
  ) {}

  async sendText(input: SendTextInput) {
    const providerMessageId = `sandbox-${randomUUID()}`;
    await forPractice(this.practiceId).sandboxMessage.create({
      data: {
        practiceId: this.practiceId,
        whatsappInstanceId: this.instanceId,
        dispatchId: input.trackId && isUuid(input.trackId) ? input.trackId : null,
        toPhone: input.to,
        text: input.text,
        providerMessageId,
      },
    });
    return { providerMessageId };
  }

  async getConnection(): Promise<InstanceConnection> {
    const instance = await forPractice(this.practiceId).whatsappInstance.findFirst({ where: { id: this.instanceId }, select: { status: true } });
    if (instance?.status === "CONNECTED") return "connected";
    return instance?.status === "PENDING_QR" ? "connecting" : "disconnected";
  }

  async configureWebhook() {}
}
