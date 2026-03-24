# Jarvis Bakery OS

## Overview
Jarvis Bakery OS is a full-stack bakery management application designed to optimize operations, enhance efficiency, reduce waste, and provide data-driven insights. It aims to be a robust, scalable solution for modern bakeries, improving decision-making and operational excellence. Key capabilities include advanced recipe management, daily production logging, AI assistance, multi-location support, and comprehensive team and financial management.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture
The application is built as a monorepo with a React 18 frontend (Vite, TypeScript, Wouter, TanStack React Query, shadcn/ui, Radix UI, Tailwind CSS) and an Express.js backend (Node.js, TypeScript, RESTful JSON API) utilizing PostgreSQL with Drizzle ORM. The server operates in Eastern Time (`America/New_York`).

**Core Architectural Decisions and Features:**

*   **Monorepo Structure:** Centralized codebase for frontend and backend.
*   **Modern Frontend Stack:** Leveraging React 18 with a comprehensive UI library (`shadcn/ui`, Radix UI) and styling (`Tailwind CSS`).
*   **Robust Backend:** Express.js with TypeScript and a PostgreSQL database managed by Drizzle ORM for type-safe database interactions.
*   **Comprehensive Bakery Management:**
    *   **Recipe System:** Supports inline scaling, production views, and integrates with inventory.
    *   **Lamination Studio:** Manages lamination dough lifecycles with FIFO tracking and automated bake-off logs.
    *   **Production Data Flow:** Centralized through `bakeoff_logs` for reporting and integrated with Square catalog.
    *   **Maintenance & Solutions Hub:** Manages equipment, problems, and service contacts.
    *   **Prep EQ:** Tracks in-house components, calculates demand, and generates prep tasks.
    *   **COGS System:** Real-time production cost calculation using invoice, inventory, and recipe data.
    *   **Invoice Capture:** AI vision model for processing multi-image bakery invoices. Enhanced with US Foods integration: automatic shorts detection (ordered vs shipped), substitution tracking, price variance alerts (>5% increase flagged), pack-size extraction, and delivery alert badges. Gmail auto-scan configured for US Foods order confirmations, invoices, ACH payments, and will-call invoices.
    *   **Schedule & Shift Management:** Spreadsheet-style scheduling with AI import, shift pickups, and reusable templates. Business week runs Wednesday to Tuesday.
    *   **Time Card System:** PIN-based Kiosk Clock, personal time management, and seamless Square Labor Sync.
    *   **Department-Aware Inventory:** Inventory items are managed with department filters for accuracy in recipe linking and counts.
    *   **Live Inventory Real-Time Sync:** Auto-syncs Square sales data with real-time status.
    *   **Authentication & Roles:** PIN-based authentication with role-based permissions (`owner`, `manager`, `member`) and granular flags.
    *   **Multi-Location Support:** All operational data is tagged by `locationId`.
    *   **AI Integration (Jarvis):** Utilizes OpenAI-compatible APIs for chat, audio, image generation, and invoice scanning, providing features like AI greetings, personalized briefings, and recipe optimization.
    *   **Consolidated Home Page:** A central operational hub with AI features, announcements, stats, and quick actions.
    *   **Task Manager:** Assignable tasks, job library, and AI-powered task generation.
    *   **Notes System:** Full-featured notes with AI generation and photo-to-text.
    *   **Admin Insights & KPI Reports:** Owner-only dashboards for analytics and business metrics.
    *   **TTIS (Tip Transparency Informational Dashboard):** Owner-only tip allocation dashboard with employee-facing totals.
    *   **Test Kitchen:** Collaborative specials development with real-time costing and AI recipe analysis.
    *   **Customer Feedback & Sentiment Matrix:** Public-facing feedback system with AI responses and sentiment analysis correlated with clocked-in teams.
    *   **Platform 9¾ (FOH Command Center):** Kiosk display for FOH tasks, 86'd items, and live timers.
    *   **Vendor Management & Auto-Order Generation:** CRUD for vendors with automated purchase order generation.
    *   **Messaging System:** iMessage/Slack-inspired messaging with urgent message overlays and targeted communication.
    *   **Global Acknowledgment System:** For mandatory messages and forced logouts.
    *   **Tutorial System:** Page-specific tutorial overlays with video/text content.
    *   **HR Onboarding System:** Electronic onboarding with invite links, document uploads, and W-4 collection.
    *   **Payroll Review System:** Owner-only page for payroll compilation, integrating time entries, tips, and department allocations into ADP-ready format. The Firm's Payroll tab includes a live Payroll Preview (`/api/payroll/compile`) showing employee breakdown with hours, OT, tips (TTIS-matched FOH-only split logic), rates, and gross estimates. Tips use the same allocation as TTIS: FOH staff only, owners excluded, fallback chain (on-duty FOH → all clocked-in FOH → scheduled FOH). Wed–Tue work week.
    *   **The Firm (Financial Hub):** Forensic-level financial reconciliation with accounts, ledger, payroll, cash management, and Square sales tax reporting. Includes AI financial analysis. Plaid bank/CC integration for automatic account linking, balance sync, and transaction import (`plaid_items`, `plaid_accounts` tables; env vars: `PLAID_CLIENT_ID`, `PLAID_SECRET`, `PLAID_ENV`). **Double-Entry Accounting**: Full Chart of Accounts (41 seeded accounts), journal entry posting with debit=credit enforcement, and financial reports (P&L, Balance Sheet with Current Year Earnings, Cash Flow, Trial Balance). Tables: `chart_of_accounts`, `journal_entries`, `ledger_lines`. Engine: `server/accounting-engine.ts`. Frontend tabs: COA, Journal, Reports in TheFirm.tsx. **Autonomous Financial Intelligence Layer**: AI inference middleware classifies every transaction through LLM before/after ledger commit (GPT-4o), with anomaly detection (auto-commit if score <0.1, pending review if >=0.1). Ghost Accountant engine (`server/ghost-accountant.ts`) runs vertical analysis (COGS % comparison vs prior period, labor ratios, expense benchmarks) and horizontal analysis (Saratoga vs Bolton per-location labor-to-revenue ratios). Tables: `ai_inference_logs`, `financial_consultations`. Command Center dashboard tab: real-time P&L, AI transaction classifier, Jarvis Recommendations feed with implement/dismiss actions, AI executive summary generation.
    *   **La Carte Customer Portal:** Customer-facing subscription portal with Square catalog integration and ordering.
    *   **JMT (Jarvis Menu Theater):** Creative control board for dynamic menu display management with scheduling and real-time updates.
    *   **Compliance & Statutory Reporting Layer (CSRL):** Event-driven compliance engine monitoring NYS statutory obligations. Tables: `compliance_calendar` (13 seeded 2026 filings: CT-3-S, IT-204-LL, 4x NY-45, 4x ST-100, 3x PTET-EST), `sales_tax_jurisdictions` (Saratoga 7% code 4103, Bolton 8% code 5703). Engine: `server/compliance-engine.ts` — IT-204-LL tiered fee calculator, PTET 6.85% estimator, per-location ST-100 liability with jurisdiction rates, cash readiness validator, periodic scheduler (4-hour interval). API routes: `/api/firm/compliance/dashboard`, `/calendar`, `/recalculate`, `/readiness`, `/tax-liability`, `/jurisdictions`. Frontend: Compliance tab in TheFirm.tsx with alert banners (CRITICAL/URGENT/WARNING), KPI cards (open filings, next due, revenue YTD, IT-204-LL fee, cash readiness), expandable filing rows with Jarvis analysis, jurisdiction table, mark-filed workflow.
    *   **Operational Finance Layer:** Virtual Liquidity Layer computing "Real Cash" (Burnable Cash) = Bank Balance - Sales Tax Accrued - Open Placeholders - Upcoming Filings (30d). Accrual placeholders (Ghost Entries) with CRUD, TTL stale-check worker (days 1-3, 12h interval). Real Cash widget on Overview tab. Ghost Entries management in Reconcile tab. Tables: `accrual_placeholders`. Routes: `/api/firm/adjusted-cash`, `/api/firm/placeholders` CRUD. Engine: `server/reconciler.ts` with 30+ vendor templates for auto-matching.
    *   **Donation ROI Pipeline:** Tracks product donations as contractual exchanges of value. 501(c)(3) entities → COA 7700 (Charitable Donations). Non-501(c)(3) → COA 7040 (Promotional/Marketing) under IRS Business Promotion rules. Auto-computes COGS from unit cost × quantity, posts double-entry journal (Debit expense / Credit Inventory 1100) on approval. Table: `donations`. Routes: `/api/firm/donations` CRUD, `/approve`, `/summary`. YTD summary with ROI calculation. Frontend: Donations tab in TheFirm.tsx.
    *   **Lightning-Offset Reconciliation:** Template-based bank transaction matching in Reconcile tab. Lightning button (⚡) on each bank transaction fetches auto-suggestions: vendor template match → Debit COGS/Credit Cash, or accrual placeholder match → Debit Accrued Liabilities (2100)/Credit Cash (1010) to prevent double-counting. Route: `/api/firm/reconcile/suggest`. Confidence scoring (95% exact, 85% vendor, 80% close, 60% vendor-only).
    *   **Asset RAgent (ARA) — Fixed Asset Management:** Twin-track depreciation engine for capital equipment. Every asset runs two parallel schedules: Book Ledger (Straight-Line for clean P&L — e.g., $30k = $250/mo over 120 months) and Tax Ledger (Section 179 full Year 1 deduction). Autonomous CapEx detection flags transactions >$2,500 from known equipment vendors. Tables: `fixed_assets`, `depreciation_schedules`, `depreciation_entries`, `asset_audit_log`. Engine: `server/asset-engine.ts`. COA: 1500 (Fixed Assets), 1510 (Accumulated Depreciation), 6130 (Depreciation Expense). Routes: `/api/firm/assets` CRUD, `/capitalize`, `/schedules`, `/audit-log`, `/summary`, `/depreciation/post`, `/capex-check`. Immutable audit trail for all depreciation changes. Location tagging (SARATOGA_01, BOLTON_02) for site-level P&Ls. 2026 Section 179 limit: $2,560,000. CapEx detection integrated into Lightning-Offset reconciliation suggest endpoint. Frontend: Assets tab in TheFirm.tsx.
    *   **Employee Reimbursements:** Full CRUD for tracking employee out-of-pocket expenses. Category-aware expense classification (Supplies, Ingredients, Packaging, Equipment, Delivery, Technology). "Mark Paid" action auto-posts a double-entry journal (DR expense account / CR Cash Drawer) within a DB transaction, creating a cash payout log entry simultaneously. Location-aware: Saratoga uses 1030, Bolton uses 1031. Table: `employee_reimbursements`. Routes: `/api/firm/reimbursements` CRUD, `/api/firm/reimbursements/:id/pay`. Frontend: Reimbursements tab in TheFirm.tsx.
    *   **AI Learning Rules (Vendor Intelligence):** Machine learning for vendor-to-COA mapping. When a user reconciles a bank transaction, the system learns the vendor string → COA code mapping. Subsequent transactions from the same vendor get auto-suggested. Table: `ai_learning_rules`. Routes: `/api/firm/learning-rules` CRUD. Integrated into Lightning-Offset suggest with confidence scoring (type: "learned_rule"). Functions: `findLearnedVendorRule()`, `learnVendorRule()` in `server/reconciler.ts`.
    *   **Cash Payout Logs:** Immutable audit trail for all cash disbursements from the drawers. Every reimbursement payment and manual cash payout gets logged with source account, target COA, recipient, and linked journal entry. Table: `cash_payout_logs`. Routes: `/api/firm/cash-payouts` CRUD.
    *   **BC Wholesale Portal:** Forward-facing wholesale portal with PIN-based authentication, order building, recurring templates, Square payment links, and automatic payment reconciliation.

## External Dependencies

*   **PostgreSQL**: Primary database for all application data.
*   **Replit Auth (OIDC)**: Handles user authentication.
*   **OpenAI-compatible API**: Provides AI capabilities for chat, audio, image generation, and invoice scanning.
*   **Twilio (Optional)**: Used for SMS notifications.
*   **ADP RUN API (Optional)**: Integrates for worker management and payroll data input.
*   **Square POS API**: Integrated for catalog, orders, payments, labor sync, and sales tax data.
*   **pdf-lib**: Server-side generation of W-4 PDFs.