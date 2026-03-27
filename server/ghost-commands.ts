import { db } from "./db";
import { accrualPlaceholders } from "@shared/schema";
import { eq } from "drizzle-orm";
import { storage } from "./storage";

export interface GhostAction {
  type: "RECLASSIFY" | "CAPITALIZE" | "ADJUST_ACCRUAL";
  reason: string;
  impact: string;
  payload: any;
}

export async function processCFOInstruction(action: GhostAction, userId: string) {
  switch (action.type) {
    case "RECLASSIFY":
      await storage.updateFirmTransaction(action.payload.transactionId, {
        category: action.payload.newCategory,
        notes: `Jarvis CFO: ${action.reason}`
      });
      break;

    case "CAPITALIZE":
      const { assetAssessor } = await import("./asset-engine");
      await assetAssessor.capitalizeSingleAsset(
        action.payload.transactionId,
        `Jarvis_CFO_Auto_${userId}`
      );
      break;

    case "ADJUST_ACCRUAL":
      await db.update(accrualPlaceholders)
        .set({ amount: action.payload.newAmount })
        .where(eq(accrualPlaceholders.id, action.payload.id));
      break;
  }
}
