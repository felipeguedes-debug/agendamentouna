import { prisma } from "@/lib/db";
import { providerFor } from "@/lib/messaging";
import { setInstanceConnection } from "./instances";

/**
 * The queue across practices, for the Inngest functions (src/lib/inngest). They
 * run for the whole system, so they read through the base client; whatever they
 * find is then handled with the practice of each instance (sendNextDue,
 * setInstanceConnection), through the scoped client.
 */

export type DueInstance = { practiceId: string; instanceId: string };

/**
 * Instances with dispatches due. A due dispatch planned while the professional had
 * no instance gets the current one, or fails with "sem instância".
 */
export async function instancesWithDueDispatches(now = new Date()): Promise<DueInstance[]> {
  // Base client: the scheduler looks at every practice's queue.
  const orphans = await prisma.dispatch.findMany({
    where: { status: "SCHEDULED", scheduledFor: { lte: now }, whatsappInstanceId: null },
    select: { id: true, appointment: { select: { professional: { select: { whatsappInstance: { select: { id: true } } } } } } },
  });
  for (const orphan of orphans) {
    const instanceId = orphan.appointment.professional.whatsappInstance?.id;
    await prisma.dispatch.update({
      where: { id: orphan.id },
      data: instanceId ? { whatsappInstanceId: instanceId } : { status: "FAILED", statusReason: "no_instance" },
    });
  }

  const groups = await prisma.dispatch.groupBy({
    by: ["practiceId", "whatsappInstanceId"],
    where: { status: "SCHEDULED", scheduledFor: { lte: now }, whatsappInstanceId: { not: null }, OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }] },
  });
  return groups.flatMap((group) => (group.whatsappInstanceId ? [{ practiceId: group.practiceId, instanceId: group.whatsappInstanceId }] : []));
}

/** Asks each instance's provider for its connection (the webhook may miss a change). */
export async function checkInstanceConnections(now = new Date()) {
  // Base client: the check covers every practice's instances.
  const instances = await prisma.whatsappInstance.findMany({ select: { id: true, practiceId: true, apiUrl: true, tokenEncrypted: true } });
  // All at once: each has its own server, and one that does not answer takes 15 s.
  const results = await Promise.all(
    instances.map(async (instance) => {
      try {
        const connection = await providerFor(instance).getConnection();
        return Boolean(await setInstanceConnection(instance.practiceId, instance.id, connection, now));
      } catch (error) {
        console.error(`Could not check WhatsApp instance ${instance.id}`, error);
        return false;
      }
    }),
  );
  return results.filter(Boolean).length;
}
