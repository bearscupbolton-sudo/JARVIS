# Jarvis Bakery OS

## Overview

Jarvis Bakery OS is a full-stack bakery management application built for "Bear's Cup Bakehouse." It provides professional bakers with tools to manage recipes (with baker's percentage calculations and production scaling), log daily production output, maintain Standard Operating Procedures (SOPs), and interact with an AI assistant ("Jarvis") for bakery-related guidance.

The app follows a monorepo structure with a React frontend, Express backend, PostgreSQL database, and OpenAI-powered AI integrations.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Project Structure
```
client/          → React SPA (Vite + TypeScript)
server/          → Express API server
shared/          → Shared types, schemas, and route definitions
  ├── schema.ts  → Drizzle ORM table definitions (re-exports models)
  ├── routes.ts  → API route contracts with Zod validation
  └── models/    → Domain model definitions (auth, chat)
migrations/      → Drizzle migration files
script/          → Build scripts
```

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Bundler**: Vite with HMR in development
- **Routing**: Wouter (lightweight client-side router)
- **State/Data Fetching**: TanStack React Query for server state management
- **UI Components**: shadcn/ui (New York style) built on Radix UI primitives
- **Styling**: Tailwind CSS with CSS variables for theming. Industrial/bakery aesthetic with custom fonts (Inter, Oswald, JetBrains Mono)
- **Forms**: React Hook Form with Zod resolvers (schemas shared with backend)
- **Markdown**: react-markdown for rendering SOP content and chat messages
- **Charts**: Recharts for production data visualization
- **Path aliases**: `@/` maps to `client/src/`, `@shared/` maps to `shared/`

### Backend Architecture
- **Framework**: Express.js running on Node with TypeScript (tsx)
- **HTTP Server**: Node's `createServer` wrapping Express (supports WebSocket upgrade)
- **API Design**: RESTful JSON API under `/api/` prefix. Route contracts defined in `shared/routes.ts` with Zod schemas for input validation and response typing
- **Storage Layer**: `IStorage` interface in `server/storage.ts` with `DatabaseStorage` implementation — all DB access goes through this abstraction
- **Development**: Vite dev server is served as Express middleware for HMR
- **Production**: Client is built to `dist/public`, server is bundled with esbuild to `dist/index.cjs`

### Database
- **Database**: PostgreSQL (required — `DATABASE_URL` environment variable)
- **ORM**: Drizzle ORM with `drizzle-zod` for schema-to-validation bridging
- **Schema Push**: `npm run db:push` uses drizzle-kit to push schema changes
- **Key Tables**:
  - `users` — Replit Auth user profiles (varchar PK)
  - `sessions` — Server-side session storage for express-session
  - `recipes` — Bakery recipes with JSONB ingredients/instructions. Ingredients support optional `group` field for sub-dough grouping (e.g. Beurre Manié, Détrempe). Baker's percentages are computed per-group when groups are present
  - `recipe_versions` — Recipe version history snapshots (recipeId, versionNumber, title, description, yieldAmount, yieldUnit, ingredients, instructions, category, changedBy, changeNote, createdAt). Auto-created before each recipe update to preserve historical state
  - `production_logs` — Daily production yield tracking linked to recipes
  - `sops` — Standard Operating Procedures (markdown content)
  - `conversations` / `messages` — AI chat history
  - `problems` — Issue tracker with severity, location, completed toggle, notes
  - `events` — Calendar events with detail fields (title, description, date, endDate, eventType, contactName, contactPhone, contactEmail, address, startTime, endTime). Feeds Forward Look on Dashboard and Calendar page. Any authenticated user can delete events
  - `announcements` — Team message board posts
  - `pastry_totals` — Daily target counts per pastry item (date, item_name, target_count)
  - `shaping_logs` — Dough shaping entries that deduct from pastry totals (date, dough_type, yield_count, shaped_at)
  - `bakeoff_logs` — Bake-off entries showing items out of the oven (date, item_name, quantity, baked_at), feeds to dashboard
  - `shifts` — Team schedule entries with department-based staffing (userId, shiftDate, startTime, endTime, department, position, notes, createdBy, locationId). Max 10 staff per department per day enforced server-side
  - `time_off_requests` — Time off requests with approval workflow (userId, startDate, endDate, requestType, reason, status, reviewedBy)
  - `locations` — Multi-location support (name, address, isActive). Default location created on startup
  - `schedule_messages` — Shift coverage forum (userId, message, messageType, relatedDate, resolved, locationId)
  - `pastry_passports` — Detailed pastry profiles with description, assembly instructions, baking notes, finish steps, linked to a mother dough recipe and category
  - `pastry_media` — Photos/videos attached to pastry passports (uploaded photos stored in uploads/ dir, video URLs)
  - `pastry_components` — Links pastry passports to component recipes (many-to-many with notes)
  - `pastry_addins` — Free-form store-bought add-in ingredients for pastry passports
  - `kiosk_timers` — Kitchen timers set via voice commands (label, durationSeconds, startedAt, expiresAt, dismissed, createdBy)
  - `task_jobs` — Reusable saved activities/tasks, optionally linked to SOPs (name, description, sopId, createdBy)
  - `task_lists` — Task list metadata (title, description, createdBy)
  - `task_list_items` — Entries in a task list with time windows (listId, jobId or manualTitle, startTime, endTime, sortOrder, completed)
  - `direct_messages` — Direct messages sent by managers/owners (senderId, subject, body, priority, requiresAck, targetType, targetValue)
  - `message_recipients` — Per-user message delivery tracking (messageId, userId, read, readAt, acknowledged, acknowledgedAt)
  - `lamination_doughs` — Lamination Studio dough tracking (date, doughType, turn1Fold, turn2Fold, foldSequence, status [turning/resting/completed], restStartedAt, pastryType, totalPieces, createdBy, completedAt). 30-minute rest timer enforced client-side with red "Do Not Touch" state
  - `pastry_items` — Master pastry list mapping each pastry to its dough type (name, doughType, isActive). Used as the single source of truth for pastry names throughout the system. Lamination Studio completion shows filtered dropdown by dough type (active items only). Managed by managers/owners at `/admin/pastry-items`

### Authentication & Roles
- **Method**: PIN-based authentication (no sign-up; managers/owners add team members)
- **Sessions**: Server-side sessions stored in PostgreSQL via `connect-pg-simple`
- **Flow**: Login page shows username + PIN form. First-time setup creates owner account. Managers/owners add new team members via Team page with a login PIN
- **Protected Routes**: `isAuthenticated` middleware checks `req.session.userId` and attaches `req.appUser`; client-side `useAuth` hook redirects unauthenticated users to login
- **Roles**: Three roles — `owner` (full access), `manager` (can manage team, create schedules, approve time off), `member` (basic access, can request time off)
- **Middleware**: `isOwner` (owner only), `isManager` (owner or manager), `isUnlocked` (non-locked users)
- **Team Management**: Accessible to managers and owners. Shows contact info (phone, email, emergency contact). Managers can add members, owners can change roles/lock/delete/reset PINs
- **Important**: The `users` and `sessions` tables must not be dropped. PINs are bcrypt-hashed and never exposed via API

### AI Integration (Replit AI Integrations)
Located in `server/replit_integrations/`:
- **Chat**: OpenAI-compatible API for text conversations with streaming SSE responses. Conversations and messages are persisted in PostgreSQL
- **Audio/Voice**: Voice recording, speech-to-text, text-to-speech with AudioWorklet playback
- **Image Generation**: Image generation via `gpt-image-1` model
- **Invoice Scanning**: GPT-5.2 vision model parses invoice photos into structured data (vendor, date, line items with prices). Endpoint: `POST /api/invoices/scan`
- **Batch Processing**: Generic batch processor with rate limiting and retries for bulk LLM operations
- **Environment Variables**: `AI_INTEGRATIONS_OPENAI_API_KEY` and `AI_INTEGRATIONS_OPENAI_BASE_URL`

### Key Design Patterns
- **Shared validation**: Zod schemas defined in `shared/` are used by both frontend (form validation, response parsing) and backend (request validation)
- **Type-safe API contracts**: `shared/routes.ts` defines method, path, input schema, and response schemas for every endpoint
- **JSONB for flexible data**: Recipe ingredients and instructions are stored as JSONB arrays, allowing flexible schema without extra join tables
- **Baker's percentage calculations**: Client-side computation of baker's percentages relative to total flour weight

## External Dependencies

### Required Services
- **PostgreSQL**: Primary database — must have `DATABASE_URL` environment variable set
- **Replit Auth (OIDC)**: Authentication provider — requires `ISSUER_URL`, `REPL_ID`, and `SESSION_SECRET` environment variables

### Optional AI Services
- **OpenAI-compatible API** (via Replit AI Integrations): Powers the Jarvis assistant chat, voice features, and image generation. Requires `AI_INTEGRATIONS_OPENAI_API_KEY` and `AI_INTEGRATIONS_OPENAI_BASE_URL`
- **Jarvis Context**: On each chat message, the system prompt is dynamically built by fetching all recipes (with ingredients, instructions, baker's percentages) and all SOPs from the database. This makes Jarvis aware of the bakery's actual data and able to answer questions about specific recipes and procedures.
- **Kiosk Voice Commands**: POST `/api/kiosk/voice-log` accepts `{ text }` (from Web Speech API) or `{ audio }` (base64 webm). AI parses commands into bake-off logs, shaping logs, timer creation, or question answering. Timers managed via GET/POST `/api/kiosk/timers` and POST `/api/kiosk/timers/:id/dismiss`.

### Personalized Home Page & Inbox
- **Home** (`/`): Personalized landing page for each user. Shows unread message count, upcoming shifts, bake-off summary, pinned announcements, and quick action links. Managers/owners see additional stats (staff count, pending time-off requests)
- **Inbox**: Built into Home page. Managers/owners can compose messages to individuals, roles, departments, or everyone. Messages support priority levels (normal/urgent) and optional acknowledgment requirements. Unread count badge shows in sidebar
- **Dashboard** (`/dashboard`): The original operational dashboard with pre-shift notes, out-of-oven status, who's on today, forward look, problems tracker, and announcements. Moved from `/` to `/dashboard`

### Kiosk & Display Screens
- **Jarvis Kiosk** (`/kiosk`): Always-listening voice assistant with "Jarvis" wake word via Web Speech API. Chat-style UI, manual push-to-talk fallback, active timer panel with countdown and audio alarms. Protected route, no sidebar (noLayout). Supports bake-off logging, shaping logging, timer setting, and answering bakery questions.
- **Bakery by the Numbers** (`/display`): Public commercial display showing production scoreboard. Auto-refreshes every 15s. Shows targets vs out-of-oven vs shaped vs remaining per item with progress bars. No auth required — designed for wall-mounted monitors.

### Optional SMS Notifications (Twilio — not yet configured)
- **Status**: Stub implementation in `server/sms.ts` — logs messages to console until Twilio is configured
- **To enable**: Set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_PHONE_NUMBER` environment variables (or connect the Twilio integration via Replit)
- **Features**: Schedule change notifications (shift created/updated/deleted) sent to team members who opt in via Profile page
- **User opt-in**: Users must enter their phone number and enable SMS notifications on their Profile page

### Key NPM Packages
- `drizzle-orm` / `drizzle-kit` / `drizzle-zod` — Database ORM and schema management
- `express` / `express-session` — HTTP server and session handling
- `passport` / `openid-client` — OIDC authentication
- `@tanstack/react-query` — Client-side data fetching and caching
- `wouter` — Client-side routing
- `zod` — Runtime type validation (shared between client and server)
- `react-markdown` — Markdown rendering
- `recharts` — Data visualization
- `date-fns` — Date formatting
- `openai` — AI API client