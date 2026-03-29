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
    *   **Recipe & Production:** Advanced recipe system with inline scaling, production views, lamination studio with FIFO tracking, and integrated production data flow. Includes a "Lamination Pulse Card" dashboard widget for real-time dough status.
    *   **Inventory Management:** Department-aware inventory with live real-time sync with Square sales data.
    *   **Financial Hub (The Firm):** Forensic-level financial reconciliation, double-entry accounting (Chart of Accounts, Journal Entries, Ledger), payroll review, and autonomous AI financial analysis. Features an auto-reconciliation engine, batch approval UI, vendor integrity checks (invoice-to-bank-ledger matching), and Fixed Asset Management (ARA) with twin-track depreciation.
    *   **Compliance & Statutory Reporting (CSRL):** Event-driven compliance engine.
    *   **Invoice Capture:** AI vision model for processing invoices, including US Foods integration for shorts detection, substitution tracking, and price variance alerts.
    *   **Team Management:** Schedule and shift management, PIN-based time card system with Square Labor Sync, HR onboarding, and employee reimbursements.
    *   **AI Integration (Jarvis):** Utilizes OpenAI-compatible APIs for chat, audio, image generation, invoice scanning, personalized briefings, and recipe optimization. Includes a Jarvis CFO Panel for financial queries with an Agentic Financial Brain (Tool Dispatcher) for autonomous investigation using five narrow-scope tools: `get_profit_and_loss`, `get_audit_lineage`, `get_price_variance`, `get_tip_distribution`, and `get_coa_definition`.
    *   **Multi-Location Support:** All operational data is tagged by `locationId`.
    *   **Authentication & Roles:** PIN-based authentication with role-based permissions (`owner`, `manager`, `member`).
    *   **Sidebar Architecture:** Reorganized into four collapsible groups plus Global Pulse top-level items.
    *   **Operational Dashboards:** Consolidated Home Page, Admin Insights & KPI Reports, TTIS, and Platform 9¾.
    *   **Communication & Collaboration:** Messaging system, global acknowledgment system, task manager, and notes system.
    *   **Customer & Wholesale:** La Carte customer portal, BC Wholesale portal, and JMT for dynamic menu display.
    *   **Tax Intelligence (RAgent):** Tax Profile Engine, Vibe Threshold Monitor, and FICA Tip Credit Calculator.
    *   **Audit Lineage Engine:** Three-layer drill-down system with AI narrative generation for financial tracing.
    *   **Year-End Financial Export:** Comprehensive JSON export engine for CPA/AI Form 1120-S preparation.
    *   **Personalized Greeting System:** Enhances daily Jarvis briefing with user interests, weather, and traffic data.
    *   **Email Intelligence Engine:** 4-stage pipeline for automated extraction and anchoring of financial data from vendor emails to bank transactions, with cross-reference and intelligence layers for CapEx/Prepaid detection and auto-classification.
    *   **Audit Trail PDF Extraction:** In-dialog "Read PDF" button on audit lookup results downloads and parses PDF invoice attachments via pdfjs-dist (with GPT-4o vision OCR fallback for scanned/image PDFs), extracts structured line items, and displays vendor, invoice #, totals with amount-match highlighting against the bank transaction. Endpoint: `POST /api/firm/audit-trail/extract-pdf`.
    *   **Coffee Command Center:** Includes a Components Library for coffee ingredients and an AI-powered Jarvis Drink Builder for recipe creation, supporting base drink templates with variations and end-to-end cost rollup.

## External Dependencies

*   **PostgreSQL**: Primary data store.
*   **Replit Auth (OIDC)**: User authentication.
*   **OpenAI-compatible API**: AI functionalities.
*   **Square POS API**: Sales, payments, labor, and catalog integration.
*   **pdf-lib**: Server-side PDF generation.
*   **OpenWeatherMap**: Weather data for personalized greetings.
*   **Google Maps Directions API**: Traffic data for personalized greetings.
*   **Twilio (Optional)**: SMS notifications.
*   **ADP RUN API (Optional)**: Payroll and worker management.
*   **Plaid**: Bank and credit card integration.