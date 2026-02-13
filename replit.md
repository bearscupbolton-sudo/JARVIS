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
  - `recipes` — Bakery recipes with JSONB ingredients/instructions
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

### Authentication & Roles
- **Method**: Replit OpenID Connect (OIDC) authentication via Passport.js
- **Sessions**: Server-side sessions stored in PostgreSQL via `connect-pg-simple`
- **Flow**: `/api/login` redirects to Replit OIDC, callback upserts user, session cookie is set
- **Protected Routes**: `isAuthenticated` middleware on server; client-side `useAuth` hook redirects unauthenticated users to login
- **Roles**: Three roles — `owner` (full access), `manager` (can create schedules, approve time off), `member` (basic access, can request time off)
- **Middleware**: `isOwner` (owner only), `isManager` (owner or manager), `isUnlocked` (non-locked users)
- **Important**: The `users` and `sessions` tables are mandatory for Replit Auth — do not drop them

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