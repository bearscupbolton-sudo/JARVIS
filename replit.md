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
    *   **Vendor Integrity:** Invoice-to-bank-ledger matching engine that groups by vendor, detects overcharges, flags missing invoices, alerts on potential double entries (accrual vs bank charge), and enables direct invoice↔transaction linking/unlinking. Accessible via "Vendors" tab in The Firm with summary cards, collapsible vendor rows, and per-alert severity badges.
    *   **Fixed Asset Management (ARA):** Twin-track depreciation engine (Book and Tax Ledger) with autonomous CapEx detection.
    *   **Compliance & Statutory Reporting (CSRL):** Event-driven compliance engine monitoring statutory obligations and tax reporting.
    *   **Invoice Capture:** AI vision model for processing invoices, including US Foods integration for shorts detection, substitution tracking, and price variance alerts.
    *   **Team Management:** Schedule and shift management, PIN-based time card system with Square Labor Sync, HR onboarding, and employee reimbursements.
    *   **AI Integration (Jarvis):** Utilizes OpenAI-compatible APIs for chat, audio, image generation, invoice scanning, personalized briefings, and recipe optimization.
    *   **Multi-Location Support:** All operational data is tagged by `locationId`.
    *   **Authentication & Roles:** PIN-based authentication with role-based permissions (`owner`, `manager`, `member`).
    *   **Sidebar Architecture:** Reorganized into four collapsible groups (Production Hub, Operations & Support, Intelligence & Data, Integrations) plus Global Pulse top-level items (Home, Lamination Studio, Messages, Jarvis). Groups persist collapse state in localStorage. Intelligence & Data restricted to owner/manager/GM; Integrations to owner only. Component: `client/src/components/Layout.tsx`.
    *   **Lamination Pulse Card:** Home dashboard widget showing real-time dough status (turning/chilling/proofing counts), rest alerts for overdue doughs, and quick-action buttons. Visible to bakery department users, owners, and managers. Component: `client/src/components/LaminationPulseCard.tsx`. Widget ID: `laminationPulse`.
    *   **Operational Dashboards:** Consolidated Home Page, Admin Insights & KPI Reports, TTIS (Tip Transparency), and Platform 9¾ (FOH Command Center).
    *   **Communication & Collaboration:** Messaging system, global acknowledgment system, task manager, and notes system.
    *   **Customer & Wholesale:** La Carte customer portal, BC Wholesale portal, and JMT (Jarvis Menu Theater) for dynamic menu display.
    *   **Tax Intelligence (RAgent):** Tax Profile Engine, Vibe Threshold Monitor, and FICA Tip Credit Calculator.
    *   **Jarvis CFO Panel (The Firm):** Floating brain-icon button in bottom-right of The Firm page opens a slide-out chat drawer connecting to Jarvis CFO. Features SSE streaming with AbortController cleanup, quick-prompt chips (P&L Summary, COGS Analysis, Cash Position, Tax Exposure), ghost action commit flow with per-action pending state, Escape-to-close, and broad cache invalidation on commit. Component: `client/src/components/JarvisCFOPanel.tsx`.
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

## Agentic Financial Brain (Tool Dispatcher)

Jarvis uses OpenAI function calling to autonomously investigate financial questions instead of context-stuffing raw data into prompts. The system is built around `server/tool-dispatcher.ts` which provides:

**Five Narrow-Scope Tools:**
- `get_profit_and_loss` — Returns P&L with account-level breakdown (sole source of truth for totals)
- `get_audit_lineage` — Traces a P&L spike to specific vendors/invoices (supports locationId filter)
- `get_price_variance` — Compares ingredient costs to regional wholesale averages
- `get_tip_distribution` — Correlates labor costs with tip-out data from Square
- `get_coa_definition` — Returns COA details with layman descriptions and NYS statutory categories

**Key Features:**
- `runAgenticLoop()` function handles the reasoning loop with parallel tool execution via `Promise.all`
- Hard depth limit of 5 tool calls per query with forced synthesis at limit
- Cross-domain triggers: labor account spike auto-appends tip distribution data
- SSE `thinking` events stream live status to frontend (e.g., "Checking the P&L...")
- All tool invocations logged to `ai_inference_logs` with `tool_calls` JSONB, `parent_inference_id` chaining, `logic_chain_path`, and `confidence_interval`
- Financial queries in Jarvis chat route through the agentic loop; non-financial queries use traditional streaming

**Schema additions:**
- `ai_inference_logs`: `tool_calls` (jsonb), `parent_inference_id` (integer), `logic_chain_path` (text), `confidence_interval` (double precision)
- `ledger_lines`: `statutory_tag` (text, nullable)

**Frontend:**
- `thinkingStatus` state in Assistant.tsx shows animated indicator during tool execution
- FinancialLineagePanel narratives enriched via agentic loop with "Verified via [Tool Name]" attribution

## Email Intelligence Engine

4-stage vendor email processing pipeline (`server/email-intelligence-engine.ts`) that automatically extracts financial data from vendor emails and anchors it to bank transactions:

**Extraction Stages:**
1. **Vector Extraction** — PDF text extraction via `pdfjs-dist` + OCR/Vision via GPT-4o for images
2. **Semantic HTML Parsing** — LLM prompt identifies "invisible tables" and order summaries in email HTML
3. **URL Forensic Analysis** — Regex locates portal links (view-order, invoice, receipt URLs)
4. **Headless Extraction** — Flags high-value external links for manual review (no Puppeteer in Replit)

**Cross-Reference Engine:**
- Anchors extracted amounts to `firm_transactions` by amount+date matching (±5 days, tiered confidence)
- Historical pattern matching from `journal_entries` for vendor COA code inference
- Vendor profiles learn from processing history (typical amounts, delivery methods, default COA codes)

**Intelligence Layer:**
- CapEx detection: amounts ≥$2,500 flagged for `asset-engine` capitalization
- Prepaid detection: retainer/annual fee keywords trigger `prepaid-engine` amortization proposals
- Auto-classification at ≥85% confidence; review queue for lower confidence

**Schema:** `vendor_profiles` (vendor behavior intelligence), `email_extractions` (extraction results + audit trail)

**API Routes:**
- `POST /api/email-intelligence/process` — process single email by messageId
- `POST /api/email-intelligence/scan` — scan and process all vendor emails (daysBack param)
- `GET /api/email-intelligence/summary` — extraction stats and vendor breakdown
- `GET /api/email-intelligence/extractions` — recent extraction results
- `GET /api/email-intelligence/vendor-profiles` — vendor intelligence profiles
- `PATCH /api/email-intelligence/vendor-profiles/:id` — update vendor profile (mark CapEx, set prepaid months)
- `GET /api/email-intelligence/review-queue` — items needing human review
- `POST /api/email-intelligence/approve/:id` — approve and execute (CapEx or prepaid amortization)

**Nightly Sync:** Automatically scans last 3 days of vendor emails during nightly sync cycle.

## Coffee Command Center - Components & Drink Builder

The Coffee Command Center includes:
- **Components Library** (`coffee_components` table): Coffee ingredients organized by category (Espresso, Milks, Syrups, Teas/Bases, Toppings, Cold Foam). Each component links to a `coffee_inventory` item for cost tracking.
- **Jarvis Drink Builder**: AI-powered drink recipe creation via natural language or photo upload. Endpoint at `POST /api/coffee/jarvis-parse-drinks` parses descriptions into structured recipes, matching components from the library. Parsed results are editable before saving (name, description, ingredients, quantities, units). Unmatched ingredients can be resolved by creating new components or linking to existing ones inline.
- **Base Drink Templates with Variations**: Drinks can have a `parentDrinkId` to create variation hierarchies (e.g., Iced Latte as a variation of Latte). Variations inherit base drink ingredients; override-only ingredients are stored on the variation. The API returns both `ingredients` (own) and `effectiveIngredients` (own + inherited from parent, with overrides applied by `coffeeInventoryId`).
- **End-to-End Cost Rollup**: Drink cost = sum of effective ingredient quantity × inventory cost per unit. Costs flow from inventory items → coffee inventory → drink ingredients → per-drink COGS. Expanded drink cards show per-ingredient cost with inherited/override indicators.
- Tables: `coffee_components`, `coffee_drink_recipes` (with `description`, `parent_drink_id`), `coffee_drink_ingredients` (with `coffee_component_id`, `is_override`), `coffee_inventory`.