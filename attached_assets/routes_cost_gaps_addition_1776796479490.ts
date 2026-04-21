
  // === PASTRY COST GAP DIAGNOSIS ===
  app.get("/api/pastry-items/:id/cost-gaps", isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const { calculatePastryCost } = await import("./cost-engine");
      const { db: gapDb } = await import("./db");
      const { pastryItems: piTable, pastryPassports: ppTable, inventoryItems: invTable, recipes: recTable, pastryAddins: addTable } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");

      const [item] = await gapDb.select().from(piTable).where(eq(piTable.id, id));
      if (!item) return res.status(404).json({ message: "Pastry item not found" });

      const gaps: Array<{ type: string; severity: "blocking" | "warning"; message: string; fixPath?: string }> = [];

      // Check passport exists
      const allPassports = await gapDb.select().from(ppTable);
      const passport = allPassports.find(p => p.pastryItemId === id) || allPassports.find(p => p.name.toLowerCase() === item.name.toLowerCase());

      if (!passport) {
        gaps.push({ type: "no_passport", severity: "blocking", message: "No Pastry Passport linked to this item", fixPath: "/pastry-passports" });
      } else {
        // Check mother recipe
        if (!passport.motherRecipeId) {
          gaps.push({ type: "no_mother_recipe", severity: "blocking", message: "Passport has no Mother Recipe linked — dough cost cannot be calculated", fixPath: `/pastry-passports/${passport.id}` });
        } else {
          // Check recipe ingredients vs inventory
          const [recipe] = await gapDb.select().from(recTable).where(eq(recTable.id, passport.motherRecipeId));
          if (recipe) {
            const allInv = await gapDb.select().from(invTable);
            const ingredients = (recipe.ingredients as any[]) || [];
            for (const ing of ingredients) {
              const ingName = (ing.name || "").toLowerCase().trim();
              const matched = allInv.find(i =>
                i.name.toLowerCase().trim() === ingName ||
                (i.aliases || []).some((a: string) => a.toLowerCase().trim() === ingName)
              );
              if (!matched) {
                gaps.push({ type: "unmatched_ingredient", severity: "blocking", message: `Ingredient "${ing.name}" in ${recipe.title} has no matching inventory item`, fixPath: "/inventory/items" });
              } else if (matched.costPerUnit == null) {
                gaps.push({ type: "missing_cost", severity: "blocking", message: `Inventory item "${matched.name}" has no cost per unit set`, fixPath: "/inventory/items" });
              }
            }
          }
        }

        // Check add-ins
        const addins = await gapDb.select().from(addTable).where(eq(addTable.pastryId, passport.id));
        for (const addin of addins) {
          if (!addin.inventoryItemId) {
            gaps.push({ type: "unlinked_addin", severity: "blocking", message: `Add-in "${addin.name}" is not linked to an inventory item`, fixPath: `/pastry-passports/${passport.id}` });
          } else {
            const inv = (await gapDb.select().from(invTable).where(eq(invTable.id, addin.inventoryItemId)))[0];
            if (inv && inv.costPerUnit == null) {
              gaps.push({ type: "missing_cost", severity: "blocking", message: `Inventory item "${inv.name}" (add-in: ${addin.name}) has no cost per unit`, fixPath: "/inventory/items" });
            }
            if (addin.weightPerPieceG == null && addin.quantity == null) {
              gaps.push({ type: "missing_weight", severity: "warning", message: `Add-in "${addin.name}" has no weight per piece or quantity set`, fixPath: `/pastry-passports/${passport.id}` });
            }
          }
        }
      }

      // Calculate current cost for summary
      const costResult = await calculatePastryCost(id);

      res.json({
        pastryItemId: id,
        pastryName: item.name,
        hasPassport: !!passport,
