import { db } from "./db";
import { recipes, productionLogs, sops, users } from "@shared/schema";
import { storage } from "./storage";

async function seed() {
  console.log("Seeding database...");

  // Check if recipes exist
  const existingRecipes = await storage.getRecipes();
  if (existingRecipes.length > 0) {
    console.log("Recipes already exist, skipping seed.");
    return;
  }

  // Create Recipes
  const sourdough = await storage.createRecipe({
    title: "Country Sourdough",
    description: "Classic rustic sourdough with a chewy crust and open crumb.",
    yieldAmount: 10,
    yieldUnit: "loaves",
    category: "Bread",
    ingredients: [
      { name: "Bread Flour", quantity: 8000, unit: "g", bakersPercentage: 80 },
      { name: "Whole Wheat Flour", quantity: 2000, unit: "g", bakersPercentage: 20 },
      { name: "Water", quantity: 7500, unit: "g", bakersPercentage: 75 },
      { name: "Levain", quantity: 2000, unit: "g", bakersPercentage: 20 },
      { name: "Salt", quantity: 200, unit: "g", bakersPercentage: 2 },
    ],
    instructions: [
      { step: 1, text: "Mix flour and water (autolyse) for 1 hour." },
      { step: 2, text: "Add levain and mix." },
      { step: 3, text: "Add salt and mix." },
      { step: 4, text: "Bulk ferment for 4 hours with coil folds every 30 mins." },
      { step: 5, text: "Divide and shape." },
      { step: 6, text: "Proof overnight in fridge." },
      { step: 7, text: "Bake at 250C for 40 mins." },
    ],
  });

  const croissant = await storage.createRecipe({
    title: "Butter Croissant",
    description: "Flaky, buttery layers.",
    yieldAmount: 50,
    yieldUnit: "pastries",
    category: "Viennoiserie",
    ingredients: [
      { name: "T55 Flour", quantity: 2500, unit: "g" },
      { name: "Sugar", quantity: 300, unit: "g" },
      { name: "Salt", quantity: 50, unit: "g" },
      { name: "Yeast", quantity: 100, unit: "g" },
      { name: "Water", quantity: 1400, unit: "g" },
      { name: "Butter (lamination)", quantity: 1250, unit: "g" },
    ],
    instructions: [
      { step: 1, text: "Mix dough ingredients." },
      { step: 2, text: "Chill dough overnight." },
      { step: 3, text: "Lock in butter block." },
      { step: 4, text: "Perform 1 double turn and 1 single turn." },
      { step: 5, text: "Roll out to 4mm." },
      { step: 6, text: "Cut and shape." },
      { step: 7, text: "Proof at 26C for 2.5 hours." },
      { step: 8, text: "Bake at 190C for 16 mins." },
    ],
  });

  console.log("Created recipes.");

  // Create SOPs
  await storage.createSOP({
    title: "Hand Washing Procedure",
    content: "1. Wet hands with warm water.\n2. Apply soap.\n3. Lather for 20 seconds.\n4. Rinse thoroughly.\n5. Dry with paper towel.",
    category: "Hygiene",
  });

  await storage.createSOP({
    title: "Opening Checklist",
    content: "- Turn on ovens to 250C.\n- Check retarder temperatures.\n- Review daily production list.\n- Sanitize workbenches.",
    category: "Operations",
  });

  console.log("Created SOPs.");

  // Create a dummy log (assuming we can insert with a fake user ID for now, or just leave it)
  // Since we don't have a user yet, we might skip this or use a placeholder string if the schema allows text userId (it does).
  await storage.createProductionLog({
    recipeId: sourdough.id,
    userId: "system_seed",
    yieldProduced: 9,
    notes: "Dough felt a bit slack, maybe high humidity.",
    date: new Date(),
  });

  console.log("Created production logs.");
  console.log("Seeding complete.");
}

seed().catch(console.error);
