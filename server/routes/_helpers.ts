import { storage } from "../storage";

export async function getUserFromReq(req: any) {
  return req.appUser || null;
}

export async function createOvenTimersForItem(
  itemName: string,
  pastryItemId: number | null,
  userId: string | null,
): Promise<void> {
  try {
    const passport = await storage.getPassportByPastryItemIdOrName(pastryItemId, itemName);
    if (!passport?.bakeTimeMinutes) return;

    const bakeMinutes = passport.bakeTimeMinutes;
    const now = new Date();

    const activeTimers = await storage.getActiveTimers();
    const activeBakeTimer = activeTimers.find(
      (t) => t.label.includes("— Bake") && t.expiresAt > now && !t.dismissed
    );

    if (activeBakeTimer) {
      const existingLabels = activeBakeTimer.label.replace(" — Bake", "").split(", ");
      if (!existingLabels.includes(itemName)) {
        existingLabels.push(itemName);
        const newLabel = existingLabels.join(", ") + " — Bake";
        await storage.updateTimer(activeBakeTimer.id, { label: newLabel });
      }

      const activeSpinTimer = activeTimers.find(
        (t) => t.label.includes("— Spin") && t.expiresAt > now && !t.dismissed
      );
      if (activeSpinTimer) {
        const spinLabels = activeSpinTimer.label.replace(" — Spin", "").split(", ");
        if (!spinLabels.includes(itemName)) {
          spinLabels.push(itemName);
          const newSpinLabel = spinLabels.join(", ") + " — Spin";
          await storage.updateTimer(activeSpinTimer.id, { label: newSpinLabel });
        }
      }
      return;
    }

    await storage.createTimer({
      label: `${itemName} — Bake`,
      durationSeconds: bakeMinutes * 60,
      startedAt: now,
      expiresAt: new Date(now.getTime() + bakeMinutes * 60 * 1000),
      dismissed: false,
      createdBy: userId,
      department: "bakery",
      pastryItemId: pastryItemId,
    });

    if (bakeMinutes > 8) {
      const spinSeconds = (bakeMinutes - 8) * 60;
      await storage.createTimer({
        label: `${itemName} — Spin`,
        durationSeconds: spinSeconds,
        startedAt: now,
        expiresAt: new Date(now.getTime() + spinSeconds * 1000),
        dismissed: false,
        createdBy: userId,
        department: "bakery",
        pastryItemId: pastryItemId,
      });
    }
  } catch (err) {
    console.error("Failed to create oven timers:", err);
  }
}
