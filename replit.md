# Jarvis Bakery OS

## Overview
Jarvis Bakery OS is a comprehensive full-stack bakery management application designed to optimize operations for "Bear's Cup Bakehouse." It aims to enhance efficiency, reduce waste, and provide data-driven insights across various bakery functions. Key capabilities include advanced recipe management with production scaling, daily production logging, SOP maintenance, AI assistance ("Jarvis"), multi-location support, team management, time card tracking, and employee engagement features like an in-house gaming arcade. The project's vision is to provide a robust, scalable solution for modern bakery operations, offering tools for better decision-making and operational excellence.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture
The application utilizes a monorepo structure, separating client-side (React, Vite, TypeScript), server-side (Express, Node.js, TypeScript), and shared resources.

**Frontend:** A React 18 SPA built with TypeScript and Vite, using Wouter for routing, TanStack React Query for state management, and shadcn/ui on Radix UI with Tailwind CSS for styling. Forms are managed with React Hook Form and Zod validation, and data visualizations are powered by Recharts.

**Backend:** An Express.js API server developed in Node.js and TypeScript, providing a RESTful JSON API. Route contracts and validation are enforced using shared Zod schemas. Database interactions are abstracted through an `IStorage` interface.

**Database:** PostgreSQL is the primary database, managed with Drizzle ORM.

**Key Features & System Design:**

*   **Recipe System:** Supports inline scaling, production views, logged recipe sessions, and "Recipe Assist." Recipes are categorized by department and link ingredients to inventory.
*   **Lamination Studio:** Manages the lifecycle of lamination doughs with a FIFO "Next Up" system and automatic bake-off log creation. Bake-off and Quick Log auto-create oven timers (Bake + Spin at bakeTime - 8 min) on Platform 9¾ when the pastry passport has a `bakeTimeMinutes` set.
*   **Production Data Flow:** All production output flows through `bakeoff_logs` for unified reporting. Includes a `pastryItemId` for core operational tables, a data pipeline health dashboard, smart matching for Square catalog items, and bulk pastry passport creation.
*   **Soldout/86'd Tracking:** Tracks out-of-stock items with timestamps, attribution, and location.
*   **COGS System:** Calculates real-time per-pastry production costs using invoice, inventory, and recipe data.
*   **Invoice Capture:** Supports multi-image invoice uploads processed by an AI vision model, optimized for bakery-specific invoices.
*   **Schedule & Shift Management:** Provides 24-hour shift scheduling with AI-driven generation.
*   **Events & Calendar:** Manages events with team member tagging and personalized views, enforcing privacy for personal events.
*   **Time Card System:** Includes a persistent Clock Bar, PIN-based Kiosk Clock, personal time card management, and a "Time Review" module.
*   **Authentication & Roles:** PIN-based authentication with PostgreSQL sessions. Roles (`owner`, `manager`, `member`) enforce permissions and data access restrictions.
*   **User Customization:** Owners can designate General Managers, customize sidebar visibility, set default landing pages, assign default departments, and control section visibility per user.
*   **Permission Levels:** Reusable, owner-configurable permission templates define sidebar and section permissions, which can be assigned to users and synced.
*   **AI Integration (Jarvis):** Integrates with OpenAI-compatible APIs for text chat, audio (STT/TTS), image generation, and invoice scanning.
*   **Consolidated Home Page:** A central operational hub with Jarvis greeting, AI briefing, announcements, stats, notes, production grid, problems tracker, calendar, tasks, vendor orders, messages, quick actions, and a "Who's On" sidebar.
*   **Jarvis Briefing:** An AI-generated, personalized briefing on the Home page, tailored to the user's role, bakery state, and time of day, now calendar-aware.
*   **Multi-Location Support:** Facilitates operations across multiple bakery locations, tagging operational data by `locationId`.
*   **Task Manager:** A comprehensive task management system with assignable task lists, a jobs library, department to-dos, and AI-powered daily task list generation.
*   **Employee Skills Tracking:** Allows rating team member skills for AI-powered task assignment.
*   **Notes:** A full-featured notes system with personal and shared notes, voice dictation, and AI-powered generation of Recipes, SOPs, Calendar Events, or Letter Head documents. Includes "Jarvis Scribe" (photo-to-text) and "Email → Event" (extracts event details from email screenshots).
*   **Admin Insights Dashboard:** An owner-only dashboard with analytics across various categories.
*   **KPI Report System:** Provides detailed business metrics with period-over-period comparisons.
*   **Starkade:** An in-house competitive gaming arcade with a unified points system and leaderboards.
*   **TTIS (Tip Transparency Informational Dashboard):** An owner-only dashboard for allocating Square POS tip data among FOH staff.
*   **Test Kitchen:** A collaborative specials development page with ingredient builders, real-time costing, method steps, status progression, collaborative Lab Notes, schedule settings, and "Jarvis Optimize" for AI-powered recipe analysis.
*   **Customer Feedback & QR Code:** A public-facing, location-aware feedback page with a QR code generator for each location.
*   **Sentiment Matrix:** An owner/GM dashboard that correlates customer feedback ratings with clocked-in team members for performance analysis.
*   **Platform 9¾ (FOH Command Center):** A dedicated full-screen kiosk display for FOH, showing filtered task lists, 86'd items, live oven timers with countdown/audio alerts (department-filtered, any user can dismiss), and a FOH backup alert button.
*   **Vendor Management & Auto-Order Generation:** CRUD for vendors, including contact info, order days, and linked inventory items. Auto-generates purchase orders based on stock levels with Twilio SMS capabilities.
*   **Lobby Check Alert:** A recurring, PIN-acknowledged alert system for FOH staff to check the lobby.
*   **Bagel Bros Display Screen:** A dedicated, full-screen, bilingual bagel production display with timers and FOH backup alert integration.
*   **Global Acknowledgment System:** Supports forced logout of all users and a one-time, mandatory, Jarvis-branded overlay message on next login.
*   **Session Version & Force Logout:** An owner-initiated system to force-logout all users with an optional Jarvis message on re-login.
*   **Developer Mode & Dev Feedback:** An owner-only toggle enabling a global feedback system for bug reports and suggestions, AI-processed for categorization.
*   **La Carte Customer Portal:** A separate customer-facing subscription portal with a unique design, customer authentication, browsable Square catalog menu, "What's Fresh Today," "Coming Soon" specials, Skip the Line ordering via Square Orders API, and order history.

## External Dependencies

*   **PostgreSQL**: Primary database.
*   **Replit Auth (OIDC)**: User authentication.
*   **OpenAI-compatible API**: For Jarvis AI features (chat, voice, image generation, invoice scanning).
*   **Twilio (Optional)**: For SMS notifications.