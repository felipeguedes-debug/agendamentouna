/** One device's Web Push, as the browser gave it. */
export type PushTarget = { endpoint: string; p256dh: string; auth: string };

export type PushMessage = { title: string; body: string; url: string; tag: string; ttlSeconds: number };

/**
 * Who delivers a notice. "gone": the push service says the subscription no longer exists,
 * so it is deleted. Anything else that goes wrong throws, and that notice is lost for
 * that device: the agenda still shows the confirmation (D-78).
 */
export interface PushProvider {
  send(target: PushTarget, message: PushMessage): Promise<"sent" | "gone">;
}
