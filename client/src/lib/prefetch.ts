const routeImportMap: Record<string, () => Promise<unknown>> = {
  "/": () => import("@/pages/Home"),
  "/dashboard": () => import("@/pages/Dashboard"),
  "/bakery": () => import("@/pages/Bakery"),
  "/coffee": () => import("@/pages/Coffee"),
  "/kitchen": () => import("@/pages/Kitchen"),
  "/platform": () => import("@/pages/Platform934"),
  "/recipes": () => import("@/pages/Recipes"),
  "/production": () => import("@/pages/Production"),
  "/sops": () => import("@/pages/SOPs"),
  "/assistant": () => import("@/pages/Assistant"),
  "/test-kitchen": () => import("@/pages/TestKitchen"),
  "/admin/users": () => import("@/pages/AdminUsers"),
  "/admin/approvals": () => import("@/pages/AdminApprovals"),
  "/admin/pastry-items": () => import("@/pages/PastryItems"),
  "/profile": () => import("@/pages/Profile"),
  "/inventory": () => import("@/pages/Inventory"),
  "/inventory/items": () => import("@/pages/InventoryItems"),
  "/inventory/invoices": () => import("@/pages/InvoiceCapture"),
  "/inventory/count": () => import("@/pages/InventoryCount"),
  "/vendors": () => import("@/pages/Vendors"),
  "/schedule": () => import("@/pages/Schedule"),
  "/calendar": () => import("@/pages/CalendarPage"),
  "/pastry-passports": () => import("@/pages/PastryPassports"),
  "/tasks": () => import("@/pages/TaskManager"),
  "/lamination": () => import("@/pages/LaminationStudio"),
  "/prep-eq": () => import("@/pages/PrepEQ"),
  "/kiosk": () => import("@/pages/Kiosk"),
  "/time-cards": () => import("@/pages/TimeCards"),
  "/time-review": () => import("@/pages/TimeReview"),
  "/admin/square": () => import("@/pages/SquareSettings"),
  "/square-labor": () => import("@/pages/SquareLaborSync"),
  "/pastry-goals": () => import("@/pages/PastryGoals"),
  "/live-inventory": () => import("@/pages/LiveInventory"),
  "/admin/ttis": () => import("@/pages/TTIS"),
  "/admin/insights": () => import("@/pages/AdminInsights"),
  "/messages": () => import("@/pages/Messages"),
  "/notes": () => import("@/pages/Notes"),
  "/admin/feedback": () => import("@/pages/FeedbackQRCode"),
  "/sentiment": () => import("@/pages/SentimentMatrix"),
  "/loop": () => import("@/pages/TheLoop"),
  "/hr": () => import("@/pages/HR"),
  "/mll": () => import("@/pages/MLL"),
  "/bagel-bros": () => import("@/pages/BagelBros"),
  "/dev-feedback": () => import("@/pages/DevFeedback"),
  "/maintenance": () => import("@/pages/Maintenance"),
  "/display": () => import("@/pages/Display"),
};

const prefetched = new Set<string>();

function shouldPrefetch(): boolean {
  const nav = (navigator as any);
  if (nav.connection) {
    if (nav.connection.saveData) return false;
    const ect = nav.connection.effectiveType;
    if (ect === "slow-2g" || ect === "2g") return false;
  }
  return true;
}

export function prefetchRoute(path: string): void {
  if (prefetched.has(path)) return;
  if (!shouldPrefetch()) return;
  const importFn = routeImportMap[path];
  if (!importFn) return;
  prefetched.add(path);
  importFn().catch(() => {
    prefetched.delete(path);
  });
}

const CORE_ROUTES = ["/", "/schedule", "/messages", "/tasks", "/recipes", "/production", "/lamination", "/inventory", "/time-cards", "/profile"];

let cancelCorePrefetch: (() => void) | null = null;

export function prefetchCoreRoutes(): void {
  if (!shouldPrefetch()) return;

  const timers: ReturnType<typeof setTimeout>[] = [];
  let cancelled = false;

  const schedule = typeof requestIdleCallback === "function"
    ? requestIdleCallback
    : (cb: () => void) => setTimeout(cb, 200);

  const handle = schedule(() => {
    let idx = 0;
    function next() {
      if (cancelled || idx >= CORE_ROUTES.length) return;
      prefetchRoute(CORE_ROUTES[idx]);
      idx++;
      timers.push(setTimeout(next, 100));
    }
    next();
  });

  cancelCorePrefetch = () => {
    cancelled = true;
    timers.forEach(clearTimeout);
    if (typeof cancelIdleCallback === "function" && typeof handle === "number") {
      cancelIdleCallback(handle);
    }
  };
}

export function cancelPrefetch(): void {
  cancelCorePrefetch?.();
  cancelCorePrefetch = null;
}

export function createPrefetchObserver(): IntersectionObserver | null {
  if (typeof IntersectionObserver === "undefined") return null;

  return new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const el = entry.target as HTMLElement;
        const href = el.getAttribute("data-prefetch");
        if (href) {
          prefetchRoute(href);
        }
      }
    },
    { rootMargin: "200px" }
  );
}
