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
    - `SourcesOverview` (`/sources`): Displays trusted, production-ready data sources with editable reliability metrics.
    - `SourcePipeline` (`/sources/pipeline`): Source evaluation pipeline for onboarding new sources without code changes.
    - `EvaluationScoring` (`/evaluation-scoring`): Interactive page showing detailed scoring formulas, statistics, and calculation breakdowns for all evaluations.
    - `AdminScoring` (`/admin`): Centralized admin interface to configure scoring weights and recency tiers for the entire system.
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
    - `sources`: Stores data source reliability metrics with workflow status tracking (pending_review, evaluating, trusted, rejected). Enables source onboarding without code changes.
    - `scoring_settings`: Singleton table storing global scoring configuration (weights and recency tiers), configurable via the Admin interface.
- **Backend:** Express server handling API requests for facts, facts evaluation, sources, and scoring settings.
- **Evaluation Scoring (`server/evaluation-scoring.ts`):** Centralized logic for calculating scores for `facts_evaluation` records:
    - **Source Trust Score:** Automatically calculated from sources table metrics (public_trust + data_accuracy + proprietary_score) / 3
    - **Recency Score:** Configurable three-tier system (defaults: ≤7 days = 100, ≤30 days = 50, >30 days = 10)
    - **Consensus Score:** Manual rating (currently all set to 95)
    - **Trust Score:** Weighted average of the three component scores with configurable weights (defaults: 1:1:1 for equal weighting)
- **Admin Configuration System (`/admin`):** Single-page interface for managing scoring methodology:
    - **Scoring Weights:** Adjustable sliders (0-10 scale) for source trust, recency, and consensus weights with live percentage display
    - **Recency Tiers:** Configurable day thresholds and scores for three-tier recency evaluation
    - **Persistence:** Settings stored in `scoring_settings` table and applied automatically to all new evaluations
    - **Reset Functionality:** One-click restore to default configuration
- **Source Management System (`/sources` and `/sources/pipeline`):** Dual-view system for managing data sources:
    - **Trusted Sources (`/sources`):** Production-ready sources with status='trusted' used for active fact verification
    - **Source Pipeline (`/sources/pipeline`):** Evaluation workflow for new sources (status='pending_review' or 'evaluating')
    - **Add Source:** Form to add new sources with domain and initial trust metrics
    - **Promote/Reject:** Manual review actions to move sources from pipeline to trusted list or mark as rejected
    - **Seeded Data:** 12 pre-configured sources (Wikipedia, World Bank, UN, IMF, OECD, etc.) - 2 trusted, 10 pending review
    - **No Code Changes:** Complete source lifecycle management through UI without developer intervention
- **Attribute Mapping:** Keyword-to-attribute mappings defined in `public/attribute-mapping.json` for flexible attribute inference.
- **Entity Alias Mapping (`public/entity-mapping.json`):** Maps 100+ common country aliases to canonical database names:
    - Examples: "USA"/"America" → "United States", "China"/"PRC" → "People's Republic of China", "Deutschland" → "Germany", "Holland" → "Kingdom of the Netherlands"
    - Only includes aliases for the 48 countries with facts in the database
    - Supports multiple languages and informal names (e.g., "Россия" → "Russia", "Bharat" → "India", "Nippon" → "Japan")

**Supported Countries (48):**
Argentina, Australia, Austria, Bangladesh, Belgium, Brazil, Canada, Chile, Colombia, Czech Republic, Denmark, Egypt, Finland, France, Germany, Greece, Hungary, India, Indonesia, Ireland, Israel, Italy, Japan, Kingdom of the Netherlands, Malaysia, Mexico, New Zealand, Nigeria, Norway, Pakistan, Paraguay, People's Republic of China, Philippines, Poland, Portugal, Romania, Russia, Saudi Arabia, Singapore, South Africa, South Korea, Spain, Sweden, Switzerland, Thailand, Turkey, United States, Vietnam

**Note:** Countries not in this list (e.g., United Kingdom, UAE) will show "No entity detected" as they don't have facts in the database yet.

**Features:**
- Automatic entity detection and numeric claim extraction with 100+ country alias support.
- Keyword-based attribute inference and exact-match verification.
- Inline, color-coded verification badges and detailed results table with citations.
- Claims matrix view showing coverage of facts across countries.
- Source management system with trusted/pipeline separation for code-free source onboarding.
- Evaluation scoring page with interactive calculation breakdowns and comprehensive statistics.
- Admin interface for centralized scoring configuration (weights and recency tiers).
- Configurable three-tier recency scoring system with adjustable thresholds and scores.
- Dynamic scoring weights (source trust, recency, consensus) with live percentage display.
- Manual promote/reject workflow for source quality control.
- Dark/light theme support and responsive design.

## External Dependencies
- **PostgreSQL (Neon):** Primary database for storing `verified_facts`, `facts_evaluation`, and `sources` data.
- **Wikipedia (Wikidata) API:** Used by the `fetch-country-data.ts` script to gather country-specific facts.
- **World Bank API:** Used by the `fetch-country-data.ts` script to gather country-specific facts.
- **Drizzle ORM:** Used for interacting with the PostgreSQL database.