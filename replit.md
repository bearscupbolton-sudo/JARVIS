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
*   **Schedule & Shift Management:** Spreadsheet-style grid scheduling (employees × days) with inline quick-add (type "7-2" in any cell), smart time shorthand parsing, Tab-to-next-cell navigation, Copy Last Week button for schedule duplication, AI-driven import from CSV/images, shift pickups/claims, and department/shift-type filtering. All team members shown in grid regardless of existing shifts. Predefined shift presets (click "5-1", "6-2", etc. from popover), inline quick-modify on existing shifts (change start/end time + add note without leaving grid), color-coded modified shifts (blue = has note), weekly hours counter per employee (red if >40h), and reusable schedule templates (save/load entire week layouts via localStorage).
*   **Events & Calendar:** Manages events with team member tagging and personalized views, enforcing privacy for personal events.
*   **Time Card System:** Includes a persistent Clock Bar, PIN-based Kiosk Clock, personal time card management, and a "Time Review" module.
*   **Shift Notes:** A private manager feedback system. Managers add notes to past shifts; Jarvis AI rewrites them constructively. Employees see unacknowledged notes prominently on the Home page with a "Got it" button. Manager dashboard in team profiles shows all notes per employee with acknowledged/pending status.
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
*   **The Loop:** A manager-level feedback action dashboard that closes the loop from customer feedback to team action. Features sentiment trend charts over time, AI-extracted recurring themes/complaints (powered by GPT-4o-mini), recent feedback feed with pagination, and quick stats with period-over-period comparison. Located in MANAGER_NAV_ITEMS sidebar section.
*   **Platform 9¾ (FOH Command Center):** A dedicated full-screen kiosk display for FOH, showing filtered task lists, 86'd items, live oven timers with countdown/audio alerts (department-filtered, any user can dismiss), and a FOH backup alert button.
*   **Vendor Management & Auto-Order Generation:** CRUD for vendors, including contact info, order days, and linked inventory items. Auto-generates purchase orders based on stock levels with Twilio SMS capabilities.
*   **Lobby Check Alert:** A recurring, PIN-acknowledged alert system for FOH staff to check the lobby. Alert screens are configurable via `targetScreens` setting (default: Platform 9¾ only). Owners/managers can select which kiosk screens show the alert from the Lobby Check settings dialog.
*   **Bagel Bros Display Screen:** A dedicated, full-screen, bilingual bagel production display with timers and FOH backup alert integration.
*   **Global Acknowledgment System:** Supports forced logout of all users and a one-time, mandatory, Jarvis-branded overlay message on next login.
*   **Session Version & Force Logout:** An owner-initiated system to force-logout all users with an optional Jarvis message on re-login.
*   **Developer Mode & Dev Feedback:** An owner-only toggle enabling a global feedback system for bug reports and suggestions, AI-processed for categorization.
*   **HR Onboarding System:** Electronic onboarding with shareable invite links. Public multi-step flow: ADP Run-compatible personal info form (legal name, SSN, DOB, address, emergency contact, tax info, direct deposit) → Employee Handbook acknowledgment (scroll-to-bottom required) → Non-Compete agreement with digital signature → Welcome screen. SSN and bank details are hashed (SHA-256) before storage. Manager dashboard on `/hr` with step-by-step onboarding management view (navigate Personal Info, Handbook, Non-Compete, Completion steps with status indicators), copy-link for pending invites, and an expandable Data Security & Privacy card explaining hashing, masking, access controls, and secure tokens. **Custom Document Upload:** Owners/managers can upload photos of their actual handbook and non-compete documents; Jarvis AI (GPT-4o-mini) extracts and formats the content into professional onboarding text. Editable before saving. Onboarding flow dynamically uses custom documents when available, falling back to built-in defaults. Document version status shown in management view. Tables: `onboarding_invites`, `onboarding_submissions`, `onboarding_documents`.
*   **Coffee Command Center:** A full-featured coffee operations hub at `/coffee` with 4 tabs: Dashboard (Jarvis briefing + quick stats + inventory overview), Inventory (CRUD with +/- adjustments, par levels, stock bars), Drink Setup (ingredient formulas per drink), and Usage & Sales (manual logging with auto inventory deduction, 7-day summary). Available as a default landing page option.
*   **La Carte Customer Portal:** A separate customer-facing subscription portal with a unique design, customer authentication, browsable Square catalog menu, "What's Fresh Today," "Coming Soon" specials, Skip the Line ordering via Square Orders API, and order history.

## External Dependencies

*   **PostgreSQL**: Primary database.
*   **Replit Auth (OIDC)**: User authentication.
*   **OpenAI-compatible API**: For Jarvis AI features (chat, voice, image generation, invoice scanning).
*   **Twilio (Optional)**: For SMS notifications.