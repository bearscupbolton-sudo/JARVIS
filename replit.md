# Jarvis Bakery OS

## Overview
Jarvis Bakery OS is a comprehensive full-stack bakery management application designed to optimize operations for "Bear's Cup Bakehouse." Its primary purpose is to enhance efficiency, reduce waste, and provide data-driven insights across various bakery functions. Key capabilities include advanced recipe management with production scaling, daily production logging, SOP maintenance, and an AI assistant named "Jarvis." The system also supports multi-location businesses, team management, time card tracking, and employee engagement through an in-house gaming arcade. The project aims to provide a robust, scalable solution for modern bakery operations, offering tools for better decision-making and operational excellence.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture
The application utilizes a monorepo structure, separating client-side (React, Vite, TypeScript), server-side (Express, Node.js, TypeScript), and shared resources.

**Frontend:** A React 18 SPA built with TypeScript and Vite, using Wouter for routing, TanStack React Query for state management, and shadcn/ui on Radix UI with Tailwind CSS for styling. Forms are managed with React Hook Form and Zod validation, and data visualizations are powered by Recharts.

**Backend:** An Express.js API server developed in Node.js and TypeScript, providing a RESTful JSON API. Route contracts and validation are enforced using shared Zod schemas. Database interactions are abstracted through an `IStorage` interface.

**Database:** PostgreSQL is the primary database, managed with Drizzle ORM. It stores all operational data, including users, recipes (with JSONB for ingredients and versioning), production logs, SOPs, AI conversations, problem tracking, events, announcements, pastry totals, lamination dough tracking, time cards, and multi-location specific data.

**Key Features & System Design:**

*   **Recipe System:** Supports inline scaling (Unit Weight × Unit Quantity or Ingredient-driven proportional adjustment), offers a distraction-free "Begin Recipe" production view, and logs recipe sessions. Features "Recipe Assist" for guided production and categorizes recipes by department (bakery, kitchen, bar).
*   **Lamination Studio:** Tracks the full lifecycle of lamination doughs, managing creation, folding steps, resting, and destination. Includes multi-pastry shaping, comprehensive editing, and a FIFO "Next Up" system for active doughs. Features specific handling for 4x4 folds (`foldSubtype`) and trash functionality for doughs. Proof box phases are visually indicated (Red, Yellow, Green, Orange) with specific timings, and includes room temperature proofing logic.
*   **Pastry Passport & Master Pastry List:** Integrates `pastry_passports` with a `pastry_items` master list. Allows users to select from the master list to pre-fill passport details and visually indicates linked passports within the Lamination Studio. Cost data is shown on passport and master list details.
*   **COGS System:** Calculates real-time per-pastry production costs by integrating invoice data, inventory item costs, and recipe ingredient costs. The cost engine provides granular breakdowns, considering dough weight, fat, and add-ins. Cost data completeness is indicated via badges.
*   **Invoice Capture (Multi-Image):** Supports uploading multiple images for invoice scanning, processing them simultaneously with an AI vision model. The AI combines line items from multi-page invoices.
*   **Schedule & Shift Management:** Provides 24-hour shift scheduling with "assigned," "open," and "pending" statuses. Managers can post open shifts for team pickup, requiring approval. Supports AI-driven schedule generation from uploaded documents.
*   **Events & Calendar:** Manages events with team member tagging, displaying personalized events on the Home page. Events are fully editable via a detail dialog and support 12-hour AM/PM time format.
*   **Event Jobs:** Allows creation, assignment, and tracking of jobs/tasks associated with events, visible on the Home page for assigned users.
*   **Time Card System:** Includes a persistent Clock Bar, a PIN-based Kiosk Clock, personal time card management, and a "Time Review" module for manager approvals and edits.
*   **Authentication & Roles:** PIN-based authentication with PostgreSQL sessions. Roles include `owner`, `manager`, and `member`, with permissions enforced by middleware. Owners can designate "Shift Managers." Security policy restricts access to sensitive financial and cost data.
*   **Per-User Sidebar Visibility:** Owners can customize sidebar item visibility for each team member via `sidebarPermissions`.
*   **AI Integration (Jarvis):** Integrates with OpenAI-compatible APIs for an AI assistant providing text chat, audio (STT/TTS), image generation, and invoice scanning. Jarvis is contextualized with bakery data and supports kiosk voice commands.
*   **Jarvis Briefing:** An AI-generated, personalized briefing on the Home page, tailored to the user's role, bakery state, and time of day. It is shift-aware, provides welcome-back greetings, and wellness nudges. The AI strictly adheres to factual data from the database.
*   **Multi-Location Support:** Facilitates operations across multiple bakery locations, tagging operational data by `locationId`.
*   **Admin Insights Dashboard:** An owner-only dashboard with analytics across several categories: Overview, Team, Production, Lamination, Messages, Features, and a comprehensive KPI Report. Activity is tracked via `activity_logs`.
*   **KPI Report System:** Provides detailed business metrics with period-over-period comparisons, including revenue, labor cost, food cost, sales vs. production, waste reports, and peak hours staffing. Offers CSV export and drill-down capabilities for detailed analysis.
*   **Starkade:** An in-house competitive gaming arcade with built-in games, a unified points system, and leaderboards. Access is restricted when clocked in.
*   **TTIS (Tip Transparency Informational Dashboard):** An owner-only dashboard that allocates Square POS tip data among FOH staff based on scheduled shifts, handling time zones and providing daily/weekly summaries.
*   **Customer Feedback & QR Code:** A public-facing feedback page at `/feedback` allows customers to rate their visit (1-5 stars) and leave an optional comment and name. The QR code generator at `/admin/feedback` (manager+ access) produces a printable QR code linking to the feedback page, plus an overview dashboard with average rating, distribution, and recent entries. Schema: `customer_feedback` table. API: `POST /api/feedback` (public), `GET /api/feedback` (manager+ auth).

## External Dependencies

*   **PostgreSQL**: Primary database.
*   **Replit Auth (OIDC)**: User authentication.
*   **OpenAI-compatible API**: For Jarvis AI features (chat, voice, image generation, invoice scanning).
*   **Twilio (Optional)**: For SMS notifications.