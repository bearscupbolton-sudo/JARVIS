# Jarvis Bakery OS

## Overview
Jarvis Bakery OS is a comprehensive full-stack bakery management application designed to optimize operations for "Bear's Cup Bakehouse." Its primary purpose is to enhance efficiency, reduce waste, and provide data-driven insights across various bakery functions. Key capabilities include advanced recipe management with production scaling, daily production logging, SOP maintenance, and an AI assistant named "Jarvis." The system also supports multi-location businesses, team management, time card tracking, and employee engagement through an in-house gaming arcade. The project aims to provide a robust, scalable solution for modern bakery operations, offering tools for better decision-making and operational excellence.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture
The application utilizes a monorepo structure, separating client-side (React, Vite, TypeScript), server-side (Express, Node.js, TypeScript), and shared resources.

**Frontend:** A React 18 SPA built with TypeScript and Vite, using Wouter for routing, TanStack React Query for state management, and shadcn/ui on Radix UI with Tailwind CSS for styling. Forms are managed with React Hook Form and Zod validation, and data visualizations are powered by Recharts.

**Backend:** An Express.js API server developed in Node.js and TypeScript, providing a RESTful JSON API. Route contracts and validation are enforced using shared Zod schemas. Database interactions are abstracted through an `IStorage` interface.

**Database:** PostgreSQL is the primary database, managed with Drizzle ORM.

**Key Features & System Design:**

*   **Recipe System:** Supports inline scaling, offers a distraction-free production view, and logs recipe sessions. Features "Recipe Assist" for guided production and categorizes recipes by department.
*   **Lamination Studio:** Tracks the full lifecycle of lamination doughs, managing creation, folding steps, resting, and destination. Includes multi-pastry shaping, comprehensive editing, and a FIFO "Next Up" system. Bake-off logs are auto-created when doughs reach "baked" status. A "Quick Log" button allows logging non-laminated items.
*   **Bakery Page:** A secondary production entry point with forms for pastry totals, shaping logs, and manual bake-off logging.
*   **Production Data Flow:** Lamination Studio is the primary production hub, with all production output flowing through the `bakeoff_logs` table for unified reporting across various dashboards and reports.
*   **Soldout/86'd Tracking:** Tracks items marked as sold out with adjustable timestamps, reported-by attribution, and location tagging.
*   **Pastry Passport & Master Pastry List:** Integrates `pastry_passports` with a `pastry_items` master list for pre-filling details and visual indications.
*   **COGS System:** Calculates real-time per-pastry production costs by integrating invoice data, inventory item costs, and recipe ingredient costs.
*   **Invoice Capture (Multi-Image):** Supports uploading multiple images for invoice scanning, processed simultaneously with an AI vision model.
*   **Schedule & Shift Management:** Provides 24-hour shift scheduling with "assigned," "open," and "pending" statuses. Supports AI-driven schedule generation. Shift managers and general managers can clear schedules in block chunks (by week or custom date range) via `DELETE /api/shifts/clear?startDate=&endDate=`.
*   **Events & Calendar:** Manages events with team member tagging, displaying personalized events on the Home page.
*   **Event Jobs:** Allows creation, assignment, and tracking of jobs/tasks associated with events.
*   **Time Card System:** Includes a persistent Clock Bar, a PIN-based Kiosk Clock, personal time card management, and a "Time Review" module.
*   **Authentication & Roles:** PIN-based authentication with PostgreSQL sessions. Roles include `owner`, `manager`, and `member`, with permissions enforced by middleware. Security policy: revenue/profit data is owner-only; cost data is manager+; Live Inventory is owner-only. Jarvis Welcome Message and Briefing Focus settings in Team Management are owner-only (not visible to managers).
*   **General Manager Designation:** A manager-only toggle (`isGeneralManager` on `users` table) that grants full approval capabilities (pending recipe/SOP changes) and access to TTIS. Set by owners via Team Management. Endpoint: `PATCH /api/admin/users/:id/general-manager`.
*   **Per-User Sidebar Visibility:** Owners can customize sidebar item visibility for each team member.
*   **Per-User Default Landing Page:** Owners can set a default landing page per team member via Team Management. On login, users are redirected to their assigned page (e.g., `/bagel-bros`, `/platform`, `/bakery`, `/clock`) instead of Home. Stored as `defaultPage` on the `users` table; null defaults to Home (`/`). Endpoint: `PATCH /api/admin/users/:id/default-page`.
*   **AI Integration (Jarvis):** Integrates with OpenAI-compatible APIs for an AI assistant providing text chat, audio (STT/TTS), image generation, and invoice scanning.
*   **Consolidated Home Page:** Serves as the single operational hub, including Jarvis greeting, AI briefing card, announcements, quick stats, pre-shift notes (with acknowledgement tracking and future scheduling), merged production grid, problems tracker, calendar events, birthdays, schedules, events, event jobs, comprehensive task list table (with Open/Completed tabs and department filters for FOH/Bakery/Kitchen/Bar), today's vendor orders, messages summary, customizable quick actions, and a "Who's On" sidebar.
*   **Jarvis Briefing:** An AI-generated, personalized briefing on the Home page, tailored to the user's role, bakery state, and time of day.
*   **Multi-Location Support:** Facilitates operations across multiple bakery locations, tagging operational data by `locationId`.
*   **Task Manager (Assignable Task Lists):** A full task management system with three tabs: Task Lists, Jobs Library, and Department To-Do. Supports assigning tasks to individuals or entire departments (for recurring lists like opening/closing), tracking progress, and performance metrics. Department-assigned lists are visible to all team members and can be picked up by anyone on shift.
*   **Notes:** A full-featured notes system supporting personal and shared (collaborative) notes with voice dictation. Features AI-powered generation of Recipes, SOPs, Calendar Events (all types: meeting, delivery, deadline, event, schedule — supports multiple events from one note), or Letter Head documents from note content. Collaborators can be invited to edit notes. Generate offers Preview (view formatted text) and Build (create real records in the database) modes.
*   **Admin Insights Dashboard:** An owner-only dashboard with analytics across various categories, including Overview, Team, Production, Lamination, Messages, Features, KPI Report, and Performance.
*   **KPI Report System:** Provides detailed business metrics with period-over-period comparisons, including revenue, labor cost, food cost, sales vs. production, waste reports, and peak hours staffing.
*   **Starkade:** An in-house competitive gaming arcade with built-in games, a unified points system, and leaderboards.
*   **TTIS (Tip Transparency Informational Dashboard):** An owner-only dashboard that allocates Square POS tip data among FOH staff based on actual clock-in/out times.
*   **Customer Feedback & QR Code:** A public-facing feedback page allowing customers to rate their visit and leave comments, with a QR code generator for easy access.
*   **Platform 9¾ (FOH Command Center):** A dedicated full-screen kiosk display at `/platform` (noLayout, no sidebar). Designed for a dedicated iPad display — not accessible from the sidebar, shortcuts, or Home page. Shows FOH-filtered task lists, assigned tasks, today's 86'd items (pastry dropdown from master list), and a dramatic oversized FOH backup alert button with pulsing/glowing emergency styling taking ~1/3 of screen. Header shows daily Assigned/Completed counts and 86'd count. Features a styled amber/gold header with task progress bar. Lobby check settings are configurable by managers.
*   **Vendor Management & Auto-Order Generation:** Full vendor CRUD with contact info, order days (Mon–Sun), and linked inventory items with par levels and order-up-to levels. Auto-generates purchase orders based on current stock vs. par levels. Orders can be previewed, edited, and texted to vendor sales reps via Twilio SMS. Includes order history tracking, a "Today's Orders" Home page widget, and sidebar navigation. Tables: `vendors`, `vendor_items`, `purchase_orders`, `purchase_order_lines`.
*   **Lobby Check Alert:** A recurring alert system for FOH that prompts staff to check the lobby at configurable intervals during business hours. Alerts require PIN entry to clear, logging who cleared each check and when. Managers configure frequency (15–120 min) and business hours from Platform 9¾. The alert overlay renders globally and cannot be dismissed without a valid PIN. Tables: `lobby_check_settings`, `lobby_check_logs`.
*   **Bagel Bros Display Screen:** A dedicated, full-screen, bilingual (English/Spanish) bagel production display at `/bagel-bros`. Features a kettle flip timer with preset durations (1:00–3:00) and full-screen FLIP/VOLTEAR alert, a 4×5 board emblem that dumps 20 bagels to the trough per tap, a 4-deck oven grid with per-slot countdown timers and color-coded bagel types (Plain/Poppy/Sesame/Everything), and "Finish Bake / Listo" buttons that create `bakeoff_log` entries. Includes an FOH backup alert system triggered from Platform 9¾ that shows a full-screen "AYUDA AL FRENTE" overlay. Route is `noLayout` for full-screen use. Tables: `bagel_sessions`, `bagel_oven_loads`.

## External Dependencies

*   **PostgreSQL**: Primary database.
*   **Replit Auth (OIDC)**: User authentication.
*   **OpenAI-compatible API**: For Jarvis AI features (chat, voice, image generation, invoice scanning).
*   **Twilio (Optional)**: For SMS notifications.