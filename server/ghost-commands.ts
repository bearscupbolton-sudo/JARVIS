import { db } from "./db";
import { accrualPlaceholders, aiInferenceLogs } from "@shared/schema";
import { eq } from "drizzle-orm";
import { storage } from "./storage";

export interface GhostAction {
  type: "RECLASSIFY" | "CAPITALIZE" | "ADJUST_ACCRUAL";
  reason: string;
  impact: string;
  payload: any;
}

export interface GhostActionResult {
  success: boolean;
  message: string;
  actionType: string;
}

export async function processCFOInstruction(action: GhostAction, userId: string, userName: string): Promise<GhostActionResult> {
  const auditNote = `Proposed by Jarvis CFO / Confirmed by ${userName} (${userId})`;

  switch (action.type) {
    case "RECLASSIFY": {
      const { transactionId, newCategory, newCoaCode } = action.payload;
      if (!transactionId || !newCategory) {
        return { success: false, message: "Missing transactionId or newCategory", actionType: action.type };
      }
      await storage.updateFirmTransaction(transactionId, {
        category: newCategory,
        coaCode: newCoaCode || undefined,
        notes: `${auditNote} — ${action.reason}`
      });
      await logGhostAction(action, userId);
      return { success: true, message: `Transaction #${transactionId} reclassified to "${newCategory}"`, actionType: action.type };
    }

    case "CAPITALIZE": {
      const { transactionId } = action.payload;
      if (!transactionId) {
        return { success: false, message: "Missing transactionId", actionType: action.type };
      }
      const { assetAssessor } = await import("./asset-engine");
      await assetAssessor.capitalizeSingleAsset(transactionId, `Jarvis_CFO_${userName}_${userId}`);
      await logGhostAction(action, userId);
      return { success: true, message: `Transaction #${transactionId} capitalized to Fixed Assets (COA 1500)`, actionType: action.type };
    }

    case "ADJUST_ACCRUAL": {
      const { id, newAmount } = action.payload;
      if (!id || newAmount === undefined) {
        return { success: false, message: "Missing accrual id or newAmount", actionType: action.type };
      }
      await db.update(accrualPlaceholders)
        .set({
          amount: String(newAmount),
          notes: `${auditNote} — ${action.reason}`
        })
        .where(eq(accrualPlaceholders.id, id));
      await logGhostAction(action, userId);
      return { success: true, message: `Accrual placeholder #${id} adjusted to $${Number(newAmount).toFixed(2)}`, actionType: action.type };
    }

    default:
      return { success: false, message: `Unknown action type: ${action.type}`, actionType: action.type };
  }
}

async function logGhostAction(action: GhostAction, userId: string) {
  try {
    await db.insert(aiInferenceLogs).values({
      scope: "ghost_cfo",
      inputSummary: `${action.type}: ${action.reason}`,
      outputSummary: action.impact,
      confidence: "100",
      accepted: true,
      reviewedBy: userId,
      firmTransactionId: action.payload.transactionId || null,
    });
  } catch (err) {
    console.error("Failed to log ghost action:", err);
  }
}

export const GHOST_ACTION_DETECTION_PROMPT = `
You also serve as a CFO advisor. When you detect a financial action that should be taken, you MUST include a structured command block in your response using this exact format:

:::ghost_action
{
  "type": "RECLASSIFY" | "CAPITALIZE" | "ADJUST_ACCRUAL",
  "reason": "Why this action should be taken",
  "impact": "What this changes on the books",
  "payload": { ... action-specific data ... }
}
:::

RECLASSIFY — when a transaction is categorized under the wrong COA code:
  payload: { "transactionId": <number>, "newCategory": "<category>", "newCoaCode": "<code>" }

CAPITALIZE — when an expense exceeds the $2,500 De Minimis Safe Harbor and should be a Fixed Asset:
  payload: { "transactionId": <number> }

ADJUST_ACCRUAL — when an accrual placeholder amount doesn't match the actual:
  payload: { "id": <number>, "newAmount": <number> }

RULES:
- Only propose actions when you have specific transaction data to reference
- Never fabricate transaction IDs — only use IDs from data provided in the conversation
- Include exactly ONE ghost_action block per proposed action
- The user will see a "Commit to Ledger" button and must explicitly approve before execution
- Always explain the action in plain English BEFORE the ghost_action block
`;
