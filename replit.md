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
    - `EvaluationScoring` (`/evaluation-scoring`): Interactive page showing detailed scoring formulas, statistics, and calculation breakdowns for all evaluations.
- **Core Logic (`lib/factChecker.ts`):**
    1.  **Entity Detection:** Automatically identifies country names in text using two-tier detection:
        - First checks aliases from `entity-mapping.json` (e.g., "USA" → "United States", "China" → "People's Republic of China")
        - Falls back to direct canonical name matching
        - Supports 100+ common aliases for all 48 countries in database
    2.  **Claim Extraction:** Uses regex to extract numeric claims and their context.
    3.  **Attribute Inference:** Matches keywords to predefined attributes using `attribute-mapping.json`.
    4.  **Claim Verification:** Performs exact matches against the `verified_facts` database.
    5.  **Result Generation:** Creates inline badges and detailed table data with citations.

**Technical Implementations:**
- **Data Layer:** PostgreSQL database accessed via Drizzle ORM.
    - `verified_facts`: Stores 192 immutable, verified numerical facts for 48 countries (e.g., founding years, population, area, GDP).
    - `facts_evaluation`: Manages a workflow for evaluating claims before promotion to `verified_facts`. Currently populated with all 192 verified facts demonstrating the multi-criteria scoring system (`source_trust_score`, `recency_score`, `consensus_score`, `trust_score`) with adjustable weights.
    - `sources`: Stores reliability metrics (public trust, data accuracy, proprietary score) for data domains, which are editable via the UI.
- **Backend:** Express server handling API requests for facts, facts evaluation, and sources.
- **Evaluation Scoring (`server/evaluation-scoring.ts`):** Centralized logic for calculating scores for `facts_evaluation` records:
    - **Source Trust Score:** Automatically calculated from sources table metrics (public_trust + data_accuracy + proprietary_score) / 3
    - **Recency Score:** Three-tier system: ≤7 days = 100, ≤30 days = 50, >30 days = 10
    - **Consensus Score:** Manual rating (currently all set to 95)
    - **Trust Score:** Weighted average of the three component scores with adjustable weights (default 1:1:1)
- **Attribute Mapping:** Keyword-to-attribute mappings defined in `public/attribute-mapping.json` for flexible attribute inference.
- **Entity Alias Mapping (`public/entity-mapping.json`):** Maps 100+ common country aliases to canonical database names:
    - Examples: "USA"/"America" → "United States", "China"/"PRC" → "People's Republic of China", "Deutschland" → "Germany", "Holland" → "Kingdom of the Netherlands"
    - Only includes aliases for the 48 countries with facts in the database
    - Supports multiple languages and informal names (e.g., "Россия" → "Russia", "Bharat" → "India", "Nippon" → "Japan")

**Supported Countries (48):**
Argentina, Australia, Austria, Bangladesh, Belgium, Brazil, Canada, Chile, Colombia, Czech Republic, Denmark, Egypt, Finland, France, Germany, Greece, Hungary, India, Indonesia, Ireland, Israel, Italy, Japan, Kingdom of the Netherlands, Malaysia, Mexico, New Zealand, Nigeria, Norway, Pakistan, Paraguay, People's Republic of China, Philippines, Poland, Portugal, Romania, Russia, Saudi Arabia, Singapore, South Africa, South Korea, Spain, Sweden, Switzerland, Thailand, Turkey, United States, Vietnam

**Note:** Countries not in this list (e.g., United Kingdom, UAE) will show "No entity detected" as they don't have facts in the database yet.

**Features:**
- Automatic entity detection and numeric claim extraction.
- Keyword-based attribute inference and exact-match verification.
- Inline, color-coded verification badges and detailed results table with citations.
- Claims matrix view and a sources overview page with editable reliability metrics.
- Evaluation scoring page with interactive calculation breakdowns and comprehensive statistics.
- Three-tier recency scoring system with clear visual distribution.
- Dark/light theme support and responsive design.

## External Dependencies
- **PostgreSQL (Neon):** Primary database for storing `verified_facts`, `facts_evaluation`, and `sources` data.
- **Wikipedia (Wikidata) API:** Used by the `fetch-country-data.ts` script to gather country-specific facts.
- **World Bank API:** Used by the `fetch-country-data.ts` script to gather country-specific facts.
- **Drizzle ORM:** Used for interacting with the PostgreSQL database.