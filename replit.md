# Jarvis Bakery OS

## Overview
Jarvis Bakery OS is a comprehensive full-stack bakery management application designed to optimize bakery operations, enhance efficiency, reduce waste, and provide data-driven insights. It includes advanced recipe management, daily production logging, SOP maintenance, AI assistance, multi-location support, team management, time tracking, and employee engagement features. The project aims to be a robust, scalable solution for modern bakery operations, improving decision-making and operational excellence for "Bear's Cup Bakehouse."

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture
The application uses a monorepo structure with a React 18 frontend (Vite, TypeScript, Wouter, TanStack React Query, shadcn/ui, Radix UI, Tailwind CSS, React Hook Form, Zod, Recharts) and an Express.js backend (Node.js, TypeScript, RESTful JSON API) backed by PostgreSQL with Drizzle ORM. The server runs in Eastern Time (`America/New_York`).

**Key Features & System Design:**

*   **Recipe System:** Supports inline scaling, production views, logged sessions, and "Recipe Assist," linking ingredients to inventory with video embeds.
*   **Lamination Studio:** Manages lamination dough lifecycles with FIFO tracking and automatic bake-off log creation, integrated with oven timers.
*   **Production Data Flow:** Centralized through `bakeoff_logs` for reporting, with data pipeline health dashboard, Square catalog matching, and bulk pastry passport creation.
*   **Maintenance & Solutions Hub:** Manages problems, equipment inventory, and service contacts, with automated problem creation and navigation.
*   **Prep EQ (Production Intelligence):** Tracks in-house components, demand calculations, and generates prep tasks with inventory adjustments.
*   **Soldout/86'd Tracking:** Records out-of-stock items with timestamps and attribution.
*   **COGS System:** Calculates real-time production costs using invoice, inventory, and recipe data.
*   **Invoice Capture:** AI vision model processes multi-image bakery invoices, supporting PDF uploads.
*   **Schedule & Shift Management:** Spreadsheet-style scheduling with AI-driven import, smart time parsing, shift pickups/claims with approval workflows, and reusable templates. **Business week runs Wednesday to Tuesday** (`weekStartsOn: 3` in date-fns, day 3 in TTIS). All scheduling, time review, payroll, and financial pages use this convention.
*   **Time Card System:** Features a persistent Clock Bar, PIN-based Kiosk Clock, personal management, "Time Review," and Square Labor Sync for seamless integration of clock-in/out data.
*   **Square Labor Sync:** Connects Square POS team members to Jarvis users and syncs timecards, supporting auto-linking, manual linking, date-range sync with deduplication, break entry import, and real-time webhook sync for timecard and order events.
*   **Department-Aware Inventory:** InventoryLinkPicker (in recipe create/edit) shows department filter pills (All/Bakery/Bar/Kitchen/FOH) defaulting to recipe's department. EOD inventory count requires selecting department(s) before starting, filtering items to only those departments. Count history shows which departments were counted. `inventory_counts` table has `departments` text array column.
*   **Live Inventory Real-Time Sync:** Auto-syncs Square sales data and provides real-time status indicators.
*   **Shift Notes:** Private manager feedback system with AI-rewritten constructive notes.
*   **Authentication & Roles:** PIN-based authentication with PostgreSQL sessions and role-based permissions (`owner`, `manager`, `member`), including `isDepartmentLead`, `isShiftManager`, and `isGeneralManager` flags.
*   **User Customization:** Owners can configure UI elements like sidebar visibility, landing pages, and access. Users can set language preference (English/French) on Profile page; `language` column on users table; `client/src/lib/i18n.ts` provides `t()` translation function applied to sidebar navigation and UI strings.
*   **Permission Levels:** Reusable, owner-configurable templates for managing access.
*   **Guest Department & Demo Mode:** "Guest" department for prospective buyers/outsiders who get the full personalized Jarvis experience. `demoMode` toggle on Profile page switches between real and sample data. Demo mode shows curated bakery data (production, schedules, announcements) and displays an amber "Demo Mode" banner. `useDemoQuery` hook available for frontend pages. Sample data in `server/demo-data.ts`. Home page `/api/home` returns demo data when active.
*   **AI Integration (Jarvis):** Utilizes OpenAI-compatible APIs for chat, audio, image generation, and invoice scanning.
*   **Consolidated Home Page:** Central operational hub with AI greeting/briefing, announcements, stats, production grid, problems, calendar, tasks, and quick actions.
*   **Jarvis Briefing:** AI-generated, personalized, calendar-aware briefings with owner-configurable briefing notes.
*   **Multi-Location Support:** All operational data tagged by `locationId`.
*   **Task Manager:** Comprehensive system with assignable tasks, jobs library, department to-dos, and AI-powered task generation.
*   **Employee Skills Tracking:** Ratings for AI-powered task assignment.
*   **Notes:** Full-featured system with personal/shared notes, voice dictation, AI generation, and photo-to-text functionality.
*   **Admin Insights Dashboard:** Owner-only analytics dashboard.
*   **KPI Report System:** Detailed business metrics with comparative analysis.
*   **TTIS (Tip Transparency Informational Dashboard):** Owner-only dashboard for Square POS tip allocation, with employee-facing tip totals on the Home page ClockBar. "True Hourly" column auto-populates from team profile `hourlyRate`, with manual override option.
*   **Test Kitchen:** Collaborative specials development with ingredient builders, real-time costing, and "Jarvis Optimize" for AI recipe analysis.
*   **Customer Feedback & QR Code:** Public-facing, location-aware feedback page with QR code generator. Sub-5-star submissions trigger a personalized Jarvis AI response offering expo counter remake/refund and email follow-up, secured with one-time capability tokens. Falls back to a warm static message if AI is unavailable.
*   **Sentiment Matrix:** Owner/GM dashboard correlating customer feedback with clocked-in team members.
*   **The Loop:** Manager-level feedback action dashboard with sentiment trends and AI-extracted themes.
*   **Platform 9¾ (FOH Command Center):** Full-screen kiosk display for FOH with filtered tasks, 86'd items, live oven timers, and FOH backup alerts.
*   **Vendor Management & Auto-Order Generation:** CRUD for vendors with auto-generated purchase orders.
*   **Lobby Check Alert:** Recurring, PIN-acknowledged alert system for FOH staff.
*   **Bagel Bros Display Screen:** Dedicated, full-screen bagel production display with drain table tracking, kettle timer, 4-deck oven controls, and FOH backup alerts.
*   **Messaging System:** Revamped iMessage/Slack-inspired messaging with two-column layout (inbox list + thread view), urgent message takeover overlay (`UrgentMessageOverlay.tsx` at z-[199]) that blocks app usage until urgent messages are acknowledged, dedicated `GET /api/messages/urgent-unread` endpoint, pulsing red sidebar indicator for urgent messages, urgent banner on Home page, reactions, replies with chat-bubble styling, pinned/archived message sections, and streamlined compose dialog with individual/role/department/everyone targeting.
*   **Global Acknowledgment System:** Supports forced logout and one-time, mandatory, Jarvis-branded overlay messages.
*   **Jarvis Intro Overlay:** One-time first-login overlay with the Jarvis elevator pitch, shown in the user's preferred language (EN/FR). Owner-configurable custom note appears above the pitch via Team Management admin page. Dismissed with "Let's go" and never shown again (`seenJarvisIntro` flag on users table, `jarvis_intro_note` in `app_settings`).
*   **Tutorial System:** First-visit tutorial overlays per page with video (YouTube/Vimeo/direct) and/or text content. Owner-managed via `/admin/tutorials` with department/role targeting, active toggle, sort order, preview, and per-tutorial or global view reset. `TutorialOverlay` component renders globally; `tutorial_views` table tracks dismissed tutorials per user. DB tables: `tutorials`, `tutorial_views`.
*   **HR Onboarding System:** Electronic onboarding with shareable invite links, ADP Run CSV export, handbook acknowledgment, and secure encryption of sensitive data. Includes manager dashboard, custom document upload with AI content extraction, and full W-4 collection.
*   **ADP RUN Integration:** OAuth2 + mutual TLS client for ADP RUN API, enabling worker retrieval/linking, profile sync, and payroll data input.
*   **Payroll Review System:** Owner-only page for payroll compilation, aggregating time entries, breaks, overtime, PTO, sick time, tips (from Square), hourly rates, and department allocations into ADP-ready format with issue detection and batch history. Gross estimate includes wages + overtime (1.5x) + PTO/sick + tips. Supports both hourly and salaried employees (`payType` column on users table, `annualSalary` for salary amount). Salaried employees get period-prorated pay (annual/365 * days). Pay info managed via Team Management with Hourly/Salary toggle. ADP push sends SAL earning code for salaried employees.
*   **Coffee Command Center:** Hub for coffee operations with dashboard, inventory, drink setup, and usage/sales tracking.
*   **The Firm (Financial Hub):** Owner-only forensic-level financial reconciliation system with overview, accounts, ledger, obligations, payroll, and cash management, including Jarvis AI financial analysis.
*   **La Carte Customer Portal:** Customer-facing subscription portal with Square catalog, "What's Fresh Today," "Coming Soon," Skip the Line ordering via Square Orders API, and order history.
*   **JMT (Jarvis Menu Theater):** Creative control board for all menu display management, including Command Center, Menu Library for design management, and Display Matrix for configuring 15 dynamic display slots with scheduling, rotation, 86'd item overlays, and real-time SSE push-to-screen (auto-refresh on display changes, 86'd updates, and manual push buttons).
*   **BC Wholesale Portal:** Forward-facing wholesale portal with PIN-based authentication (`server/wholesale-auth.ts`), separate session (`wholesaleCustomerId`). Features: catalog browsing with inline QTY input fields, order builder with template quick-load, recurring order templates by day of week, order history with status tracking, Square payment links for pending orders (via Square Checkout API), **automatic payment reconciliation** (Square webhook `order.created`/`order.updated`/`payment.completed` events auto-update wholesale order status to "paid" when payment link is completed, matching by payment note pattern `Wholesale Order #N`). Back navigation on all sub-pages. Order submission triggers owner message + calendar event. Owner admin page (`/wholesale-admin`) for managing customers, catalog items, and order statuses. **Onboarding flow**: Admin creates PIN-only customers (placeholder name "New Customer"); on first login, customers are redirected to `/wholesale/onboarding` to complete their profile (business name, contact, phone, email, address, Certificate of Authority number, ST-120 upload with blanket option). `onboardingComplete` flag gates portal access. DB tables: `wholesale_customers` (with `onboarding_complete`, `address`, `city`, `state`, `zip`, `certificate_of_authority`, `st120_file_path`, `st120_is_blanket`), `wholesale_catalog_items`, `wholesale_orders`, `wholesale_order_items`, `wholesale_recurring_templates`, `wholesale_recurring_template_items`. Frontend pages in `client/src/pages/wholesale/`.

## Performance Architecture
*   **Bundle Strategy:** Vite production build uses `manualChunks` to group 73 lazy-loaded pages into 8 logical bundles (pages-core, pages-production, pages-operations, pages-inventory, pages-admin, pages-display, pages-wholesale, pages-portal) plus vendor chunks. Reduces HTTP requests from ~157 to ~21 JS files.
*   **Suspense Boundaries:** Per-route `Suspense` inside `ProtectedRoute`/`PortalProtectedRoute`/`WholesaleProtectedRoute` keeps Layout/sidebar visible during page loads. Public routes wrapped individually.
*   **Prefetching:** `prefetchCoreRoutes()` pre-downloads 10 high-traffic pages after login. `PrefetchLink` component triggers prefetch on hover/touch for sidebar links.
*   **Polling Intervals:** Unread messages 30s, urgent messages 60s, lobby check 60s, dev feedback 60s, bakery timers 30s. Kiosk/display screens poll at 15s. Keep polling conservative to reduce server load.
*   **Error Boundary:** `AppErrorBoundary` in App.tsx catches all React render errors — chunk errors auto-reload, other errors show recovery UI.

## External Dependencies

*   **PostgreSQL**: Primary database.
*   **Replit Auth (OIDC)**: User authentication.
*   **OpenAI-compatible API**: For Jarvis AI features (chat, voice, image generation, invoice scanning).
*   **Twilio (Optional)**: For SMS notifications.
*   **ADP RUN API (Optional)**: Worker management and payroll data input.
*   **pdf-lib**: Server-side W-4 PDF generation.