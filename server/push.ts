import webpush from "web-push";
import { storage } from "./storage";

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || "";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "";

let vapidConfigured = false;

try {
  if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(
      "mailto:jarvis@bearscupbakehouse.com",
      VAPID_PUBLIC_KEY,
      VAPID_PRIVATE_KEY
    );
    vapidConfigured = true;
    console.log("[Push] VAPID keys configured successfully");
  } else {
    console.log("[Push] VAPID keys not set, push notifications disabled");
  }
} catch (err: any) {
  console.error("[Push] Failed to configure VAPID keys:", err.message);
}

export interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  url?: string;
  data?: Record<string, unknown>;
}

export async function sendPushToUsers(userIds: string[], payload: PushPayload): Promise<void> {
  if (!vapidConfigured) return;

  const subscriptions = await storage.getPushSubscriptionsByUsers(userIds);
  if (subscriptions.length === 0) return;

  const notificationPayload = JSON.stringify({
    title: payload.title,
    body: payload.body,
    icon: payload.icon || "/icons/icon-192.png",
    badge: payload.badge || "/icons/icon-192.png",
    tag: payload.tag,
    data: {
      url: payload.url || "/",
      ...payload.data,
    },
  });

  await Promise.allSettled(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          notificationPayload
        );
      } catch (err: any) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          await storage.deactivatePushSubscription(sub.endpoint);
        } else {
          console.error(`[Push] Failed to send to ${sub.endpoint.slice(0, 50)}...`, err.message);
        }
      }
    })
  );
}

export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  return sendPushToUsers([userId], payload);
}
