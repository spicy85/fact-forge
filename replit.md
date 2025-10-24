# Knowledge Agent - AI Fact Checker

## Overview
This project is an AI fact-checking application that verifies numeric claims in text against a trusted PostgreSQL database. It identifies numbers, infers their meaning, and displays inline verification badges (Verified, Mismatch, Unknown) with citations. The application aims to provide a reliable, data-driven solution for quickly validating information, reducing misinformation, and enhancing content credibility using a curated database of facts for 195 countries sourced from Wikipedia, World Bank, and Wikidata.

## Recent Changes (October 24, 2025)
- **Attribute Classification System:** Implemented extensible attribute type system to control filtering behavior
  - Added `attribute_class` column to verified_facts and facts_evaluation tables (varchar, default: 'time_series')
  - Three classification types: `historical_constant` (founded_year, independence_date), `time_series` (population, gdp, inflation), `static` (area, capital_city)
  - Updated verifyClaimMultiSource() to check attribute_class and skip year-filtering for historical_constant attributes
  - Backfilled 243 historical_constant and 97 static records via SQL UPDATE statements
  - Updated key fetcher scripts (fetch-worldbank-data.ts, fetch-wikidata.ts, fetch-historical-wikidata.ts) to set attribute_class on insert
  - **Fixes bug**: "US founded in 1776" now shows BOTH Wikipedia (1776) and Wikidata (1784) sources, displaying range "1776 - 1784" to reveal historical discrepancies
  - Historical constants show all sources regardless of year; time-series data filters to most recent year when no year specified
- **Schema Cleanup - source_trust Rename:** Renamed `source_trust` column to `source_name` across entire codebase for clarity
  - Column stores source identifier/domain (e.g., "Wikipedia", "www.wikidata.org"), not numeric trust score
  - Updated both `verified_facts` and `facts_evaluation` tables via ALTER TABLE SQL migration
  - Refactored all backend references: storage.ts deduplication keys, WHERE clauses, activity logging
  - Updated frontend interfaces: FactRecord and CredibleEvaluation in factChecker.ts
  - Batch updated 15+ fetcher scripts: fetch-wikidata.ts, fetch-worldbank-data.ts, cross-check-sources.ts, etc.
  - Database migration executed successfully, application verified working with GET /api/facts returning 200
  - Note: `source_trust_score` column (numeric 0-100) remains unchanged and still stores actual trust scores
- **Year-Specific Range Filtering:** Implemented temporal context extraction for showing ranges specific to mentioned years
  - Added `year?: number` field to NumericClaim interface to store extracted year from temporal context
  - Created `extractYearFromContext()` function to detect 4-digit years (1900-2100) in ±50 char context around claims
  - Updated `extractNumericClaims()` to automatically populate year field by searching for temporal keywords ("in", "during", "since", etc.)
  - Refactored `verifyClaimMultiSource()` to filter credibleEvaluations by as_of_date:
    - When year is specified → filter to that year (±1 year tolerance)
    - When no year specified → default to most recent data (assumes current/latest is desired)
  - Recalculates min/max/consensus from filtered data using same algorithm as server (simple average per storage.ts line 220)
  - Uses immutable data flow: original sourceData preserved, separate comparisonData view created for year-scoped verification
  - Verified working: "US population was 220m in 1980" → shows 226M (1980 data only), "US population is 340m" → shows 340M (most recent data)
- **Time-Series Data Support:** Implemented historical fact verification for claims from different years
  - Created `fetch-historical-wikidata.ts` script to query historical population and GDP data (1975-2025)
  - Modified promotion deduplication from `(entity, attribute, source_name)` to `(entity, attribute, source_name, as_of_date)`
  - Updated `getMultiSourceEvaluations()` to return ALL time-series data instead of only latest values
  - Fetched 13 historical data points for USA: 11 population records (1980-2024) + 2 GDP records (2021-2022)
  - Current state: 930 verified facts (up from 917) enabling historical claim verification
  - Verified working: "USA population was 226 million in 1980" ✅, "USA had 331M people in 2020" ✅
- **Data Flow Refactoring:** Corrected data pipeline to enforce unidirectional flow from working table to gold standard
  - Fixed `fetch-country-data.ts` and `migrate-csv-to-db.ts` to insert into `facts_evaluation` instead of `verified_facts`
  - All data now enters through `facts_evaluation` first (working table with trust scores)
  - Promotion system moves high-trust facts (≥85 score) to `verified_facts` (gold standard)
  - Eliminated backwards data flow: deprecated `fetch-wikipedia-evaluations.ts` and `populate-evaluation-table.ts`
  - Correct architecture: Data enters → facts_evaluation (scored) → promotion → verified_facts (UI queries this)
- **Attribute-Specific Tolerance System:** Implemented configurable tolerance percentages per attribute to prevent false verifications
  - Created `public/tolerance-config.json` with attribute-specific tolerances (founded_year: 0.1%, population/gdp: 10%, area: 2%, etc.)
  - Added `getToleranceForAttribute()` helper in factChecker.ts for dynamic tolerance lookup
  - Updated `verifyClaim()` and `verifyClaimMultiSource()` to use attribute-aware tolerance instead of hardcoded 10%
  - Fixed rounding precision logic to skip year attributes, preventing spurious matches (e.g., 1000 vs 789)
  - Enhanced tolerance calculation with `Math.max(rangeSize, Math.abs(consensus))` to handle negative numbers and mixed-sign ranges
  - Fixes critical bug: year 1000 no longer incorrectly matches year 789 (now uses 0.1% tolerance for years)
- **Fact Promotion System:** Implemented automated promotion from facts_evaluation to verified_facts gold standard
  - Added `promotion_threshold` to scoring_settings schema (default: 85, configurable via admin UI)
  - Created `promoteFactsToVerified()` storage method with deduplication by (entity, attribute, source_name)
  - Temporal metadata flow: as_of_date → as_of_date, evaluated_at → last_verified_at
  - Updated `getMultiSourceEvaluations()` to query verified_facts (gold standard) instead of facts_evaluation
  - Integrated promotion logging with facts_activity_log using fire-and-forget pattern
  - Admin UI button triggers promotion and displays statistics (promoted count, skipped count)
  - Architecture: facts_evaluation = working table, verified_facts = production table (UI queries this)
- **Number Parsing Enhancement:** Added support for trillion notation ('t', 'trillion') in both extraction and parsing
  - Fixed `extractNumericClaims()` regex to capture 't' and 'trillion' suffixes
  - Updated `parseHumanNumber()` multipliers to handle compact trillion notation
  - Now supports: "3t", "2.5 trillion", "29t", etc.
- **Complete Wikidata Integration:** Extended dataset from 60 to 195 countries
  - Fixed attribute naming: consolidated to 'gdp', 'area', 'population' (removed 'gdp_usd', 'area_km2')
  - Inserted 576 Wikidata evaluations covering all countries A-Z
  - All major countries now have multi-source verification (World Bank + Wikidata)
  - Ranges display correctly for GDP, population, and area across entire dataset

## User Preferences
- Clean, data-focused interface design
- Monospace font for numeric values
- Clear visual distinction between verification states
- Tooltips for additional context
- Responsive layout for mobile/desktop

## System Architecture
The application is a multi-page React application built with Vite, utilizing an Express backend for serving static files and API endpoints to a PostgreSQL database.

**UI/UX Decisions:**
- **Frontend Framework:** React 18 with TypeScript.
- **Styling:** Tailwind CSS and shadcn/ui components.
- **Theming:** Custom dark/light mode with localStorage persistence.
- **Pages:**
    - `FactChecker` (`/`): Main interface.
    - `ClaimsMatrix` (`/claims-matrix`): Visual representation of supported claims.
    - `SourcesOverview` (`/sources`): Displays trusted data sources.
    - `SourcePipeline` (`/sources/pipeline`): Source evaluation pipeline.
    - `SourceActivityLog` (`/sources/activity-log`): Audit trail of source status changes.
    - `FactsActivityLog` (`/facts/activity-log`): Audit trail of fact lifecycle events.
    - `EvaluationScoring` (`/evaluation-scoring`): Interactive page for scoring formulas.
    - `AdminScoring` (`/admin`): Admin interface for configuring scoring weights and recency tiers.

**Technical Implementations:**
- **Data Layer:** PostgreSQL database accessed via Drizzle ORM. Key tables include:
    - `verified_facts`: Gold standard production table (UI queries this) with `entity_type` column (default: "country") and `as_of_date` for time-series data. Deduplication by (entity, attribute, source_name, as_of_date) allows multiple historical records per source.
    - `facts_evaluation`: Working table for all sources, scoring, and pending/rejected evaluations with `entity_type` classification
    - `sources`: Source reliability metrics and workflow tracking
    - `scoring_settings`: Global scoring configuration including `promotion_threshold` (default: 85)
    - `requested_facts`: User-requested entity-attribute combinations with `entity_type`
    - `source_activity_log`: Audit trail of source status changes
    - `facts_activity_log`: Comprehensive lifecycle tracking with `entity_type` for all fact events (including promotions)
- **Backend:** Express server handling API requests for facts, evaluations, sources, and scoring settings.
- **Multi-Source Verification API (`/api/multi-source-evaluations`):** Endpoint for aggregating credible evaluations from verified_facts gold standard and determining consensus.
- **Fact Promotion System (`POST /api/admin/promote-facts`):** Automated promotion of high-trust evaluations (≥ threshold) from facts_evaluation to verified_facts with deduplication by (entity, attribute, source_name), temporal metadata flow, and activity logging.
- **Evaluation Scoring (`server/evaluation-scoring.ts`):** Centralized logic for calculating scores based on source trust, recency, and consensus.
- **Admin Configuration System (`/admin`):** Interface for managing scoring methodology (weights, recency, credible threshold, promotion threshold).
- **Score Recalculation System:** Dynamic score synchronization via `POST /api/facts-evaluation/recalculate`.
- **Cross-Check Sources System (`/admin`):** Automated tool for identifying and fetching missing data from external sources, with deduplication.
- **Fulfill Requested Facts System (`/admin`):** Processes user-requested facts, fetches data from external sources, and updates the database.
- **Time-Series Data Pipeline (`scripts/fetch-historical-wikidata.ts`):** Automated fetcher for historical population and GDP data from Wikidata spanning 1975-2025, enabling verification of claims from different years.
- **Source Management System (`/sources` and `/sources/pipeline`):** UI-driven system for managing data sources, including adding, promoting, and rejecting.
- **Source Activity Logging (`/sources/activity-log`):** Automatic logging of source status changes.
- **Facts Activity Logging (`/facts/activity-log`):** Comprehensive audit trail for fact lifecycle events (requested, fulfilled, added, promoted) with fire-and-forget logging and batch inserts.
- **Core Logic (`lib/factChecker.ts`):** Handles entity detection, claim extraction with support for k/m/b/t notation, attribute inference, multi-source claim verification with trust-weighted consensus, and requested facts tracking.
- **Attribute Mapping:** Keyword-to-attribute mappings in `public/attribute-mapping.json`.
- **Tolerance Configuration (`public/tolerance-config.json`):** Attribute-specific percentage tolerances for claim verification (founded_year: 0.1%, population/gdp: 10%, area: 2%, inflation: 5%, default: 10%).
- **Entity Alias Mapping (`public/entity-mapping.json`):** Maps country aliases to canonical names.
- **Temporal Tracking System:** Maintains critical distinction between two types of dates:
    - `evaluated_at`: When we last checked the source (e.g., "2024-12-31" when we ran the Wikipedia fetcher on Dec 31, 2024)
    - `as_of_date`: When the data itself is actually valid for (e.g., "2024-01-01" for 2024 population data, "1947-05-03" for Japan's founding date)
    - Data integrity rule: Never fabricate dates - only store `as_of_date` when the source provides actual temporal metadata (World Bank year data, Wikidata P585 qualifiers, Wikipedia founded year extraction)
    - UI displays `as_of_date` in "Last Updated" column to show users when the data is valid for, not when we checked the source

## External Dependencies
- **PostgreSQL (Neon):** Primary database.
- **Drizzle ORM:** Database interaction.
- **Wikipedia API:** Used for baseline country facts and evaluations.
- **World Bank API:** Provides population, GDP, GDP per capita, area, and inflation data.
- **Wikidata SPARQL API:** Used to query structured knowledge for various attributes.