# Jarvis Bakery OS

## Overview

Jarvis Bakery OS is a full-stack bakery management application designed to streamline operations for "Bear's Cup Bakehouse." It provides tools for recipe management (including baker's percentage and production scaling), daily production logging, SOP maintenance, and an AI assistant named "Jarvis." The project aims to enhance efficiency, reduce waste, provide data-driven insights, and support multi-location businesses. It also includes features for team management, time card tracking, and employee engagement through an in-house gaming arcade.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Project Structure
The application uses a monorepo structure, separating client-side (React, Vite, TypeScript), server-side (Express, Node.js, TypeScript), and shared resources (types, schemas).

### Frontend Architecture
The frontend is a React 18 SPA with TypeScript, bundled by Vite. It uses Wouter for routing, TanStack React Query for state management, and shadcn/ui on Radix UI with Tailwind CSS for styling. Forms are handled by React Hook Form with Zod validation. Markdown is rendered via react-markdown, and data visualizations use Recharts.

### Backend Architecture
The backend is an Express.js API server in Node.js and TypeScript, offering a RESTful JSON API. Route contracts and validation are defined using shared Zod schemas. Database access is abstracted via an `IStorage` interface.

### Database
PostgreSQL is the primary database, managed with Drizzle ORM. It stores data for users, recipes (with JSONB for ingredients and versioning), production logs, SOPs, AI conversations, problem tracking, events, announcements, pastry totals, lamination dough tracking, time cards, and multi-location specific data.

### Recipe System
The recipe system supports inline scaling with two methods: Unit Weight × Unit Quantity, or Ingredient-driven proportional adjustment. A "Begin Recipe" feature provides a distraction-free production view with ingredient checklists. Recipe sessions are logged, and a per-user "Recipe Assist" mode offers guided production with varying levels of strictness, including photo requirements.

### Lamination Studio
This module tracks the full lifecycle of lamination doughs, assigning sequential numbers for identification. It manages dough creation, folding steps (with optional chilling), resting, and destination assignment (Proof Box, Freezer, Fridge). It includes a multi-pastry shaping feature, allowing multiple pastry types from a single dough, and comprehensive editing capabilities for doughs at various stages. The rack view shows ALL active doughs regardless of date (via `/api/lamination/active`), with a FIFO "Next Up" card highlighting the next ready dough and a clickable line-item list for remaining doughs. Old doughs display their creation date. Dough status changes automatically clear Jarvis briefing caches to prevent stale data. When both folds are 4-fold (4×4), the system prompts for a `foldSubtype` classification: "Cross Laminated" or "Bi Color". This subtype is displayed on dough cards and is editable. Doughs in the Proof Box or Freezer can be trashed with a required reason (stored as `trashReason`, `trashedAt`, `trashedBy`); trashed doughs are excluded from active views. Proof box phases: Red (0-2h, "DO NOT TOUCH"), Yellow/Amber (2-3h, "Ready Soon"), Green (3-4h, "Ready to Bake"), Orange pulsing with ring (4h+, "OVERPROOFING" — clearly distinct from red). Room temperature proofing: a dough in the proof box can be set to "Room Temp" via a sun button, starting a 5-hour minimum timer (`roomTempAt`). When returned to the proof box, remaining time is halved (`adjustedProofStartedAt` recalculates effective proof start).

### Pastry Passport & Master Pastry List Integration
The Pastry Passport system (`pastry_passports` table) is linked to the Master Pastry List (`pastry_items` table) via a nullable `pastryItemId` foreign key on passports. When creating a new passport, users can select from the master list to auto-fill the name and category (dough type maps to passport category, e.g., Croissant/Danish → Viennoiserie). The Master Pastry List page shows which items have linked passports (with a "View Passport" badge) and which don't (with an "Add Passport" link that pre-fills the connection). The Passport Detail page shows linked master item info (dough type, active status) with a link back to the master list. In the Lamination Studio, shaped doughs display a passport stamp icon next to pastry type names when a matching passport exists, allowing bakers to quickly reference assembly/finishing instructions during production. Passport lookup works by matching `pastryItemId` first, then falling back to name matching.

### COGS (Cost of Goods Sold) System
A real-time cost tracking system that calculates per-pastry production costs. The pipeline: Invoice scanning → inventory item `costPerUnit` (auto-updated from invoice `unitPrice`) → recipe ingredient cost matching (name + alias fuzzy match with unit conversion: kg↔g, L↔mL) → per-pastry cost allocation. The cost engine (`server/cost-engine.ts`) provides `calculateRecipeCost(recipeId)` for ingredient-level cost breakdown and `calculatePastryCost(pastryItemId)` combining dough cost, fat cost, add-in costs, and component recipe costs. There is no waste tracking — scraps are reused in new doughs. Instead, dough cost per piece is calculated by isolating the actual dough grams: total piece weight minus add-in/component weights per piece. Add-ins and components on passports have a `weightPerPieceG` field (grams of that ingredient per finished pastry). The `dough_type_configs` table stores `baseDoughWeightG` (standard dough weight before butter, e.g., 4700g), `fatRatio`, `fatInventoryItemId`, and `fatDescription`. Total dough weight = baseDoughWeightG + butter weight. The shaping dialog auto-fills total dough weight from the config. Scraps are implied (total dough weight minus pieces × dough grams per piece) and shown in the cost breakdown but not deducted from cost. API endpoints: `GET /api/recipes/:id/cost`, `GET /api/pastry-items/:id/cost`, `GET /api/pastry-items/costs` (batch). The Pastry Passport Detail page shows a Cost Breakdown card with data completeness badges (Full/Partial/No Data). The Master Pastry List shows estimated cost per item.

### Invoice Capture (Multi-Image)
The invoice capture page supports uploading multiple photos at once or adding photos one at a time before scanning. Users stage images (with thumbnails and remove buttons), then hit "Scan" to send all images to the vision model simultaneously. The backend accepts `images` (array) and passes all to gpt-5.2 as a multi-image message. For multi-page invoices, the AI prompt instructs combining all line items without duplication. Server-side validation enforces 15MB max per image and allowlisted MIME types.

### Schedule & Shift Management
The schedule system supports full 24-hour availability (12:00 AM–11:30 PM in 30-minute intervals). Shifts have three statuses: "assigned" (standard), "open" (available for pickup), and "pending" (claimed, awaiting approval). Managers can post open shifts that any team member can pick up; claims require approval from a designated shift manager or owner. The shifts table includes `status`, `claimedBy`, and `claimedAt` columns. Shift managers (designated by owners via `isShiftManager` flag on users) can also upload CSV/Excel spreadsheets or photos which Jarvis AI parses to auto-generate schedules with a preview-and-confirm workflow. Push notifications are sent on shift creation, updates, pickup requests, approvals, and denials.

### Time Card System
A comprehensive system includes a persistent Clock Bar, a PIN-based Kiosk Clock, personal "My Time Cards" for history and adjustment requests, and a "Time Review" for managers to approve and edit team entries.

### Authentication & Roles
Authentication is PIN-based with server-side PostgreSQL sessions. Roles include `owner`, `manager`, and `member`, with permissions enforced by middleware. Owners can designate managers as "Shift Managers" (`isShiftManager` flag) who gain the ability to approve shift pickup requests and import schedules. Security policy: revenue/profit data (Square sales, KPIs, TTIS tips) is owner-only. Cost data (invoices, pastry COGS) requires manager+. Hourly rates are stripped from API responses for non-owners.

### Per-User Sidebar Visibility
Owners can control which sidebar items each team member sees via the user detail dialog in Team management. The `sidebarPermissions` JSONB field on users stores an array of allowed sidebar paths (null = all items allowed for their role). The Layout component filters all nav sections (navigation, shortcuts, admin items) based on these permissions. Owners always see all items regardless of permissions.

### AI Integration
The system integrates with OpenAI-compatible APIs for "Jarvis," an AI assistant providing text chat (with streaming), audio capabilities (STT/TTS), image generation, and invoice scanning via a vision model. Jarvis is contextualized with bakery data and supports kiosk voice commands for logging production.

### Jarvis Briefing
The Home page features a personalized, AI-generated briefing (2-4 sentences) tailored to the user's role, bakery state, and time of day. It utilizes gpt-4o-mini and includes caching, user preferences for visibility and focus (FOH, BOH, Management), and a customizable welcome message. Jarvis is shift-aware: it checks the user's schedule and weaves shift context into every greeting (e.g., "I see you're on later, here's how the day is going"). It detects when a user hasn't been on the schedule for 4+ days and gives a "welcome back" greeting. After 13+ consecutive days of shifts, Jarvis triggers a wellness nudge encouraging the person to rest, hydrate, and stretch. The AI prompt is strictly grounded — Jarvis only states facts from real database data and never invents or assumes information.

### Multi-Location Support
The system supports multiple bakery locations. Users can be assigned to locations, and operational data (e.g., pastry totals, shifts) is tagged by `locationId`. A `LocationProvider` manages the selected location, which is persisted locally.

### Admin Insights Dashboard
An owner-only dashboard provides analytics across seven tabs: Overview (KPIs, activity trends), Team (activity breakdown, per-user drill-down), Production (recipe popularity, daily volume, Square Sales correlation), Lamination (dough status, pipeline), Messages (P2P message monitoring), Features (popularity, usage), and KPI Report (comprehensive financial/operational KPIs). Activity is tracked via `activity_logs`.

### KPI Report System
The KPI Report tab in Admin Insights provides comprehensive business metrics with period-over-period comparisons. It includes: (1) Summary KPI cards (Total Revenue, Labor Cost, Labor Cost %, Food Cost %, Revenue per Labor Hour, Average Transaction Value) with % change indicators, (2) Revenue Trend line chart, (3) Sales vs Production grouped bar chart, (4) Per-employee Labor Breakdown table with hours, rates, and costs, (5) Food Cost Breakdown with donut chart and detail table, (6) Waste Report (trashed doughs, scrap weight, reasons), (7) Peak Hours staffing chart. Users have a nullable `hourlyRate` field for labor cost calculations. Data sources: Square sales (`square_sales`), Square daily summaries (`square_daily_summary` with order counts and hourly breakdowns), time entries with break deduction, COGS engine, recipe sessions, bakeoff logs, and lamination doughs. Endpoints: `GET /api/admin/insights/kpi-report`, `GET /api/admin/insights/kpi-labor-detail`, `GET /api/admin/insights/kpi-production-detail` — all accept `?days=N` parameter. CSV export is available for the full report and each individual section (revenue, labor, food cost, sales vs production). Summary KPI cards are clickable and open drill-down dialogs with detailed breakdowns, charts, and sortable tables. The production detail drill-down shows per-item variance (produced vs sold) with COGS.

### Starkade (Competitive Gaming Arcade)
A team gaming arcade at `/starkade` offers built-in games (Lightning Reflexes, Bakery Memory, Baker's Brainteaser, Pastry Scramble) with a unified points system and global/game-specific leaderboards. It includes an AI Game Generator for custom game creation. Access is restricted when users are clocked in.

### TTIS (Tip Transparency Informational Dashboard)
An owner-only dashboard at `/admin/ttis` pulls Square POS tip data and allocates it evenly among FOH staff based on scheduled shifts. It handles timezone conversions and midnight-crossing shifts, providing daily and weekly tip summaries per staff member.

## External Dependencies

-   **PostgreSQL**: Primary database for all data storage.
-   **Replit Auth (OIDC)**: User authentication.
-   **OpenAI-compatible API**: Powers AI features (Jarvis chat, voice, image generation, invoice scanning).
-   **Twilio (Optional)**: Stubbed for SMS notifications.