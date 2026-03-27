# Jarvis Bakery OS

## Overview
Jarvis Bakery OS is a comprehensive full-stack bakery management application designed to optimize operations, enhance efficiency, and provide data-driven insights for modern bakeries. It aims to improve decision-making and operational excellence through features like advanced recipe management, production logging, AI assistance, multi-location support, and integrated team and financial management. The project's ambition is to be a robust and scalable solution for the bakery industry.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture
The application is structured as a monorepo, featuring a React 18 frontend built with Vite, TypeScript, Wouter, TanStack React Query, shadcn/ui, Radix UI, and Tailwind CSS. The backend is an Express.js application using Node.js and TypeScript, exposing a RESTful JSON API. Data is stored in PostgreSQL, managed with Drizzle ORM for type-safe interactions. The server operates in Eastern Time (`America/New_York`).

**Key Architectural Decisions and Features:**

*   **Monorepo Structure:** Centralized development for both frontend and backend.
*   **Modern Web Stack:** Utilizes React 18 for dynamic UIs and Express.js for a scalable API.
*   **Comprehensive Bakery Management:**
    *   **Recipe & Production:** Advanced recipe system with inline scaling, production views, lamination studio with FIFO tracking, and integrated production data flow.
    *   **Inventory Management:** Department-aware inventory with live real-time sync with Square sales data.
    *   **Financial Hub (The Firm):** Forensic-level financial reconciliation, double-entry accounting (Chart of Accounts, Journal Entries, Ledger), payroll review (ADP-ready), and autonomous AI financial analysis. This includes real cash computation, accrual placeholders, donation ROI tracking, and lightning-offset reconciliation for bank transactions with vendor intelligence. Features auto-reconciliation engine with global rule propagation (manual tagging creates learning rules and sweeps matching unreconciled transactions), batch approval UI (paginated 25/page with "Accept All Validated Matches" for 99% confidence items), per-transaction inference audit logs, and unpin toggle for individual batch exclusion.
    *   **Fixed Asset Management (ARA):** Twin-track depreciation engine (Book and Tax Ledger) with autonomous CapEx detection.
    *   **Compliance & Statutory Reporting (CSRL):** Event-driven compliance engine monitoring statutory obligations and tax reporting.
    *   **Invoice Capture:** AI vision model for processing invoices, including US Foods integration for shorts detection, substitution tracking, and price variance alerts.
    *   **Team Management:** Schedule and shift management, PIN-based time card system with Square Labor Sync, HR onboarding, and employee reimbursements.
    *   **AI Integration (Jarvis):** Utilizes OpenAI-compatible APIs for chat, audio, image generation, invoice scanning, personalized briefings, and recipe optimization.
    *   **Multi-Location Support:** All operational data is tagged by `locationId`.
    *   **Authentication & Roles:** PIN-based authentication with role-based permissions (`owner`, `manager`, `member`).
    *   **Operational Dashboards:** Consolidated Home Page, Admin Insights & KPI Reports, TTIS (Tip Transparency), and Platform 9¾ (FOH Command Center).
    *   **Communication & Collaboration:** Messaging system, global acknowledgment system, task manager, and notes system.
    *   **Customer & Wholesale:** La Carte customer portal, BC Wholesale portal, and JMT (Jarvis Menu Theater) for dynamic menu display.
    *   **Tax Intelligence (RAgent):** Tax Profile Engine, Vibe Threshold Monitor, and FICA Tip Credit Calculator.
    *   **Audit Lineage Engine:** Three-layer drill-down system (quantitative → auditor → accrual) with in-memory TTL cache, AI narrative generation, and slide-out panel. Click any P&L card (Revenue, Expenses, Net P&L) on Overview or Command Center tabs to trace totals back to raw journal entries. Includes double-counting auditor (flags matching amounts ±3 days), ghost entry detection (non-cash accruals), and vendor pattern analysis enriched by Price Heatmap data. API: `GET /api/firm/audit/lineage`. Engine: `server/audit-lineage-engine.ts`. Panel: `client/src/components/FinancialLineagePanel.tsx`.
    *   **Year-End Financial Export:** Comprehensive JSON export engine (`server/yearend-export-engine.ts`) generating `bears-cup-yearend-YYYY.json` with all financial statements, GL detail, S-Corp tax workpapers, fixed asset schedules, payroll, donations, compliance data, and operational support data for CPA/AI Form 1120-S preparation. Owner-only "Export Year-End Package" button on The Firm page (Reconcile tab) with year selector.

## Personalized Greeting System

The app includes a personalized greeting system that enhances the daily Jarvis briefing:
- **Schema fields**: `interests` (jsonb array), `personalizedGreetingsEnabled` (boolean), `interestsCollected` (boolean) on the `users` table.
- **Interest Collection Overlay** (`client/src/components/InterestCollectionOverlay.tsx`): Multi-step onboarding modal shown once after JarvisIntro, collects interests, explains calendar features, describes security measures.
- **Profile page**: "Interests & Personalization" section with toggle and interest tag editor.
- **Weather API**: OpenWeatherMap integration with 15-min cache (requires `OPENWEATHERMAP_API_KEY` env var).
- **Traffic API**: Google Maps Directions API with 10-min cache (requires `GOOGLE_MAPS_API_KEY` env var).
- **Greeting endpoint**: `GET /api/user/greeting` generates AI-powered personalized greeting using weather, traffic, schedule, and interests data.
- **Dashboard integration**: JarvisBriefingCard on Home page fetches and displays personalized greeting for opted-in users.

## External Dependencies

*   **PostgreSQL**: Primary data store.
*   **Replit Auth (OIDC)**: User authentication.
*   **OpenAI-compatible API**: AI functionalities.
*   **Square POS API**: Sales, payments, labor, and catalog integration.
*   **pdf-lib**: Server-side PDF generation (e.g., W-4s).
*   **Twilio (Optional)**: SMS notifications.
*   **ADP RUN API (Optional)**: Payroll and worker management.
*   **Plaid**: Bank and credit card integration for transaction import and balance syncing.

## Square Revenue & Undeposited Cash Architecture

Revenue is sourced from **Square POS gross sales** (not bank deposits). The `square_daily_summary` table stores per-location, per-day data including:
- `totalRevenue` — gross sales (what customers paid)
- `cashTender` / `cardTender` / `otherTender` — tender type breakdown
- `processingFees` — card processing fees (from Square Payments API)
- `tipAmount` — tips collected
- `refundAmount` — refunds issued
- `squareLocationId` — Square location ID for per-location tracking

**Locations linked:**
- Bolton Landing: Square ID `XFS6DD0Z4HHKJ` (Jarvis location_id=1)
- Saratoga Springs: Square ID `L8JQJBM6C66AK` (Jarvis location_id=3)

**Undeposited Cash** = Square cash tender − cash deposits − reimbursements. Widget shows progress bar and reconciliation breakdown.

**Backfill route**: `POST /api/square/backfill` with `{startDate, endDate}` queues background sync for each day.

**P&L waterfall**: Square Gross Revenue → minus Processing Fees (6110) → minus Loan Withholding (2500) → minus Cash Tender → = Bank Deposit (what Plaid sees).

## Coffee Command Center - Components & Drink Builder

The Coffee Command Center includes:
- **Components Library** (`coffee_components` table): Coffee ingredients organized by category (Espresso, Milks, Syrups, Teas/Bases, Toppings, Cold Foam). Each component links to a `coffee_inventory` item for cost tracking.
- **Jarvis Drink Builder**: AI-powered drink recipe creation via natural language or photo upload. Endpoint at `POST /api/coffee/jarvis-parse-drinks` parses descriptions into structured recipes, matching components from the library. Parsed results are editable before saving (name, description, ingredients, quantities, units). Unmatched ingredients can be resolved by creating new components or linking to existing ones inline.
- **Base Drink Templates with Variations**: Drinks can have a `parentDrinkId` to create variation hierarchies (e.g., Iced Latte as a variation of Latte). Variations inherit base drink ingredients; override-only ingredients are stored on the variation. The API returns both `ingredients` (own) and `effectiveIngredients` (own + inherited from parent, with overrides applied by `coffeeInventoryId`).
- **End-to-End Cost Rollup**: Drink cost = sum of effective ingredient quantity × inventory cost per unit. Costs flow from inventory items → coffee inventory → drink ingredients → per-drink COGS. Expanded drink cards show per-ingredient cost with inherited/override indicators.
- Tables: `coffee_components`, `coffee_drink_recipes` (with `description`, `parent_drink_id`), `coffee_drink_ingredients` (with `coffee_component_id`, `is_override`), `coffee_inventory`.