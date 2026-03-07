# Jarvis Bakery OS

## Overview
Jarvis Bakery OS is a comprehensive full-stack bakery management application for "Bear's Cup Bakehouse," designed to optimize operations, enhance efficiency, reduce waste, and provide data-driven insights. It includes advanced recipe management, daily production logging, SOP maintenance, AI assistance, multi-location support, team management, time tracking, and employee engagement features. The project aims to be a robust, scalable solution for modern bakery operations, improving decision-making and operational excellence.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture
The application uses a monorepo structure with a React 18 frontend (Vite, TypeScript, Wouter, TanStack React Query, shadcn/ui, Radix UI, Tailwind CSS, React Hook Form, Zod, Recharts) and an Express.js backend (Node.js, TypeScript, RESTful JSON API) backed by PostgreSQL with Drizzle ORM.

**Key Features & System Design:**

*   **Recipe System:** Supports inline scaling, production views, logged sessions, and "Recipe Assist." Recipes link ingredients to inventory and can include how-to video embeds.
*   **Lamination Studio:** Manages lamination dough lifecycles with FIFO tracking and automatic bake-off log creation, including oven timer integration.
*   **Production Data Flow:** Centralized through `bakeoff_logs` for reporting, with `pastryItemId` for core tables, a data pipeline health dashboard, Square catalog item matching, and bulk pastry passport creation.
*   **Maintenance & Solutions Hub:** Manages problems (workflow, priority, assignment), equipment inventory (scheduling, overdue detection), and service contacts. Problems created from the Home page are fully linked — auto-set `status: "open"`, `priority` mapped from severity, `locationId` from context, and an initial note auto-created. Clicking a problem on Home navigates to `/maintenance?problem=ID` which auto-expands that problem card and relaxes location filtering to ensure visibility.
*   **Prep EQ (Production Intelligence):** Tracks in-house components (doughs, batters) with current levels, par levels, and demand calculations, generating prep tasks and auto-adjusting inventory. Includes piece-per-dough analytics and Jarvis briefing integration.
*   **Soldout/86'd Tracking:** Records out-of-stock items with timestamps, attribution, and location.
*   **COGS System:** Calculates real-time production costs using invoice, inventory, and recipe data.
*   **Invoice Capture:** AI vision model processes multi-image bakery invoices, with PDF upload support (client-side PDF-to-image conversion via `pdfjs-dist`).
*   **Schedule & Shift Management:** Spreadsheet-style scheduling with AI-driven import (CSV/images), smart time parsing, shift pickups/claims with confirmation dialog and optional notes, department/shift-type filtering, predefined presets, inline modification, color-coding for modified shifts, weekly hour counters, and reusable templates. Open shifts can be picked up by clicking in the grid or from the Shift Pickups tab; claims go to department leads, shift managers, and owners for approval. `claimNote` field on shifts stores pickup notes displayed on approval cards.
*   **Events & Calendar:** Manages events with team member tagging and personalized views.
*   **Time Card System:** Features a persistent Clock Bar, PIN-based Kiosk Clock, personal management, "Time Review," and Square Labor Sync (pulls clock-in/clock-out data from Square POS timecards into Jarvis `time_entries` with `source: "square"`).
*   **Square Labor Sync:** Owner-only page (`/square-labor`) that connects Square POS team members to Jarvis users and syncs timecards. Supports auto-linking by name, manual linking, date-range sync with deduplication via `squareShiftId`, and break entry import. Uses Square SDK v44 Labor API (`searchTimecards`, `teamMembers.search`). **Real-time webhook sync**: `POST /api/square/webhooks` endpoint receives `labor.timecard.created/updated/deleted` and `order.created/order.updated` events from Square, verified via HMAC-SHA256 (`SQUARE_WEBHOOK_SIGNATURE_KEY`), and automatically creates/updates/deletes Jarvis time entries or triggers a full sales re-sync for the order's date. Order webhook uses in-memory dedup cache (by order ID + updatedAt) to prevent redundant syncs. Falls back to manual date-range sync for backfilling.
*   **Live Inventory Real-Time Sync:** Live Inventory page auto-syncs Square sales on load (for today's date), polls every 15 seconds, and shows a "Live sync active" / "Manual sync only" indicator in the pipeline status bar based on webhook configuration.
*   **Shift Notes:** Private manager feedback system with AI-rewritten constructive notes visible to employees.
*   **Authentication & Roles:** PIN-based authentication with PostgreSQL sessions and role-based (`owner`, `manager`, `member`) permissions. Users can be flagged as `isDepartmentLead` (receives shift pickup notifications and can approve/deny for their department), `isShiftManager`, or `isGeneralManager`.
*   **User Customization:** Owners can configure sidebar visibility, landing pages, default departments, and section access.
*   **Permission Levels:** Reusable, owner-configurable templates for sidebar and section permissions.
*   **AI Integration (Jarvis):** Utilizes OpenAI-compatible APIs for chat, audio (STT/TTS), image generation, and invoice scanning.
*   **Consolidated Home Page:** Central operational hub with Jarvis greeting/briefing, announcements, stats, production grid, problems, calendar, tasks, vendor orders, messages, quick actions, and "Who's On" sidebar.
*   **Jarvis Briefing:** AI-generated, personalized, calendar-aware briefings on the Home page. Owners can write freeform "Briefing Notes" per team member (via Admin Users profile) — Jarvis weaves them into the greeting naturally without bold text or formatting. Notes auto-clear daily.
*   **Multi-Location Support:** Operational data tagged by `locationId`.
*   **Task Manager:** Comprehensive system with assignable task lists, jobs library, department to-dos, and AI-powered daily task generation.
*   **Employee Skills Tracking:** Ratings for AI-powered task assignment.
*   **Notes:** Full-featured system with personal/shared notes, voice dictation, AI generation of recipes/SOPs/events, "Jarvis Scribe" (photo-to-text), and "Email → Event."
*   **Admin Insights Dashboard:** Owner-only analytics dashboard.
*   **KPI Report System:** Detailed business metrics with period-over-period comparisons.
*   **Starkade:** In-house competitive gaming arcade with points and leaderboards.
*   **TTIS (Tip Transparency Informational Dashboard):** Owner-only dashboard for Square POS tip allocation. FOH employees (department="foh") see their weekly tip total directly on the Home page ClockBar when not clocked in, with a "User Agreement" confidentiality disclosure (green shield badge). When clocked in, the normal clocked-in status displays instead. Employee tip data served via `GET /api/ttis/my-tips`.
*   **Test Kitchen:** Collaborative specials development with ingredient builders, real-time costing, method steps, Lab Notes, scheduling, and "Jarvis Optimize" for AI recipe analysis.
*   **Customer Feedback & QR Code:** Public-facing, location-aware feedback page with QR code generator.
*   **Sentiment Matrix:** Owner/GM dashboard correlating customer feedback with clocked-in team members.
*   **The Loop:** Manager-level feedback action dashboard with sentiment trends, AI-extracted themes, and quick stats.
*   **Platform 9¾ (FOH Command Center):** Full-screen kiosk display for FOH with filtered tasks, 86'd items, live oven timers, and FOH backup alert.
*   **Vendor Management & Auto-Order Generation:** CRUD for vendors with auto-generated purchase orders based on stock levels.
*   **Lobby Check Alert:** Recurring, PIN-acknowledged alert system for FOH staff.
*   **Bagel Bros Display Screen:** Dedicated, full-screen bagel production display with drain table tracking (board dump = +20, load oven resets to 0), kettle timer, 4-deck oven with type selection (plain/poppy/sesame/everything), FOH backup alerts. `bagel_sessions` tracks `troughCount` (drain table, resets on load) and `totalBoardDumps` (cumulative per day, never resets). `bagel_oven_loads` tracks each oven load by type/count. Bagel production insights available in Admin Insights "Bagels" tab with daily totals, by-type breakdown (pie chart), daily bar chart, cumulative count, and detailed daily table.
*   **Global Acknowledgment System:** Supports forced logout and one-time, mandatory, Jarvis-branded overlay messages.
*   **Session Version & Force Logout:** Owner-initiated system to force-logout all users with an optional Jarvis message.
*   **Developer Mode & Dev Feedback:** Owner-only toggle for a global feedback system (bug reports, suggestions), AI-processed for categorization.
*   **HR Onboarding System:** Electronic onboarding with shareable invite links, ADP Run CSV export for completed submissions, handbook acknowledgment, non-compete agreements, and secure data handling (SSN/bank details encrypted with AES-256-GCM via `ONBOARDING_ENCRYPTION_KEY`). Includes manager dashboard with invite deletion (pending only), custom document upload with AI content extraction, mobile-optimized numeric inputs, and data security badge. ADP export decrypts sensitive fields for the CSV; manager view always shows masked values. Full IRS W-4 (2024) collection with PDF generation (`pdf-lib`), hourly wage on invites, and W-4 download for completed submissions.
*   **ADP RUN Integration:** OAuth2 + mutual TLS client (`server/adp-api.ts`) for ADP RUN API. Worker retrieval/linking (`adpAssociateOID` on users), worker profile sync (legal name, pay rate), code list retrieval (earning codes, pay cycles). Payroll Data Input API integration to push compiled timesheet data. Graceful feature gate — all ADP features hidden when credentials not configured.
*   **Payroll Review System:** Owner-only page (`/payroll`) with payroll compilation engine (`server/payroll-compiler.ts`) that aggregates time entries, break entries, overtime (weekly 40hr threshold), PTO, sick time, and department allocations into ADP-ready format. Includes pay period selector, employee payroll grid, issue panel (unapproved adjustments, active shifts, unlinked employees, schedule discrepancies), one-click Push to ADP, and payroll batch history tracking (`payroll_batches` table).
*   **Coffee Command Center:** Hub for coffee operations with dashboard, inventory, drink setup (formulas), and usage/sales tracking.
*   **The Firm (Financial Hub):** Owner-only forensic-level financial reconciliation system with overview, accounts, ledger, obligations, payroll, and cash management. Includes Jarvis AI financial analysis and educational tooltips.
*   **La Carte Customer Portal:** Customer-facing subscription portal with Square catalog, "What's Fresh Today," "Coming Soon," Skip the Line ordering via Square Orders API, and order history.

## Performance Optimizations (March 2026)
*   **Database Indexes**: 50+ indexes on FK columns (shifts, time_entries, bakeoff_logs, recipes, pastry_passports, etc.) for fast queries.
*   **Recipe List Optimization**: `GET /api/recipes` returns lightweight summaries (no ingredients/instructions JSONB). Individual recipe endpoint still returns full data.
*   **N+1 Query Fixes**: `getPastryPassport`, `getProblemContacts`, `getBOM` use batched `inArray` queries instead of per-item loops.
*   **Vite Manual Chunks**: Vendor splitting (react, radix, recharts, date-fns, react-hook-form) for smaller, cacheable bundles.
*   **Polling Optimization**: BagelBros/Kiosk/Platform934 polls at 15s (was 5s), LaminationStudio/BakeryTimerAlert at 30s (was 10s), all with `refetchOnWindowFocus: true`.
*   **HTTP Compression**: `compression` middleware enabled on Express.
*   **Static Asset Caching**: Hashed Vite assets get 1-year immutable cache headers.
*   **Log Truncation**: Response body logging truncated to 200 chars to avoid stringify overhead on large payloads.

## External Dependencies

*   **PostgreSQL**: Primary database.
*   **Replit Auth (OIDC)**: User authentication.
*   **OpenAI-compatible API**: For Jarvis AI features (chat, voice, image generation, invoice scanning).
*   **Twilio (Optional)**: For SMS notifications.
*   **ADP RUN API (Optional)**: Worker management and payroll data input via OAuth2 + mutual TLS. Requires `ADP_CLIENT_ID`, `ADP_CLIENT_SECRET`, `ADP_SSL_CERT`, `ADP_SSL_KEY` environment variables. All ADP features gracefully hidden when not configured.
*   **pdf-lib**: Server-side W-4 PDF generation for onboarding submissions.