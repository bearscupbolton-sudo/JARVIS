export const DEMO_SCHEDULES = [
  { id: 1, userId: "demo-1", date: "TODAY", startTime: "6:00 AM", endTime: "2:00 PM", department: "bakery", role: "baker", userName: "Alex Rivera" },
  { id: 2, userId: "demo-2", date: "TODAY", startTime: "5:00 AM", endTime: "1:00 PM", department: "bakery", role: "lead baker", userName: "Jordan Chen" },
  { id: 3, userId: "demo-3", date: "TODAY", startTime: "7:00 AM", endTime: "3:00 PM", department: "foh", role: "barista", userName: "Sam Williams" },
  { id: 4, userId: "demo-4", date: "TODAY", startTime: "8:00 AM", endTime: "4:00 PM", department: "foh", role: "counter", userName: "Taylor Brooks" },
  { id: 5, userId: "demo-5", date: "TODAY", startTime: "4:00 AM", endTime: "12:00 PM", department: "bakery", role: "pastry", userName: "Morgan Lee" },
];

export const DEMO_RECIPES = [
  { id: 1, name: "Classic Sourdough Boule", category: "Bread", department: "bakery", yield: "8 loaves", prepTime: "30 min", activeTime: "24 hrs", description: "Our signature naturally leavened sourdough with a deep, tangy flavor and crisp crust." },
  { id: 2, name: "Butter Croissant", category: "Viennoiserie", department: "bakery", yield: "24 pieces", prepTime: "45 min", activeTime: "48 hrs", description: "Laminated dough with 84% European butter, triple fold technique." },
  { id: 3, name: "Chocolate Chip Cookie", category: "Cookies", department: "bakery", yield: "48 cookies", prepTime: "20 min", activeTime: "3 hrs", description: "Brown butter, two chocolates, sea salt finish." },
  { id: 4, name: "Everything Bagel", category: "Bread", department: "bakery", yield: "24 bagels", prepTime: "25 min", activeTime: "18 hrs", description: "High-gluten dough, kettle boiled, hand-topped with everything mix." },
  { id: 5, name: "Blueberry Muffin", category: "Quick Bread", department: "bakery", yield: "24 muffins", prepTime: "15 min", activeTime: "45 min", description: "Buttermilk batter with fresh blueberries and streusel top." },
  { id: 6, name: "Cinnamon Roll", category: "Viennoiserie", department: "bakery", yield: "12 rolls", prepTime: "30 min", activeTime: "4 hrs", description: "Enriched dough, cinnamon-brown sugar fill, cream cheese icing." },
  { id: 7, name: "Vanilla Bean Scone", category: "Quick Bread", department: "bakery", yield: "16 scones", prepTime: "20 min", activeTime: "1 hr", description: "Real vanilla bean, cold butter lamination, cream glaze." },
  { id: 8, name: "Focaccia", category: "Bread", department: "bakery", yield: "2 half sheets", prepTime: "15 min", activeTime: "6 hrs", description: "High-hydration dough, olive oil, flaky salt, fresh rosemary." },
];

export const DEMO_INVENTORY = [
  { id: 1, name: "All-Purpose Flour", category: "Dry Goods", currentStock: 450, unit: "lb", parLevel: 200, vendor: "Performance Food Service", lastOrderDate: "2026-03-10" },
  { id: 2, name: "Bread Flour", category: "Dry Goods", currentStock: 380, unit: "lb", parLevel: 150, vendor: "Performance Food Service", lastOrderDate: "2026-03-10" },
  { id: 3, name: "European Butter 84%", category: "Dairy", currentStock: 120, unit: "lb", parLevel: 50, vendor: "Performance Food Service", lastOrderDate: "2026-03-11" },
  { id: 4, name: "Heavy Cream", category: "Dairy", currentStock: 24, unit: "qt", parLevel: 12, vendor: "Performance Food Service", lastOrderDate: "2026-03-11" },
  { id: 5, name: "Large Eggs", category: "Dairy", currentStock: 30, unit: "dz", parLevel: 15, vendor: "Performance Food Service", lastOrderDate: "2026-03-11" },
  { id: 6, name: "Granulated Sugar", category: "Dry Goods", currentStock: 200, unit: "lb", parLevel: 80, vendor: "Performance Food Service", lastOrderDate: "2026-03-10" },
  { id: 7, name: "Chocolate Chips 60%", category: "Baking", currentStock: 45, unit: "lb", parLevel: 20, vendor: "Performance Food Service", lastOrderDate: "2026-03-08" },
  { id: 8, name: "Vanilla Extract", category: "Baking", currentStock: 6, unit: "qt", parLevel: 2, vendor: "Performance Food Service", lastOrderDate: "2026-03-05" },
  { id: 9, name: "Fresh Blueberries", category: "Produce", currentStock: 18, unit: "pt", parLevel: 8, vendor: "Local Farms Co", lastOrderDate: "2026-03-12" },
  { id: 10, name: "Active Dry Yeast", category: "Baking", currentStock: 12, unit: "lb", parLevel: 5, vendor: "Performance Food Service", lastOrderDate: "2026-03-10" },
];

export const DEMO_PRODUCTION = [
  { id: 1, itemName: "Sourdough Boule", quantity: 24, bakedBy: "Jordan Chen", bakedAt: "6:30 AM", department: "bakery" },
  { id: 2, itemName: "Butter Croissant", quantity: 48, bakedBy: "Alex Rivera", bakedAt: "7:00 AM", department: "bakery" },
  { id: 3, itemName: "Everything Bagel", quantity: 72, bakedBy: "Morgan Lee", bakedAt: "5:45 AM", department: "bakery" },
  { id: 4, itemName: "Chocolate Chip Cookie", quantity: 48, bakedBy: "Alex Rivera", bakedAt: "8:30 AM", department: "bakery" },
  { id: 5, itemName: "Blueberry Muffin", quantity: 24, bakedBy: "Morgan Lee", bakedAt: "6:15 AM", department: "bakery" },
  { id: 6, itemName: "Cinnamon Roll", quantity: 12, bakedBy: "Jordan Chen", bakedAt: "7:45 AM", department: "bakery" },
];

export const DEMO_TASKS = [
  { id: 1, title: "Prep lamination dough for tomorrow", status: "in_progress", assignedTo: "Alex Rivera", priority: "high", department: "bakery" },
  { id: 2, title: "Restock FOH display case", status: "pending", assignedTo: "Sam Williams", priority: "medium", department: "foh" },
  { id: 3, title: "Clean and sanitize mixers", status: "completed", assignedTo: "Jordan Chen", priority: "medium", department: "bakery" },
  { id: 4, title: "Inventory count — dairy cooler", status: "pending", assignedTo: "Taylor Brooks", priority: "low", department: "bakery" },
  { id: 5, title: "Order packaging supplies", status: "pending", assignedTo: "Morgan Lee", priority: "high", department: "bakery" },
];

export const DEMO_STATS = {
  totalProduction: 228,
  itemsProduced: 6,
  teamOnShift: 5,
  tasksCompleted: 1,
  tasksPending: 4,
  inventoryAlerts: 0,
  soldOutItems: 0,
};

export function getDemoDataForEndpoint(endpoint: string, _userId?: string): any | null {
  const today = new Date().toISOString().slice(0, 10);

  if (endpoint.includes("/api/bakeoff-logs") || endpoint.includes("/api/production")) {
    return DEMO_PRODUCTION;
  }

  if (endpoint.includes("/api/recipes") && !endpoint.includes("/api/recipes/")) {
    return DEMO_RECIPES;
  }

  if (endpoint.includes("/api/inventory") && !endpoint.includes("/api/inventory/")) {
    return DEMO_INVENTORY;
  }

  if (endpoint.includes("/api/tasks") && !endpoint.includes("/api/tasks/")) {
    return DEMO_TASKS;
  }

  if (endpoint.includes("/api/home/stats")) {
    return DEMO_STATS;
  }

  if (endpoint.includes("/api/shifts") || endpoint.includes("/api/schedule")) {
    return DEMO_SCHEDULES.map(s => ({ ...s, date: s.date === "TODAY" ? today : s.date }));
  }

  return null;
}
