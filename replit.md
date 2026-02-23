# Jarvis Bakery OS

## Overview

Jarvis Bakery OS is a full-stack bakery management application designed for "Bear's Cup Bakehouse." It aims to streamline bakery operations by providing tools for recipe management (including baker's percentage calculations and production scaling), daily production logging, Standard Operating Procedure (SOP) maintenance, and an AI assistant named "Jarvis" for bakery-related queries. The project's vision is to enhance efficiency, reduce waste, and provide data-driven insights for professional bakers.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Project Structure
The application follows a monorepo structure, separating client-side (React SPA with Vite + TypeScript), server-side (Express API), and shared resources (types, schemas, route definitions).

### Frontend Architecture
The frontend is built with React 18 and TypeScript, using Vite for bundling. Wouter handles client-side routing, while TanStack React Query manages server state. UI components are built using shadcn/ui on Radix UI, styled with Tailwind CSS for an industrial/bakery aesthetic. Forms utilize React Hook Form with Zod for validation, sharing schemas with the backend. Markdown content is rendered via react-markdown, and production data is visualized with Recharts.

### Backend Architecture
The backend is an Express.js API server running on Node with TypeScript. It provides a RESTful JSON API, with route contracts and validation defined using Zod schemas in a shared module. A dedicated `IStorage` interface abstracts database access.

### Database
PostgreSQL is the primary database, managed with Drizzle ORM. Key tables include `users`, `recipes` (supporting JSONB for ingredients/instructions and baker's percentage calculations), `recipe_versions` for historical data, `production_logs`, `sops`, `conversations` / `messages` for AI chat, `problems` for issue tracking, `events` for scheduling, `announcements`, `pastry_totals` (with forecast fields: forecastedCount, isManualOverride, source), `shaping_logs`, `bakeoff_logs`, `shifts` for team scheduling, `time_off_requests`, `locations` for multi-site support, `schedule_messages`, `pastry_passports` for detailed pastry profiles, `pastry_media`, `pastry_components`, `pastry_addins`, `kiosk_timers` (voice-activated), `task_jobs`, `task_lists`, `direct_messages`, `lamination_doughs` for dough tracking with full audit trail (who started, final rest time, who opened, who shaped, destination proof/freezer, proof timer, bake-off), `pastry_items` as a master list, `time_entries` for clock-in/out, `break_entries`, `square_catalog_map` (links Square POS items to pastry master list), and `square_sales` (daily aggregated sales data from Square).

### Recipe System
Recipes at `/recipes/:id` feature inline scaling (no separate scaler sidebar). Two scaling methods: (1) **Unit Weight × Unit Qty** — enter weight per unit and number of units, system scales all ingredients proportionally; (2) **Ingredient-driven** — change any ingredient quantity and all others adjust proportionally. **Begin Recipe** (`/recipes/:id/begin`) opens a distraction-free production view with the current scale locked in. Each ingredient has a click-to-cross-off checklist with progress bar. After all ingredients are weighed, user submits with optional notes. Sessions logged to `recipe_sessions` table (recipeId, userId, scaleFactor, unitWeight, unitQty, scaledIngredients JSONB, notes, assistMode, startedAt, completedAt). **Recipe Assist** is a per-user setting (`recipeAssistMode` on users table) with levels: `off` (normal), `optional` (user can toggle guided mode), `mandatory` (forced one-ingredient-at-a-time), `photo_required` (must upload photo of each ingredient on scale before confirming), `locked` (no recipe access — user sees restricted message). Managed by owner/manager via PUT `/api/users/:userId/recipe-assist`. API: POST/GET `/api/recipe-sessions`.

### Lamination Studio
Full dough lifecycle tracking at `/lamination`. Each dough gets a sequential number (#1, #2...) for fridge identification. Flow: Start New Dough (select type + intended pastry + Turn 1 fold → optional 20-min freezer chill if too warm → Turn 2 fold, fold sequence auto-derived) → 30-min final rest on The Rack (red locked timer) → Open Dough → Shape & Complete (select pastry type, pieces, destination). Destinations: **Proof Box** (status "proofing" with 4-phase timer: red/locked 0-2h, yellow/clickable 2-3h, green 3-4h, flashing overproofing 4h+; bake-off button auto-logs to bakeoff_logs), **Freezer** (status "frozen" with move-to-proof or move-to-fridge options), or **Fridge** (status "fridge", no timer, can move to proof when ready). Key fields on `lamination_doughs`: doughNumber, intendedPastry (plan visible on rack), destination (proof/freezer/fridge), proofStartedAt, proofPieces, bakedAt, bakedBy, chillingUntil (for 20-min freezer chill between turns), shapings (JSONB array of `{ pastryType, pieces }` for multi-pastry shaping). Statuses: turning → chilling (optional) → resting → proofing/frozen/fridge → baked. Intended pastry is set during dough creation for team visibility; final pastry type is chosen separately during shaping. Dough number popup shown after creation (first 10 doughs) to encourage parchment labeling.

**Multi-Pastry Shaping**: During Shape & Complete, users can add multiple pastry types with individual piece counts from a single dough (e.g., 12 Butter Croissants + 8 Pain au Chocolat). "Add & Shape Another Pastry Type" button accumulates entries before choosing destination. Stored in `shapings` JSONB column; `pastryType` field stores the primary type, `totalPieces`/`proofPieces` store the combined total.

**Edit Dough**: Pencil icon on all dough cards (rack, proof box, freezer, fridge). Rack doughs can edit: dough type, intended pastry, Turn 1/Turn 2 folds. Proof/frozen/fridge doughs can edit: pastry types and pieces (with multi-shaping add/remove support). PATCH `/api/lamination/:id` accepts all editable fields including `doughType` and `shapings`.

### Time Card System
A comprehensive time card system includes a persistent Clock Bar, a dedicated Kiosk Clock for PIN-based clock-in/out, and "My Time Cards" for personal history and adjustment requests. Managers can access "Time Review" for team time entries, approvals, and edits.

### Authentication & Roles
Authentication is PIN-based, with server-side sessions stored in PostgreSQL. The system supports `owner`, `manager`, and `member` roles, each with specific permissions. Protected routes enforce access control using middleware. Team management allows managers and owners to add and manage team members.

### AI Integration
The system integrates with OpenAI-compatible APIs for an AI assistant named Jarvis. Features include text chat with streaming responses, audio/voice capabilities (speech-to-text, text-to-speech), image generation, and invoice scanning using a vision model. Jarvis is dynamically contextualized with bakery-specific data (recipes, SOPs) from the database. Kiosk voice commands allow logging bake-offs, shaping, and setting timers.

### Jarvis Briefing
Personalized AI-generated briefing on the Home page, replacing the old smart nudges system. Uses OpenAI (gpt-4o-mini) to generate a natural-language, 2-4 sentence briefing tailored to each user's role, current bakery state (dough statuses, production logs, unread messages, pending time-off requests), and time of day. The bear logo (`/bear-logo.png`) serves as the Jarvis avatar. Key features:
- **Caching**: Briefings cached for 30 minutes per user (fields `lastBriefingText`, `lastBriefingAt` on users table) to control API costs. Refresh button forces a new generation.
- **User Preference**: `showJarvisBriefing` boolean on users table (default true). Toggle in Profile settings. When off, briefing is hidden.
- **Custom Welcome Message**: Owner/manager can set `jarvisWelcomeMessage` per user via Team Management detail dialog. Shown once on the user's first briefing view (tracked by `jarvisBriefingSeenAt` timestamp).
- **Dismiss/Refresh**: Users can dismiss the briefing for the current session or refresh to get an updated one.
- API endpoints: `GET /api/home/jarvis-briefing` (supports `?refresh=true` and `?force=true`), `POST /api/home/jarvis-briefing/seen`, `PUT /api/users/:userId/jarvis-settings`, `PUT /api/users/:userId/welcome-message` (manager+).

### Key Design Patterns
The architecture emphasizes shared Zod schemas for type-safe API contracts and validation across the frontend and backend. JSONB fields are used for flexible data structures like recipe ingredients.

## External Dependencies

-   **PostgreSQL**: Required for all data storage.
-   **Replit Auth (OIDC)**: Used for user authentication.
-   **OpenAI-compatible API**: Powers AI features (Jarvis chat, voice, image generation, invoice scanning).
-   **Twilio (Optional)**: Stubbed for SMS notifications, requiring environment variables for full functionality.

### Multi-Location Support
Phase 1 (Foundation) is implemented. Key components:
- `user_locations` join table links users to locations (with `isPrimary` flag)
- `locations` table has `squareLocationId` for Square POS mapping
- Operational tables (`pastryTotals`, `shifts`, `timeEntries`, `squareSales`, `squareCatalogMap`) have `locationId` column
- `LocationProvider` context (in `client/src/hooks/use-location-context.tsx`) wraps authenticated routes, providing `selectedLocationId` to all pages
- Location selector dropdown appears in sidebar when multiple locations exist
- Selected location persisted in localStorage (`jarvis-location-id`)
- Backend queries for pastry totals and shifts accept optional `locationId` filter via query param
- API endpoints: `GET /api/my-locations` (user's assigned locations with fallback to all), `PUT /api/user-locations/:userId` (manager+), `GET /api/locations/:id/users`

### Admin Insights Dashboard
Owner-only analytics dashboard at `/admin/insights` with six tabs:
- **Overview**: 8 KPI cards with period-over-period comparison (green/red arrows showing % change vs prior period), activity trend area chart, hourly activity heatmap (7×24 grid showing when team is most active), and top 5 features mini-list.
- **Team**: Activity breakdown table (name, role, logins, page views, messages, sessions, last active). Click any row for **per-user drill-down dialog** showing: summary stats, daily activity chart, top features used, recent recipe sessions, recent doughs created. Login frequency bar chart.
- **Production**: Top recipes by yield/sessions horizontal bar chart, daily production volume area chart, **Square Sales vs Production correlation** (overlays items sold, production yield, and revenue to spot over/under production).
- **Lamination**: Status distribution pie chart, doughs by type bar chart, daily created-vs-baked pipeline, top dough creators.
- **Messages**: Monitor all P2P/direct messages (sender, recipients, subject, body, read/ack status).
- **Features**: Feature popularity horizontal bar chart + detailed table (rank, path, views, unique users, avg views/user).
Activity tracking: `activity_logs` table (userId, action, metadata JSONB, createdAt). Logins logged server-side on successful PIN auth. Page views logged client-side on route change via Layout component. API: `POST /api/activity` (auth required), `GET /api/admin/insights/*` endpoints (owner-only). Supports configurable time range (7/14/30/90 days). New endpoints: `/summary-comparison` (period vs prior), `/heatmap` (hourly grid), `/user-drilldown/:userId` (per-user detail), `/sales-vs-production` (Square correlation).

### TTIS (Tip Transparency Informational Dashboard)
Owner-only dashboard at `/admin/ttis` that pulls tip data from Square POS orders and allocates tips evenly among FOH (Front of House) staff who were on scheduled shifts when each tip was collected. Uses `America/New_York` timezone for tip-to-shift matching. Handles midnight-crossing shifts. Falls back to splitting among all FOH staff if no specific shift match is found. Supports AM/PM time formats (e.g., "6:00 AM") via `parseTimeToMinutes` helper. API endpoints: `GET /api/ttis?date=YYYY-MM-DD` (daily detail), `GET /api/ttis/week?startDate=YYYY-MM-DD` (weekly aggregation with per-staff totals and per-day summaries). Frontend defaults to week view with configurable work week start day (persisted in localStorage), week navigation, and click-to-drill-into-day detail view.