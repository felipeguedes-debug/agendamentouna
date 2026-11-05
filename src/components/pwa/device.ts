"use client";

import { useSyncExternalStore } from "react";

/** What the browser knows about this device: installed or not, and its Web Push (D-76, D-78). */

const STANDALONE = "(display-mode: standalone)";

function subscribeToDisplayMode(onChange: () => void) {
  const query = window.matchMedia(STANDALONE);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function isStandalone() {
  // iOS has its own flag, besides the media query.
  return window.matchMedia(STANDALONE).matches || (navigator as { standalone?: boolean }).standalone === true;
}

/** True when running as the installed app. */
export function useStandalone() {
  return useSyncExternalStore(subscribeToDisplayMode, isStandalone, () => false);
}

export type PushSupport = "supported" | "needs-install" | "unsupported";

export function pushSupport(): PushSupport {
  if ("serviceWorker" in navigator && "PushManager" in window && "Notification" in window) return "supported";
  // iOS offers Web Push only to the app added to the home screen.
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ? "needs-install" : "unsupported";
}

function bytesOf(base64url: string) {
  const padded = base64url.padEnd(base64url.length + ((4 - (base64url.length % 4)) % 4), "=").replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}

export async function browserSubscription() {
  const registration = await navigator.serviceWorker.getRegistration();
  return (await registration?.pushManager.getSubscription()) ?? null;
}

/** Asks the browser, inside the person's click, and subscribes. Null: the person said no. */
export async function subscribeBrowser(vapidPublicKey: string) {
  if ((await Notification.requestPermission()) !== "granted") return null;
  const registration = await navigator.serviceWorker.ready;
  return registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytesOf(vapidPublicKey) });
}

/** Best effort: the server already stopped when the session ended. */
export async function unsubscribeBrowser() {
  try {
    await (await browserSubscription())?.unsubscribe();
  } catch {
    // Nothing to do: the server holds no subscription for this device.
  }
}
