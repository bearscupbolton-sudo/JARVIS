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
This module tracks the full lifecycle of lamination doughs, assigning sequential numbers for identification. It manages dough creation, folding steps (with optional chilling), resting, and destination assignment (Proof Box, Freezer, Fridge). It includes a multi-pastry shaping feature, allowing multiple pastry types from a single dough, and comprehensive editing capabilities for doughs at various stages. The rack view shows ALL active doughs regardless of date (via `/api/lamination/active`), with a FIFO "Next Up" card highlighting the next ready dough and a clickable line-item list for remaining doughs. Old doughs display their creation date. Dough status changes automatically clear Jarvis briefing caches to prevent stale data.

### Time Card System
A comprehensive system includes a persistent Clock Bar, a PIN-based Kiosk Clock, personal "My Time Cards" for history and adjustment requests, and a "Time Review" for managers to approve and edit team entries.

### Authentication & Roles
Authentication is PIN-based with server-side PostgreSQL sessions. Roles include `owner`, `manager`, and `member`, with permissions enforced by middleware.

### AI Integration
The system integrates with OpenAI-compatible APIs for "Jarvis," an AI assistant providing text chat (with streaming), audio capabilities (STT/TTS), image generation, and invoice scanning via a vision model. Jarvis is contextualized with bakery data and supports kiosk voice commands for logging production.

### Jarvis Briefing
The Home page features a personalized, AI-generated briefing (2-4 sentences) tailored to the user's role, bakery state, and time of day. It utilizes gpt-4o-mini and includes caching, user preferences for visibility and focus (FOH, BOH, Management), and a customizable welcome message. Jarvis is shift-aware: it checks the user's schedule and weaves shift context into every greeting (e.g., "I see you're on later, here's how the day is going"). It detects when a user hasn't been on the schedule for 4+ days and gives a "welcome back" greeting. After 13+ consecutive days of shifts, Jarvis triggers a wellness nudge encouraging the person to rest, hydrate, and stretch. The AI prompt is strictly grounded — Jarvis only states facts from real database data and never invents or assumes information.

### Multi-Location Support
The system supports multiple bakery locations. Users can be assigned to locations, and operational data (e.g., pastry totals, shifts) is tagged by `locationId`. A `LocationProvider` manages the selected location, which is persisted locally.

### Admin Insights Dashboard
An owner-only dashboard provides analytics across six tabs: Overview (KPIs, activity trends), Team (activity breakdown, per-user drill-down), Production (recipe popularity, daily volume, Square Sales correlation), Lamination (dough status, pipeline), Messages (P2P message monitoring), and Features (popularity, usage). Activity is tracked via `activity_logs`.

### Starkade (Competitive Gaming Arcade)
A team gaming arcade at `/starkade` offers built-in games (Lightning Reflexes, Bakery Memory, Baker's Brainteaser, Pastry Scramble) with a unified points system and global/game-specific leaderboards. It includes an AI Game Generator for custom game creation. Access is restricted when users are clocked in.

### TTIS (Tip Transparency Informational Dashboard)
An owner-only dashboard at `/admin/ttis` pulls Square POS tip data and allocates it evenly among FOH staff based on scheduled shifts. It handles timezone conversions and midnight-crossing shifts, providing daily and weekly tip summaries per staff member.

## External Dependencies

-   **PostgreSQL**: Primary database for all data storage.
-   **Replit Auth (OIDC)**: User authentication.
-   **OpenAI-compatible API**: Powers AI features (Jarvis chat, voice, image generation, invoice scanning).
-   **Twilio (Optional)**: Stubbed for SMS notifications.