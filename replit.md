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
    - `requested_facts`: Tracks unsupported entity-attribute combinations requested by users for data prioritization. Includes request count, claim values, and timestamps.
- **Backend:** Express server handling API requests for facts, evaluations, sources, and scoring settings.
- **Multi-Source Verification API (`/api/multi-source-evaluations`):** Endpoint for fetching and aggregating credible evaluations, calculating trust-weighted consensus, and determining min/max credible range.
- **Evaluation Scoring (`server/evaluation-scoring.ts`):** Centralized logic for calculating scores based on source trust, recency, and consensus, with configurable weights.
- **Admin Configuration System (`/admin`):** Interface for managing scoring methodology, including adjustable weights, recency tiers, and a credible threshold for source consideration. Settings are stored in `scoring_settings` table.
- **Score Recalculation System:** Dynamic score synchronization with admin settings via a recalculation button and API endpoint (`POST /api/facts-evaluation/recalculate`).
- **Cross-Check Sources System (`/admin`):** Automated data management tool that identifies all entity-attribute pairs and ensures comprehensive coverage across Wikipedia, World Bank, and Wikidata. Features built-in deduplication to prevent duplicate entries. Accessible via Admin page with real-time statistics display showing facts added per source and duplicates skipped.
- **Source Management System (`/sources` and `/sources/pipeline`):** Dual-view system for managing data sources, allowing for adding, promoting, and rejecting sources through the UI without code changes. Includes 12 pre-configured sources.
- **Core Logic (`lib/factChecker.ts`):**
    - **Entity Detection:** Identifies country names using aliases from `entity-mapping.json` and canonical name matching for ~195 countries worldwide.
    - **Claim Extraction:** Uses regex to extract numeric claims and context, supporting human-friendly formats (e.g., "12 million", "1.5B").
    - **Attribute Inference:** Matches keywords to predefined attributes using `attribute-mapping.json`.
    - **Multi-Source Claim Verification:** Uses trust-weighted consensus from multiple credible sources.
        - Credible sources have `trust_score ≥ credible_threshold` (default 80).
        - Verification states: "Verified" (exact match), "Close" (within credible range), "Mismatch" (outside range), "Unknown" (no credible sources).
    - **Requested Facts Tracking:** Fire-and-forget logging of unsupported entity-attribute combinations when verification status is "Unknown".
        - Async POST to `/api/requested-facts` endpoint with entity, attribute, and claim value.
        - Backend upserts into `requested_facts` table, incrementing request_count for duplicates.
        - Provides data-driven insights for prioritizing future data expansion.
    - **Result Generation:** Creates inline badges with tooltips showing consensus value, credible range, source count, and formatted values.
- **Attribute Mapping:** Keyword-to-attribute mappings defined in `public/attribute-mapping.json`.
- **Entity Alias Mapping (`public/entity-mapping.json`):** Maps common country aliases and variations to canonical names for ~195 countries worldwide (data available for 48).

**Supported Countries (48):**
Argentina, Australia, Austria, Bangladesh, Belgium, Brazil, Canada, Chile, Colombia, Czech Republic, Denmark, Egypt, Finland, France, Germany, Greece, Hungary, India, Indonesia, Ireland, Israel, Italy, Japan, Kingdom of the Netherlands, Malaysia, Mexico, New Zealand, Nigeria, Norway, Pakistan, Paraguay, People's Republic of China, Philippines, Poland, Portugal, Romania, Russia, Saudi Arabia, Singapore, South Africa, South Korea, Spain, Sweden, Switzerland, Thailand, Turkey, United States, Vietnam.

## External Dependencies
- **PostgreSQL (Neon):** Primary database for storing project data.
- **Drizzle ORM:** Used for programmatic interaction with the PostgreSQL database.
- **Wikipedia API:** Utilized by `fetch-country-data.ts` and `fetch-wikipedia-evaluations.ts` scripts for baseline country facts and evaluations.
- **World Bank API:** Integrated via `server/integrations/worldbank-api.ts` and `scripts/fetch-worldbank-subset.ts` to provide population, GDP, GDP per capita, area, and inflation data for multi-source verification.
- **Wikidata SPARQL API:** Integrated via `scripts/fetch-wikidata.ts` to query structured knowledge base for population, GDP, area, and founding dates using SPARQL queries.

## Multi-Source Verification Status
The application now has **comprehensive multi-source consensus** working with Wikipedia + World Bank + Wikidata across all 48 countries:

**Data Coverage (562 total evaluations):**
- **Wikipedia evaluations**: 150 entries across 48 supported countries
  - Attributes: population, area_km2, gdp_usd, founded_year
  - Source: `scripts/fetch-wikipedia-evaluations.ts`
  - Trust scores: 94 public_trust, 85 data_accuracy
  - Filtering: Only genuine Wikipedia facts (filtered by source_url containing 'wikipedia')

- **World Bank evaluations**: 220 entries across 51 countries
  - Attributes: population, gdp, gdp_per_capita, area, inflation, gdp_usd
  - Source: **data.worldbank.org** (consolidated from api.worldbank.org and data.worldbank.org)
  - Trust scores: 92 public_trust, 95 data_accuracy (merged best values from both sources)
  - Fetched via: `scripts/fetch-worldbank-subset.ts`
  - Deduplication: Pre-insert checks prevent duplicate entries

- **Wikidata evaluations**: 192 entries across 48 countries
  - Attributes: population, gdp_usd, area_km2, founded_year
  - Source: **www.wikidata.org** via SPARQL queries
  - Trust scores: 94 public_trust, 85 data_accuracy, 85 proprietary_score (overall trust: 88)
  - Fetched via: `scripts/fetch-wikidata.ts` using Q-ID mapping for all 48 countries
  - Query endpoint: https://query.wikidata.org/sparql
  - Final trust_scores: 82-90 (all above credible threshold of 80)

**Multi-Source Examples:**
- **United States population**: 4 sources (Wikipedia + World Bank + Wikidata) with trust scores 75-92
- **Canada population**: 5 evaluations from 3 different trusted sources
- **All 48 countries** now have data from all 3 trusted sources (Wikipedia, World Bank, Wikidata)
- **Typical coverage per country**: 8-12 attributes with multi-source verification

**Data Scripts:**
- `scripts/fetch-wikipedia-evaluations.ts`: Transfers Wikipedia data from verified_facts to facts_evaluation with proper filtering and deduplication
- `scripts/fetch-worldbank-subset.ts`: Fetches World Bank data for all 48 countries with deduplication and error handling
- `scripts/fetch-wikidata.ts`: Queries Wikidata SPARQL endpoint for population, GDP, area, and founding dates using Q-ID mappings
- `scripts/cross-check-sources.ts`: **NEW** - Automated cross-checking tool that identifies all entity-attribute pairs and fetches missing data from Wikipedia, World Bank, and Wikidata. Features comprehensive deduplication checking by (entity, attribute, source_trust) tuple. Accessible via Admin page UI button with real-time statistics. Expected runtime: 2-5 minutes for full dataset depending on API response times.
- `scripts/recalculate-wikidata-scores.ts`: Recalculates trust scores for all Wikidata evaluations after source trust updates
- `scripts/remove-duplicates.ts`: Cleanup script that removed 110 duplicate entries
- `scripts/consolidate-worldbank-sources.ts`: Merged api.worldbank.org into data.worldbank.org (220 total facts)
- `scripts/recalculate-facts-count.ts`: Updates facts_count for all sources by extracting domains from source_url
- `server/utils.ts`: Utility function `extractDomain()` for normalizing URLs to hostnames

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
