# Jarvis Bakery OS

## Overview
Jarvis Bakery OS is a full-stack bakery management application designed to optimize operations, enhance efficiency, reduce waste, and provide data-driven insights. It aims to be a robust, scalable solution for modern bakeries, improving decision-making and operational excellence. Key capabilities include advanced recipe management, daily production logging, AI assistance, multi-location support, and comprehensive team and financial management.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture
The application is built as a monorepo with a React 18 frontend (Vite, TypeScript, Wouter, TanStack React Query, shadcn/ui, Radix UI, Tailwind CSS) and an Express.js backend (Node.js, TypeScript, RESTful JSON API) utilizing PostgreSQL with Drizzle ORM. The server operates in Eastern Time (`America/New_York`).

**Core Architectural Decisions and Features:**

*   **Monorepo Structure:** Centralized codebase for frontend and backend.
*   **Modern Frontend Stack:** Leveraging React 18 with a comprehensive UI library (`shadcn/ui`, Radix UI) and styling (`Tailwind CSS`).
*   **Robust Backend:** Express.js with TypeScript and a PostgreSQL database managed by Drizzle ORM for type-safe database interactions.
*   **Comprehensive Bakery Management:**
    *   **Recipe System:** Supports inline scaling, production views, and integrates with inventory.
    *   **Lamination Studio:** Manages lamination dough lifecycles with FIFO tracking and automated bake-off logs.
    *   **Production Data Flow:** Centralized through `bakeoff_logs` for reporting and integrated with Square catalog.
    *   **Maintenance & Solutions Hub:** Manages equipment, problems, and service contacts.
    *   **Prep EQ:** Tracks in-house components, calculates demand, and generates prep tasks.
    *   **COGS System:** Real-time production cost calculation using invoice, inventory, and recipe data.
    *   **Invoice Capture:** AI vision model for processing multi-image bakery invoices.
    *   **Schedule & Shift Management:** Spreadsheet-style scheduling with AI import, shift pickups, and reusable templates. Business week runs Wednesday to Tuesday.
    *   **Time Card System:** PIN-based Kiosk Clock, personal time management, and seamless Square Labor Sync.
    *   **Department-Aware Inventory:** Inventory items are managed with department filters for accuracy in recipe linking and counts.
    *   **Live Inventory Real-Time Sync:** Auto-syncs Square sales data with real-time status.
    *   **Authentication & Roles:** PIN-based authentication with role-based permissions (`owner`, `manager`, `member`) and granular flags.
    *   **Multi-Location Support:** All operational data is tagged by `locationId`.
    *   **AI Integration (Jarvis):** Utilizes OpenAI-compatible APIs for chat, audio, image generation, and invoice scanning, providing features like AI greetings, personalized briefings, and recipe optimization.
    *   **Consolidated Home Page:** A central operational hub with AI features, announcements, stats, and quick actions.
    *   **Task Manager:** Assignable tasks, job library, and AI-powered task generation.
    *   **Notes System:** Full-featured notes with AI generation and photo-to-text.
    *   **Admin Insights & KPI Reports:** Owner-only dashboards for analytics and business metrics.
    *   **TTIS (Tip Transparency Informational Dashboard):** Owner-only tip allocation dashboard with employee-facing totals.
    *   **Test Kitchen:** Collaborative specials development with real-time costing and AI recipe analysis.
    *   **Customer Feedback & Sentiment Matrix:** Public-facing feedback system with AI responses and sentiment analysis correlated with clocked-in teams.
    *   **Platform 9¾ (FOH Command Center):** Kiosk display for FOH tasks, 86'd items, and live timers.
    *   **Vendor Management & Auto-Order Generation:** CRUD for vendors with automated purchase order generation.
    *   **Messaging System:** iMessage/Slack-inspired messaging with urgent message overlays and targeted communication.
    *   **Global Acknowledgment System:** For mandatory messages and forced logouts.
    *   **Tutorial System:** Page-specific tutorial overlays with video/text content.
    *   **HR Onboarding System:** Electronic onboarding with invite links, document uploads, and W-4 collection.
    *   **Payroll Review System:** Owner-only page for payroll compilation, integrating time entries, tips, and department allocations into ADP-ready format.
    *   **The Firm (Financial Hub):** Forensic-level financial reconciliation with accounts, ledger, payroll, cash management, and Square sales tax reporting. Includes AI financial analysis. Plaid bank/CC integration for automatic account linking, balance sync, and transaction import (`plaid_items`, `plaid_accounts` tables; env vars: `PLAID_CLIENT_ID`, `PLAID_SECRET`, `PLAID_ENV`).
    *   **La Carte Customer Portal:** Customer-facing subscription portal with Square catalog integration and ordering.
    *   **JMT (Jarvis Menu Theater):** Creative control board for dynamic menu display management with scheduling and real-time updates.
    *   **BC Wholesale Portal:** Forward-facing wholesale portal with PIN-based authentication, order building, recurring templates, Square payment links, and automatic payment reconciliation.

## External Dependencies

*   **PostgreSQL**: Primary database for all application data.
*   **Replit Auth (OIDC)**: Handles user authentication.
*   **OpenAI-compatible API**: Provides AI capabilities for chat, audio, image generation, and invoice scanning.
*   **Twilio (Optional)**: Used for SMS notifications.
*   **ADP RUN API (Optional)**: Integrates for worker management and payroll data input.
*   **Square POS API**: Integrated for catalog, orders, payments, labor sync, and sales tax data.
*   **pdf-lib**: Server-side generation of W-4 PDFs.