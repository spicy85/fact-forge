# Knowledge Agent - AI Fact Checker

## Overview
This project is a fact-checking application designed to verify numeric claims within text against a trusted PostgreSQL database. It identifies numbers, infers their meaning using keyword mapping, and displays inline verification badges (Verified, Mismatch, Unknown) with citations. The application aims to provide a reliable tool for quickly assessing the accuracy of numerical data in textual content, leveraging a curated database of facts for 48 countries sourced from Wikipedia and the World Bank.

## User Preferences
- Clean, data-focused interface design
- Monospace font for numeric values
- Clear visual distinction between verification states
- Tooltips for additional context
- Responsive layout for mobile/desktop

## System Architecture
The application is a multi-page React application built with Vite, utilizing an Express backend primarily for serving static files and API endpoints to a PostgreSQL database.

**UI/UX Decisions:**
- **Frontend Framework:** React 18 with TypeScript.
- **Styling:** Tailwind CSS and shadcn/ui components for a clean and responsive design.
- **Theming:** Custom dark/light mode with localStorage persistence.
- **Pages:**
    - `FactChecker` (`/`): Main interface for fact verification.
    - `ClaimsMatrix` (`/claims-matrix`): Visual representation of supported claims by country.
    - `SourcesOverview` (`/sources`): Manages and displays data source reliability metrics.
- **Core Logic (`lib/factChecker.ts`):**
    1.  **Entity Detection:** Automatically identifies country names in text.
    2.  **Claim Extraction:** Uses regex to extract numeric claims and their context.
    3.  **Attribute Inference:** Matches keywords to predefined attributes using `attribute-mapping.json`.
    4.  **Claim Verification:** Performs exact matches against the `verified_facts` database.
    5.  **Result Generation:** Creates inline badges and detailed table data with citations.

**Technical Implementations:**
- **Data Layer:** PostgreSQL database accessed via Drizzle ORM.
    - `verified_facts`: Stores immutable, verified numerical facts (e.g., country founding years, population).
    - `facts_evaluation`: Manages a workflow for evaluating new claims before promotion to `verified_facts`, incorporating a multi-criteria scoring system (`source_trust_score`, `recency_score`, `consensus_score`, `trust_score`) with adjustable weights.
    - `sources`: Stores reliability metrics (public trust, data accuracy, proprietary score) for data domains, which are editable via the UI.
- **Backend:** Express server handling API requests for facts, facts evaluation, and sources.
- **Evaluation Scoring (`server/evaluation-scoring.ts`):** Centralized logic for calculating scores for `facts_evaluation` records, including automatic source trust (derived from `sources` table), recency, and a weighted average trust score.
- **Attribute Mapping:** Keyword-to-attribute mappings defined in `public/attribute-mapping.json` for flexible attribute inference.

**Features:**
- Automatic entity detection and numeric claim extraction.
- Keyword-based attribute inference and exact-match verification.
- Inline, color-coded verification badges and detailed results table with citations.
- Claims matrix view and a sources overview page with editable reliability metrics.
- Dark/light theme support and responsive design.

## External Dependencies
- **PostgreSQL (Neon):** Primary database for storing `verified_facts`, `facts_evaluation`, and `sources` data.
- **Wikipedia (Wikidata) API:** Used by the `fetch-country-data.ts` script to gather country-specific facts.
- **World Bank API:** Used by the `fetch-country-data.ts` script to gather country-specific facts.
- **Drizzle ORM:** Used for interacting with the PostgreSQL database.