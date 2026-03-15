import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

export default defineConfig({
  plugins: [
    react(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer(),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (/react-dom|react\/|wouter/.test(id)) return "vendor-react";
            if (/@radix-ui/.test(id)) return "vendor-radix";
            if (/@tanstack\/react-query/.test(id)) return "vendor-query";
            if (/recharts|d3-|victory/.test(id)) return "vendor-charts";
            if (/date-fns/.test(id)) return "vendor-date";
            if (/react-hook-form|@hookform/.test(id)) return "vendor-form";
            if (/lucide-react/.test(id)) return "vendor-icons";
            return undefined;
          }

          if (id.includes("/pages/")) {
            const pageName = id.match(/\/pages\/(?:[^/]+\/)?([^/.]+)/)?.[1];
            if (!pageName) return undefined;

            const core = ["Home", "Dashboard", "Profile", "Login", "not-found", "Assistant"];
            const production = ["Recipes", "RecipeDetail", "BeginRecipe", "Production", "LaminationStudio", "Bakery", "Kitchen", "TestKitchen", "BagelBros", "PrepEQ", "PastryPassports", "PastryPassportDetail", "PastryGoals", "PastryItems", "Coffee"];
            const operations = ["Schedule", "TimeCards", "TimeReview", "TaskManager", "AssignedTaskList", "Messages", "Notes", "CalendarPage", "Kiosk", "KioskClock"];
            const inventory = ["Inventory", "InventoryItems", "InventoryCount", "InvoiceCapture", "LiveInventory", "Vendors", "SOPs", "Maintenance"];
            const admin = ["AdminUsers", "AdminApprovals", "AdminInsights", "SquareSettings", "SquareLaborSync", "TTIS", "HR", "Onboarding", "PayrollReview", "Tutorials", "DevFeedback", "FeedbackQRCode", "SentimentMatrix", "TheLoop", "TheFirm", "CustomerFeedback"];
            const display = ["Platform934", "Display", "MenuScreen", "JMT", "MLL", "Starkade"];
            const wholesale = ["WholesaleLogin", "WholesaleHome", "WholesaleOrder", "WholesaleOrders", "WholesaleTemplates", "WholesaleOnboarding", "WholesaleAdmin"];
            const portal = ["PortalLogin", "PortalRegister", "PortalHome", "PortalMenu", "PortalOrders", "PortalProfile"];

            if (core.includes(pageName)) return "pages-core";
            if (production.includes(pageName)) return "pages-production";
            if (operations.includes(pageName)) return "pages-operations";
            if (inventory.includes(pageName)) return "pages-inventory";
            if (admin.includes(pageName)) return "pages-admin";
            if (display.includes(pageName)) return "pages-display";
            if (wholesale.includes(pageName)) return "pages-wholesale";
            if (portal.includes(pageName)) return "pages-portal";
          }

          return undefined;
        },
      },
    },
  },
  server: {
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
