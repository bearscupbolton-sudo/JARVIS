# Jarvis Bakery OS

## Overview
Jarvis Bakery OS is a comprehensive full-stack bakery management application designed to optimize operations, enhance efficiency, and provide data-driven insights for modern bakeries. It aims to improve decision-making and operational excellence through features like advanced recipe management, production logging, AI assistance, multi-location support, and integrated team and financial management. The project's ambition is to be a robust and scalable solution for the bakery industry.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture
The application is structured as a monorepo, featuring a React 18 frontend built with Vite, TypeScript, Wouter, TanStack React Query, shadcn/ui, Radix UI, and Tailwind CSS. The backend is an Express.js application using Node.js and TypeScript, exposing a RESTful JSON API. Data is stored in PostgreSQL, managed with Drizzle ORM for type-safe interactions. The server operates in Eastern Time (`America/New_York`).

**Key Architectural Decisions and Features:**

*   **Monorepo Structure:** Centralized development for both frontend and backend.
*   **Modern Web Stack:** Utilizes React 18 for dynamic UIs and Express.js for a scalable API.
*   **Comprehensive Bakery Management:**
    *   **Recipe & Production:** Advanced recipe system with inline scaling, production views, lamination studio with FIFO tracking, and integrated production data flow.
    *   **Inventory Management:** Department-aware inventory with live real-time sync with Square sales data.
    *   **Financial Hub (The Firm):** Forensic-level financial reconciliation, double-entry accounting (Chart of Accounts, Journal Entries, Ledger), payroll review (ADP-ready), and autonomous AI financial analysis. This includes real cash computation, accrual placeholders, donation ROI tracking, and lightning-offset reconciliation for bank transactions with vendor intelligence.
    *   **Fixed Asset Management (ARA):** Twin-track depreciation engine (Book and Tax Ledger) with autonomous CapEx detection.
    *   **Compliance & Statutory Reporting (CSRL):** Event-driven compliance engine monitoring statutory obligations and tax reporting.
    *   **Invoice Capture:** AI vision model for processing invoices, including US Foods integration for shorts detection, substitution tracking, and price variance alerts.
    *   **Team Management:** Schedule and shift management, PIN-based time card system with Square Labor Sync, HR onboarding, and employee reimbursements.
    *   **AI Integration (Jarvis):** Utilizes OpenAI-compatible APIs for chat, audio, image generation, invoice scanning, personalized briefings, and recipe optimization.
    *   **Multi-Location Support:** All operational data is tagged by `locationId`.
    *   **Authentication & Roles:** PIN-based authentication with role-based permissions (`owner`, `manager`, `member`).
    *   **Operational Dashboards:** Consolidated Home Page, Admin Insights & KPI Reports, TTIS (Tip Transparency), and Platform 9¾ (FOH Command Center).
    *   **Communication & Collaboration:** Messaging system, global acknowledgment system, task manager, and notes system.
    *   **Customer & Wholesale:** La Carte customer portal, BC Wholesale portal, and JMT (Jarvis Menu Theater) for dynamic menu display.
    *   **Tax Intelligence (RAgent):** Tax Profile Engine, Vibe Threshold Monitor, and FICA Tip Credit Calculator.

## External Dependencies

*   **PostgreSQL**: Primary data store.
*   **Replit Auth (OIDC)**: User authentication.
*   **OpenAI-compatible API**: AI functionalities.
*   **Square POS API**: Sales, payments, labor, and catalog integration.
*   **pdf-lib**: Server-side PDF generation (e.g., W-4s).
*   **Twilio (Optional)**: SMS notifications.
*   **ADP RUN API (Optional)**: Payroll and worker management.
*   **Plaid**: Bank and credit card integration for transaction import and balance syncing.