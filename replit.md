# Jarvis Bakery OS

## Overview
Jarvis Bakery OS is a comprehensive full-stack bakery management application for "Bear's Cup Bakehouse," designed to optimize operations, enhance efficiency, reduce waste, and provide data-driven insights. It includes advanced recipe management, daily production logging, SOP maintenance, AI assistance, multi-location support, team management, time tracking, and employee engagement features. The project aims to be a robust, scalable solution for modern bakery operations, improving decision-making and operational excellence.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture
The application uses a monorepo structure with a React 18 frontend (Vite, TypeScript, Wouter, TanStack React Query, shadcn/ui, Radix UI, Tailwind CSS, React Hook Form, Zod, Recharts) and an Express.js backend (Node.js, TypeScript, RESTful JSON API) backed by PostgreSQL with Drizzle ORM.

**Key Features & System Design:**

*   **Recipe System:** Supports inline scaling, production views, logged sessions, and "Recipe Assist." Recipes link ingredients to inventory and can include how-to video embeds.
*   **Lamination Studio:** Manages lamination dough lifecycles with FIFO tracking and automatic bake-off log creation, including oven timer integration.
*   **Production Data Flow:** Centralized through `bakeoff_logs` for reporting, with `pastryItemId` for core tables, a data pipeline health dashboard, Square catalog item matching, and bulk pastry passport creation.
*   **Maintenance & Solutions Hub:** Manages problems (workflow, priority, assignment), equipment inventory (scheduling, overdue detection), and service contacts.
*   **Prep EQ (Production Intelligence):** Tracks in-house components (doughs, batters) with current levels, par levels, and demand calculations, generating prep tasks and auto-adjusting inventory. Includes piece-per-dough analytics and Jarvis briefing integration.
*   **Soldout/86'd Tracking:** Records out-of-stock items with timestamps, attribution, and location.
*   **COGS System:** Calculates real-time production costs using invoice, inventory, and recipe data.
*   **Invoice Capture:** AI vision model processes multi-image bakery invoices.
*   **Schedule & Shift Management:** Spreadsheet-style scheduling with AI-driven import (CSV/images), smart time parsing, shift pickups/claims, department/shift-type filtering, predefined presets, inline modification, color-coding for modified shifts, weekly hour counters, and reusable templates.
*   **Events & Calendar:** Manages events with team member tagging and personalized views.
*   **Time Card System:** Features a persistent Clock Bar, PIN-based Kiosk Clock, personal management, and "Time Review."
*   **Shift Notes:** Private manager feedback system with AI-rewritten constructive notes visible to employees.
*   **Authentication & Roles:** PIN-based authentication with PostgreSQL sessions and role-based (`owner`, `manager`, `member`) permissions.
*   **User Customization:** Owners can configure sidebar visibility, landing pages, default departments, and section access.
*   **Permission Levels:** Reusable, owner-configurable templates for sidebar and section permissions.
*   **AI Integration (Jarvis):** Utilizes OpenAI-compatible APIs for chat, audio (STT/TTS), image generation, and invoice scanning.
*   **Consolidated Home Page:** Central operational hub with Jarvis greeting/briefing, announcements, stats, production grid, problems, calendar, tasks, vendor orders, messages, quick actions, and "Who's On" sidebar.
*   **Jarvis Briefing:** AI-generated, personalized, calendar-aware briefings on the Home page.
*   **Multi-Location Support:** Operational data tagged by `locationId`.
*   **Task Manager:** Comprehensive system with assignable task lists, jobs library, department to-dos, and AI-powered daily task generation.
*   **Employee Skills Tracking:** Ratings for AI-powered task assignment.
*   **Notes:** Full-featured system with personal/shared notes, voice dictation, AI generation of recipes/SOPs/events, "Jarvis Scribe" (photo-to-text), and "Email → Event."
*   **Admin Insights Dashboard:** Owner-only analytics dashboard.
*   **KPI Report System:** Detailed business metrics with period-over-period comparisons.
*   **Starkade:** In-house competitive gaming arcade with points and leaderboards.
*   **TTIS (Tip Transparency Informational Dashboard):** Owner-only dashboard for Square POS tip allocation.
*   **Test Kitchen:** Collaborative specials development with ingredient builders, real-time costing, method steps, Lab Notes, scheduling, and "Jarvis Optimize" for AI recipe analysis.
*   **Customer Feedback & QR Code:** Public-facing, location-aware feedback page with QR code generator.
*   **Sentiment Matrix:** Owner/GM dashboard correlating customer feedback with clocked-in team members.
*   **The Loop:** Manager-level feedback action dashboard with sentiment trends, AI-extracted themes, and quick stats.
*   **Platform 9¾ (FOH Command Center):** Full-screen kiosk display for FOH with filtered tasks, 86'd items, live oven timers, and FOH backup alert.
*   **Vendor Management & Auto-Order Generation:** CRUD for vendors with auto-generated purchase orders based on stock levels.
*   **Lobby Check Alert:** Recurring, PIN-acknowledged alert system for FOH staff.
*   **Bagel Bros Display Screen:** Dedicated, full-screen, bilingual bagel production display with timers and FOH backup alert integration.
*   **Global Acknowledgment System:** Supports forced logout and one-time, mandatory, Jarvis-branded overlay messages.
*   **Session Version & Force Logout:** Owner-initiated system to force-logout all users with an optional Jarvis message.
*   **Developer Mode & Dev Feedback:** Owner-only toggle for a global feedback system (bug reports, suggestions), AI-processed for categorization.
*   **HR Onboarding System:** Electronic onboarding with shareable invite links, ADP Run CSV export for completed submissions, handbook acknowledgment, non-compete agreements, and secure data handling (SSN/bank details hashed with last-4 retention). Includes manager dashboard with invite deletion (pending only), custom document upload with AI content extraction, mobile-optimized numeric inputs, and data security badge.
*   **Coffee Command Center:** Hub for coffee operations with dashboard, inventory, drink setup (formulas), and usage/sales tracking.
*   **The Firm (Financial Hub):** Owner-only forensic-level financial reconciliation system with overview, accounts, ledger, obligations, payroll, and cash management. Includes Jarvis AI financial analysis and educational tooltips.
*   **La Carte Customer Portal:** Customer-facing subscription portal with Square catalog, "What's Fresh Today," "Coming Soon," Skip the Line ordering via Square Orders API, and order history.

## External Dependencies

*   **PostgreSQL**: Primary database.
*   **Replit Auth (OIDC)**: User authentication.
*   **OpenAI-compatible API**: For Jarvis AI features (chat, voice, image generation, invoice scanning).
*   **Twilio (Optional)**: For SMS notifications.