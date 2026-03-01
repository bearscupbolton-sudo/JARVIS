# Jarvis Bakery OS

## Overview
Jarvis Bakery OS is a comprehensive full-stack bakery management application designed to optimize operations for "Bear's Cup Bakehouse." It aims to enhance efficiency, reduce waste, and provide data-driven insights across various bakery functions. Key capabilities include advanced recipe management with production scaling, daily production logging, SOP maintenance, and an AI assistant named "Jarvis." The system also supports multi-location businesses, team management, time card tracking, and employee engagement through an in-house gaming arcade. The project's vision is to provide a robust, scalable solution for modern bakery operations, offering tools for better decision-making and operational excellence.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture
The application utilizes a monorepo structure, separating client-side (React, Vite, TypeScript), server-side (Express, Node.js, TypeScript), and shared resources.

**Frontend:** A React 18 SPA built with TypeScript and Vite, using Wouter for routing, TanStack React Query for state management, and shadcn/ui on Radix UI with Tailwind CSS for styling. Forms are managed with React Hook Form and Zod validation, and data visualizations are powered by Recharts.

**Backend:** An Express.js API server developed in Node.js and TypeScript, providing a RESTful JSON API. Route contracts and validation are enforced using shared Zod schemas. Database interactions are abstracted through an `IStorage` interface.

**Database:** PostgreSQL is the primary database, managed with Drizzle ORM.

**Key Features & System Design:**

*   **Recipe System:** Supports inline scaling, distraction-free production views, logged recipe sessions, and "Recipe Assist" for guided production. Recipes are categorized by department and can link ingredients to inventory items. Immersive "Begin Recipe" flows guide users through steps, deducting inventory on completion.
*   **Lamination Studio:** Manages the full lifecycle of lamination doughs, including creation, folding, resting, shaping, and destination, with a FIFO "Next Up" system and automatic bake-off log creation.
*   **Production Data Flow:** All production output, including lamination and manual bake-offs, flows through `bakeoff_logs` for unified reporting.
*   **Soldout/86'd Tracking:** Tracks out-of-stock items with timestamps, attribution, and location.
*   **COGS System:** Calculates real-time per-pastry production costs by integrating invoice data, inventory costs, and recipe ingredient costs.
*   **Invoice Capture:** Supports multi-image invoice uploads processed by an AI vision model. Images are compressed client-side (1600px max, JPEG 85%) before sending. The AI prompt is optimized for bakery-specific invoices with abbreviation handling, handwritten correction support, credit memos, and structured error feedback. Utility: `client/src/lib/image-utils.ts`.
*   **Schedule & Shift Management:** Provides 24-hour shift scheduling with AI-driven generation and block clearing capabilities.
*   **Events & Calendar:** Manages events with team member tagging and personalized views, supporting both public and private events with strict privacy enforcement.
*   **Time Card System:** Includes a persistent Clock Bar, PIN-based Kiosk Clock, personal time card management, and a "Time Review" module.
*   **Authentication & Roles:** PIN-based authentication with PostgreSQL sessions. Roles (`owner`, `manager`, `member`) enforce permissions, with specific data access restrictions for revenue, profit, cost, and live inventory.
*   **User Customization:** Owners can designate General Managers with expanded approval capabilities, customize sidebar visibility for each user, and set default landing pages per team member.
*   **AI Integration (Jarvis):** Integrates with OpenAI-compatible APIs for an AI assistant providing text chat, audio (STT/TTS), image generation, and invoice scanning.
*   **Consolidated Home Page:** A central operational hub featuring Jarvis greeting, AI briefing, announcements, stats, pre-shift notes, production grid, problems tracker, calendar, tasks, vendor orders, messages, quick actions, and a "Who's On" sidebar.
*   **Jarvis Briefing:** An AI-generated, personalized briefing on the Home page, tailored to the user's role, bakery state, and time of day.
*   **Multi-Location Support:** Facilitates operations across multiple bakery locations, tagging operational data by `locationId`.
*   **Task Manager:** A comprehensive task management system with assignable task lists, a jobs library, and department to-dos. Supports individual and department assignments, progress tracking, and AI-powered daily task list generation based on various operational factors.
*   **Employee Skills Tracking:** Allows managers/owners to rate team member skills for intelligent task assignment by Jarvis AI.
*   **Notes:** A full-featured notes system supporting personal and shared notes with voice dictation. Features AI-powered generation of Recipes, SOPs, Calendar Events, or Letter Head documents from note content. Includes "Jarvis Scribe" — photo-to-text transcription of handwritten notes via `POST /api/notes/scribe`, using the shared image compression utility. First-time intro stored in localStorage key `jarvis_scribe_intro_seen`.
*   **Admin Insights Dashboard:** An owner-only dashboard with analytics across various categories, including Overview, Team, Production, Lamination, Messages, Features, KPI Report, and Performance.
*   **KPI Report System:** Provides detailed business metrics with period-over-period comparisons.
*   **Starkade:** An in-house competitive gaming arcade with a unified points system and leaderboards.
*   **TTIS (Tip Transparency Informational Dashboard):** An owner-only dashboard for allocating Square POS tip data among FOH staff based on clock-in/out times.
*   **Test Kitchen:** A collaborative specials development page where drink and bakery specials are created, tested, reviewed, and finalized. Features: card grid with department/status filters, ingredient builder with real-time costing (linked to inventory items), method steps, cost/unit and margin calculations, status progression (draft→testing→review→finalized→archived) with server-side transition validation, collaborative Lab Notes (note/tasting/revision/approval types), schedule settings (start/end dates, lead days, daily sales). Finalized specials auto-include ingredients on vendor purchase orders within the configured lead days window. Tables: `test_kitchen_items`, `test_kitchen_notes`. Route: `/test-kitchen`.
*   **Customer Feedback & QR Code:** A public-facing feedback page with a QR code generator for customer visit ratings and comments.
*   **Platform 9¾ (FOH Command Center):** A dedicated full-screen kiosk display for FOH, showing filtered task lists, 86'd items, and a prominent FOH backup alert button. Includes configurable lobby check settings.
*   **Vendor Management & Auto-Order Generation:** Full CRUD for vendors, including contact info, order days, and linked inventory items with par and order-up-to levels. Auto-generates purchase orders based on stock levels, with preview, edit, and Twilio SMS capabilities.
*   **Lobby Check Alert:** A recurring, PIN-acknowledged alert system for FOH staff to check the lobby at configurable intervals during business hours.
*   **Bagel Bros Display Screen:** A dedicated, full-screen, bilingual bagel production display with a kettle flip timer, oven grid with countdown timers, and FOH backup alert system integration.
*   **Global Acknowledgment System:** Supports forced logout of all users and a one-time, mandatory, Jarvis-branded overlay message on next login.
*   **Session Version & Force Logout:** An owner-initiated system to force-logout all users by invalidating sessions client-side and server-side, with an optional Jarvis message on re-login.
*   **Developer Mode & Dev Feedback:** An owner-only toggle enabling a global feedback system where team members can submit bug reports, suggestions, or ideas, which are then AI-processed for categorization and priority, and managed on a dedicated feedback page.

## External Dependencies

*   **PostgreSQL**: Primary database.
*   **Replit Auth (OIDC)**: User authentication.
*   **OpenAI-compatible API**: For Jarvis AI features (chat, voice, image generation, invoice scanning).
*   **Twilio (Optional)**: For SMS notifications.