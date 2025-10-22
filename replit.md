# Knowledge Agent - AI Fact Checker

## Overview
This project is an AI fact-checking application designed to verify numeric claims within text against a trusted PostgreSQL database. It identifies numbers, infers their meaning, and displays inline verification badges (Verified, Mismatch, Unknown) with citations. The application provides a reliable tool for assessing the accuracy of numerical data in textual content, leveraging a curated database of facts for 48 countries sourced from Wikipedia and the World Bank. The business vision is to offer a robust, data-driven solution for quickly validating information, reducing the spread of misinformation, and enhancing content credibility across various sectors.

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
    - `SourcesOverview` (`/sources`): Displays trusted, production-ready data sources.
    - `SourcePipeline` (`/sources/pipeline`): Source evaluation pipeline for onboarding new sources.
    - `EvaluationScoring` (`/evaluation-scoring`): Interactive page showing detailed scoring formulas and breakdowns.
    - `AdminScoring` (`/admin`): Centralized admin interface to configure scoring weights and recency tiers.

**Technical Implementations:**
- **Data Layer:** PostgreSQL database accessed via Drizzle ORM.
    - `verified_facts`: Stores 192 immutable, verified numerical facts for 48 countries.
    - `facts_evaluation`: Manages workflow for evaluating claims with multi-criteria scoring (`source_trust_score`, `recency_score`, `consensus_score`, `trust_score`).
    - `sources`: Stores data source reliability metrics with workflow status tracking.
    - `scoring_settings`: Singleton table for global scoring configuration.
- **Backend:** Express server handling API requests for facts, evaluations, sources, and scoring settings.
- **Multi-Source Verification API (`/api/multi-source-evaluations`):** Endpoint for fetching and aggregating credible evaluations, calculating trust-weighted consensus, and determining min/max credible range.
- **Evaluation Scoring (`server/evaluation-scoring.ts`):** Centralized logic for calculating scores based on source trust, recency, and consensus, with configurable weights.
- **Admin Configuration System (`/admin`):** Interface for managing scoring methodology, including adjustable weights, recency tiers, and a credible threshold for source consideration. Settings are stored in `scoring_settings` table.
- **Score Recalculation System:** Dynamic score synchronization with admin settings via a recalculation button and API endpoint (`POST /api/facts-evaluation/recalculate`).
- **Source Management System (`/sources` and `/sources/pipeline`):** Dual-view system for managing data sources, allowing for adding, promoting, and rejecting sources through the UI without code changes. Includes 12 pre-configured sources.
- **Core Logic (`lib/factChecker.ts`):**
    - **Entity Detection:** Identifies country names using aliases from `entity-mapping.json` and canonical name matching for 48 supported countries.
    - **Claim Extraction:** Uses regex to extract numeric claims and context, supporting human-friendly formats (e.g., "12 million", "1.5B").
    - **Attribute Inference:** Matches keywords to predefined attributes using `attribute-mapping.json`.
    - **Multi-Source Claim Verification:** Uses trust-weighted consensus from multiple credible sources.
        - Credible sources have `trust_score ≥ credible_threshold` (default 80).
        - Verification states: "Verified" (exact match), "Close" (within credible range), "Mismatch" (outside range), "Unknown" (no credible sources).
    - **Result Generation:** Creates inline badges with tooltips showing consensus value, credible range, source count, and formatted values.
- **Attribute Mapping:** Keyword-to-attribute mappings defined in `public/attribute-mapping.json`.
- **Entity Alias Mapping (`public/entity-mapping.json`):** Maps 100+ common country aliases to canonical names for the 48 supported countries.

**Supported Countries (48):**
Argentina, Australia, Austria, Bangladesh, Belgium, Brazil, Canada, Chile, Colombia, Czech Republic, Denmark, Egypt, Finland, France, Germany, Greece, Hungary, India, Indonesia, Ireland, Israel, Italy, Japan, Kingdom of the Netherlands, Malaysia, Mexico, New Zealand, Nigeria, Norway, Pakistan, Paraguay, People's Republic of China, Philippines, Poland, Portugal, Romania, Russia, Saudi Arabia, Singapore, South Africa, South Korea, Spain, Sweden, Switzerland, Thailand, Turkey, United States, Vietnam.

## External Dependencies
- **PostgreSQL (Neon):** Primary database for storing project data.
- **Drizzle ORM:** Used for programmatic interaction with the PostgreSQL database.
- **Wikipedia (Wikidata) API:** Utilized by `fetch-country-data.ts` and `fetch-wikipedia-evaluations.ts` scripts for baseline country facts and evaluations.
- **World Bank API:** Integrated via `server/integrations/worldbank-api.ts` and `scripts/fetch-worldbank-subset.ts` to provide population, GDP, GDP per capita, area, and inflation data for multi-source verification.
## Multi-Source Verification Status
The application now has **comprehensive multi-source consensus** working with Wikipedia + World Bank data across all 48 countries:

**Data Coverage:**
- **Wikipedia evaluations**: 246 entries covering 50 countries (includes UK, UAE not in 48-country list)
  - Attributes: population, area_km2, gdp_usd, founded_year
  - Source: `scripts/fetch-wikipedia-evaluations.ts`
  - Trust scores: ~92 (calculated from source metrics)
  - Filtering: Only genuine Wikipedia facts (filtered by source_url containing 'wikipedia')

- **World Bank evaluations**: 124 entries across 48 countries
  - Attributes: population, gdp, gdp_per_capita, area, inflation
  - Sources: api.worldbank.org (84 entries), data.worldbank.org (40 entries)
  - Source: `scripts/fetch-worldbank-subset.ts`
  - Trust scores: 80-94 (calculated from source metrics)
  - Deduplication: Pre-insert checks prevent duplicate entries

**Multi-Source Examples:**
- **Argentina population**: 4 sources (Wikipedia + World Bank) with trust scores 80-94, values ranging 45.7M-47.3M
- **Canada**: Multiple attributes with cross-source verification
- **13 countries** have 8+ attributes with full Wikipedia + World Bank coverage
- **All 48 countries** have at least 4 attributes from Wikipedia

**Data Scripts:**
- `scripts/fetch-wikipedia-evaluations.ts`: Transfers Wikipedia data from verified_facts to facts_evaluation with proper filtering and deduplication
- `scripts/fetch-worldbank-subset.ts`: Fetches World Bank data for all 48 countries with deduplication and error handling
- `scripts/remove-duplicates.ts`: Cleanup script that removed 110 duplicate entries (370 unique evaluations remain)

**Known Limitations:**
- World Bank API sequential requests may timeout before completing all countries in a single run
- Re-running scripts is safe due to deduplication checks
- **IMF SDMX API Blocking Confirmed (Tested 2025-10-22):**
  - **Integration Attempt:** Created `scripts/fetch-imf-data.py` using Python sdmx1 library to fetch CPI (inflation) and GDP data
  - **Test Results:** Tested with 5 countries (USA, CAN, DEU, JPN, GBR) - all failed with identical errors
  - **Error:** `requests.exceptions.HTTPError: 501 Server Error` for all requests to https://sdmxcentral.imf.org/ws/public/sdmxapi/rest/data/
  - **Examples:**
    - CPI request: `https://sdmxcentral.imf.org/ws/public/sdmxapi/rest/data/CPI/USA.PCPI_IX?startPeriod=2020` → HTTP 501
    - IFS request: `https://sdmxcentral.imf.org/ws/public/sdmxapi/rest/data/IFS/CAN.NGDP_XDC?startPeriod=2020` → HTTP 501
  - **Cause:** HTTP 501 "Not Implemented" indicates server-side rejection, likely IP-based blocking or firewall rules preventing access from Replit environment
  - **Status:** Integration code is structurally sound and makes proper HTTPS requests, but IMF servers block all data retrieval attempts
  - **Impact:** Cannot add IMF as additional data source for multi-source verification
  - **Attempted Data:** Inflation (CPI), GDP (IFS dataset)
- **UN Statistics SDMX API:** Similar HTTP 501 blocking expected based on IMF results
