import type { PushMessage, PushProvider, PushTarget } from "./provider";

export type VapidKeys = { publicKey: string; privateKey: string; subject: string };

/**
 * Web Push through the push services of the browsers (Google, Apple, Mozilla, D-78). The
 * payload goes encrypted with the device's keys, so they carry it without reading it;
 * they see only that a message went to a device, when. Loaded only here, when it sends.
 */
export class WebPushProvider implements PushProvider {
  constructor(private readonly keys: VapidKeys) {}

  async send(target: PushTarget, { ttlSeconds, ...payload }: PushMessage) {
    const { default: webpush } = await import("web-push");
    try {
      await webpush.sendNotification(
        { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
        JSON.stringify(payload),
        { TTL: ttlSeconds, vapidDetails: this.keys },
      );
      return "sent" as const;
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) return "gone" as const;
      throw new Error(`Push service answered ${status ?? "nothing"}`);
    }
  }
}
