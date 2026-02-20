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
PostgreSQL is the primary database, managed with Drizzle ORM. Key tables include `users`, `recipes` (supporting JSONB for ingredients/instructions and baker's percentage calculations), `recipe_versions` for historical data, `production_logs`, `sops`, `conversations` / `messages` for AI chat, `problems` for issue tracking, `events` for scheduling, `announcements`, `pastry_totals` (with forecast fields: forecastedCount, isManualOverride, source), `shaping_logs`, `bakeoff_logs`, `shifts` for team scheduling, `time_off_requests`, `locations` for multi-site support, `schedule_messages`, `pastry_passports` for detailed pastry profiles, `pastry_media`, `pastry_components`, `pastry_addins`, `kiosk_timers` (voice-activated), `task_jobs`, `task_lists`, `direct_messages`, `lamination_doughs` for dough tracking with full audit trail (who started, final rest time, who opened, who shaped), `pastry_items` as a master list, `time_entries` for clock-in/out, `break_entries`, `square_catalog_map` (links Square POS items to pastry master list), and `square_sales` (daily aggregated sales data from Square).

### Time Card System
A comprehensive time card system includes a persistent Clock Bar, a dedicated Kiosk Clock for PIN-based clock-in/out, and "My Time Cards" for personal history and adjustment requests. Managers can access "Time Review" for team time entries, approvals, and edits.

### Authentication & Roles
Authentication is PIN-based, with server-side sessions stored in PostgreSQL. The system supports `owner`, `manager`, and `member` roles, each with specific permissions. Protected routes enforce access control using middleware. Team management allows managers and owners to add and manage team members.

### AI Integration
The system integrates with OpenAI-compatible APIs for an AI assistant named Jarvis. Features include text chat with streaming responses, audio/voice capabilities (speech-to-text, text-to-speech), image generation, and invoice scanning using a vision model. Jarvis is dynamically contextualized with bakery-specific data (recipes, SOPs) from the database. Kiosk voice commands allow logging bake-offs, shaping, and setting timers.

### Key Design Patterns
The architecture emphasizes shared Zod schemas for type-safe API contracts and validation across the frontend and backend. JSONB fields are used for flexible data structures like recipe ingredients.

## External Dependencies

-   **PostgreSQL**: Required for all data storage.
-   **Replit Auth (OIDC)**: Used for user authentication.
-   **OpenAI-compatible API**: Powers AI features (Jarvis chat, voice, image generation, invoice scanning).
-   **Twilio (Optional)**: Stubbed for SMS notifications, requiring environment variables for full functionality.