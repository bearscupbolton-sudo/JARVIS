import { db } from "./db";
import { shifts, users } from "@shared/schema";
import { eq, and, gte, lte, sql } from "drizzle-orm";

export async function seedMarchShifts() {
  const nullLocCount = await db.select({ count: sql<number>`count(*)` })
    .from(shifts)
    .where(and(
      gte(shifts.shiftDate, "2026-03-02"),
      lte(shifts.shiftDate, "2026-03-29"),
      sql`${shifts.locationId} IS NULL`
    ));

  if (Number(nullLocCount[0]?.count) > 0) {
    console.log(`[Seed] Fixing ${nullLocCount[0]?.count} shifts with NULL locationId → 1`);
    await db.execute(sql`UPDATE shifts SET location_id = 1 WHERE shift_date >= '2026-03-02' AND shift_date <= '2026-03-29' AND location_id IS NULL`);
  }

  const dupResult = await db.execute(sql`
    WITH duplicates AS (
      SELECT id,
        ROW_NUMBER() OVER (PARTITION BY user_id, shift_date, start_time ORDER BY id) as rn
      FROM shifts
      WHERE shift_date >= '2026-03-02' AND shift_date <= '2026-03-29'
    )
    DELETE FROM shifts WHERE id IN (SELECT id FROM duplicates WHERE rn > 1)
  `);
  console.log("[Seed] Cleaned up duplicate March shifts");

  const allUsers = await db.select({ id: users.id, firstName: users.firstName, lastName: users.lastName, department: users.department }).from(users);

  const findUser = (first: string, last: string) => {
    const exactMatch = allUsers.find(u =>
      u.firstName?.trim().toLowerCase() === first.toLowerCase() &&
      u.lastName?.trim().toLowerCase().startsWith(last.toLowerCase().substring(0, 2))
    );
    if (exactMatch) return exactMatch;
    return allUsers.find(u =>
      u.firstName?.trim().toLowerCase() === first.toLowerCase()
    );
  };

  const ownerUser = allUsers.find(u => u.firstName?.trim().toLowerCase() === "louis");
  if (!ownerUser) {
    console.log("[Seed] Could not find Louis (owner) user, skipping seed");
    return;
  }

  const csvData = [
    { name: ["Lexi", "Gordon"], weeks: {
      "3/2": [null,"7-2","7-2","7-2","7-2",null,"7-2"],
      "3/9": [null,"7-2",null,"7-2","7-2","7-2","7-2"],
      "3/16": [null,"7-2",null,"7-2","7-2","7-2","7-2"],
      "3/23": [null,"7-2","7-2",null,"7-2","7-2","7-2"],
    }},
    { name: ["Gareth", "Kaedy"], weeks: {
      "3/2": [null,"7-2","7-2",null,"7-2","7-2","7-2"],
      "3/9": [null,"7-2","7-2",null,"7-2","7-2","7-2"],
      "3/16": [null,null,"7-2","7-2","7-2","7-2","7-2"],
      "3/23": [null,"7-2",null,null,"7-2","7-2","7-2"],
    }},
    { name: ["Morgan", "Voorhis"], weeks: {
      "3/2": [null,null,"7-2","7-2","7-2","7-2","7-2"],
      "3/9": [null,null,"7-2","7-2","7-2","7-2","7-2"],
      "3/16": [null,"7-2","7-2",null,"7-2","7-2","7-2"],
      "3/23": [null,null,"7-2","7-2","7-2","7-2","7-2"],
    }},
    { name: ["Jenna", "Wilhelm"], weeks: {
      "3/2": [null,null,"7-2","7-2","7-2","7-2","7-2"],
      "3/9": [null,null,"7-2","7-2","7-2","7-2","7-2"],
      "3/16": [null,"7-11","7-2","7-2",null,"7-2","7-2"],
      "3/23": [null,"7-2","7-2","7-2","7-2",null,"7-2"],
    }},
    { name: ["Ellyn", "Rickard"], weeks: {
      "3/2": [null,"7-2",null,"7-2","7-2","7-2","7-2"],
      "3/9": [null,"7-2",null,"7-2","7-2","7-2","7-2"],
      "3/16": [null,"7-2",null,"7-2","7-2","7-2","7-2"],
      "3/23": [null,"7-2",null,null,"7-2","7-2","7-2"],
    }},
    { name: ["Lisa", "Pallozi"], weeks: {
      "3/2": [null,"7-11","7-11",null,"7-11",null,null],
      "3/9": [null,null,"7-11",null,"7-11",null,null],
      "3/16": [null,null,null,null,"7-11",null,"7-2"],
      "3/23": [null,null,"7-11","7-11","7-11","7-2",null],
    }},
    { name: ["Nadalie", "Mason"], weeks: {
      "3/2": [null,"7-2",null,"7-2",null,"7-2",null],
      "3/9": [null,"7-2",null,"7-2",null,"7-2",null],
      "3/16": [null,"7-2","7-2",null,null,null,null],
      "3/23": [null,"7-2",null,"7-2",null,"7-2",null],
    }},
    { name: ["Kayla", "Sweet"], weeks: {
      "3/2": [null,null,null,null,null,null,"7-2"],
      "3/9": [null,null,null,null,null,null,"7-2"],
      "3/16": [null,null,null,null,null,null,"7-2"],
      "3/23": [null,null,null,null,null,null,"7-2"],
    }},
    { name: ["Kolby", "Doemel"], weeks: {
      "3/2": [null,null,null,null,null,"7-2","7-2"],
      "3/9": [null,null,null,null,null,null,"7-2"],
      "3/16": [null,null,null,null,null,"7-2","7-2"],
      "3/23": [null,null,null,null,null,"7-2","7-2"],
    }},
    { name: ["Hunter", "Gould"], weeks: {
      "3/2": [null,null,null,null,null,"7-2","7-2"],
      "3/9": [null,null,"7-2",null,null,"7-2","7-2"],
      "3/16": [null,null,null,null,null,"7-2",null],
      "3/23": [null,null,null,null,null,"7-2","7-2"],
    }},
  ];

  const weekStarts: Record<string, Date> = {
    "3/2": new Date(2026, 2, 2),
    "3/9": new Date(2026, 2, 9),
    "3/16": new Date(2026, 2, 16),
    "3/23": new Date(2026, 2, 23),
  };

  function parseTime(shorthand: string): { startTime: string; endTime: string } {
    const [s, e] = shorthand.split("-").map(Number);
    const startAmPm = s >= 12 ? "PM" : "AM";
    const endAmPm = e <= 4 ? "PM" : (e >= 12 ? "PM" : "AM");
    return {
      startTime: `${s}:00 ${startAmPm}`,
      endTime: `${e}:00 ${endAmPm}`,
    };
  }

  const shiftsToInsert: any[] = [];

  for (const entry of csvData) {
    const user = findUser(entry.name[0], entry.name[1]);
    if (!user) {
      console.log(`[Seed] Could not find user: ${entry.name[0]} ${entry.name[1]}, skipping`);
      continue;
    }
    console.log(`[Seed] Matched ${entry.name[0]} ${entry.name[1]} → ${user.firstName} ${user.lastName} (${user.id})`);

    for (const [weekKey, days] of Object.entries(entry.weeks)) {
      const weekStart = weekStarts[weekKey];
      for (let dayIdx = 0; dayIdx < 7; dayIdx++) {
        const val = days[dayIdx];
        if (!val) continue;
        const date = new Date(weekStart);
        date.setDate(date.getDate() + dayIdx);
        const dateStr = date.toISOString().split("T")[0];
        const { startTime, endTime } = parseTime(val);

        shiftsToInsert.push({
          userId: user.id,
          shiftDate: dateStr,
          startTime,
          endTime,
          department: user.department || "foh",
          status: "posted",
          createdBy: ownerUser.id,
          locationId: 1,
        });
      }
    }
  }

  if (shiftsToInsert.length === 0) {
    console.log("[Seed] No shifts to insert");
    return;
  }

  console.log(`[Seed] Total expected shifts: ${shiftsToInsert.length}`);

  const existingShifts = await db.select({
    userId: shifts.userId,
    shiftDate: shifts.shiftDate,
    startTime: shifts.startTime,
  }).from(shifts).where(and(
    gte(shifts.shiftDate, "2026-03-02"),
    lte(shifts.shiftDate, "2026-03-29")
  ));

  const existingKeys = new Set(existingShifts.map(s => `${s.userId}|${s.shiftDate}|${s.startTime}`));
  const newShifts = shiftsToInsert.filter(s => !existingKeys.has(`${s.userId}|${s.shiftDate}|${s.startTime}`));

  if (newShifts.length === 0) {
    console.log("[Seed] All March shifts already exist, nothing new to insert");
    return;
  }

  console.log(`[Seed] Inserting ${newShifts.length} new March shifts (${shiftsToInsert.length - newShifts.length} already existed)...`);

  for (let i = 0; i < newShifts.length; i += 50) {
    const batch = newShifts.slice(i, i + 50);
    await db.insert(shifts).values(batch);
  }

  console.log(`[Seed] Successfully inserted ${newShifts.length} March shifts`);
}
