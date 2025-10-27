# Knowledge Agent - AI Fact Checker

## Overview
This project is an AI fact-checking application that verifies numeric claims in text against a trusted PostgreSQL database. It identifies numbers, infers their meaning, and displays inline verification badges (Verified, Mismatch, Unknown) with citations. The application aims to provide a reliable, data-driven solution for quickly validating information, reducing misinformation, and enhancing content credibility using a curated database of facts for 195 countries sourced from Wikipedia, World Bank, and Wikidata. The project's ambition is to offer a robust and transparent tool for combating misinformation by grounding numerical claims in verifiable data, ultimately increasing trust in digital content.

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
- **Key Pages:** FactChecker (main interface), ClaimsMatrix, SourcesOverview, SourcePipeline, SourceActivityLog, FactsActivityLog, EvaluationScoring, AdminScoring.

**Technical Implementations:**
- **Data Layer:** PostgreSQL database accessed via Drizzle ORM. Key tables include `verified_facts` (gold standard), `facts_evaluation` (working table), `sources`, `source_identity_metrics`, `tld_scores`, `scoring_settings`, `requested_facts`, `source_activity_log`, and `facts_activity_log`. Data deduplication for time-series facts includes `(entity, attribute, source_name, as_of_date)`. The `requested_facts` table tracks user demand for missing data using `(entity, attribute, claim_year)` as deduplication key, enabling year-specific request tracking (e.g., "France population 2003" vs "France population 2010" are separate requests).
- **Backend:** Express server handles API requests for facts, evaluations, sources, and scoring settings.
- **Multi-Source Verification API:** Aggregates credible evaluations and determines consensus.
- **Fact Promotion System:** Automates promotion of high-trust evaluations from `facts_evaluation` to `verified_facts` based on a configurable `promotion_threshold`.
- **Evaluation Scoring:** Centralized logic for calculating scores based on source trust, recency, and consensus.
- **Admin Configuration System:** Manages scoring methodology (weights, recency, credible threshold, promotion threshold).
- **Cross-Check Sources & Fulfill Requested Facts Systems:** Tools for identifying and fetching missing data, and processing user-requested facts. The fulfill system now uses `claim_year` from `requested_facts` to fetch year-specific data from World Bank and Wikidata APIs, ensuring accurate historical data retrieval (e.g., "France population 2003" fetches actual 2003 data, not latest).
- **Time-Series Data Pipeline:** Automated fetching of historical population and GDP data from Wikidata (1960-2025).
- **Pull New Facts System:** Admin tool (`/api/admin/pull-new-facts`) to fetch specific data on demand from World Bank and Wikidata APIs. Accepts arrays of entities, attributes, and years, queries external APIs, checks for duplicates using (entity, attribute, source_name, as_of_date), and inserts new evaluations into `facts_evaluation` table. Returns detailed stats (requested, found, duplicates, inserted). UI in AdminScoring page with form for selecting countries, attributes (checkboxes), and year ranges.
- **Source Management System:** UI-driven system for managing data sources (add, promote, reject) with activity logging. Sources table cleaned to include only active trusted sources (data.worldbank.org, en.wikipedia.org, www.wikidata.org) plus empty pending sources (unstats.un.org, www.imf.org) reserved for future use. Test, rejected, and unused sources removed.
- **Source Identity Metrics System:** Dedicated subsystem for managing source identity scores. The `source_identity_metrics` table tracks three sub-components for each source: `url_repute` (domain reputation based on TLD), `certificate` (SSL/TLS validation), and `ownership` (verified authorship). Identity score auto-calculates as the average of these three components. The `url_repute` field (renamed from `url_security`) uses configurable TLD scoring to assess domain trustworthiness.
- **TLD Configuration System:** Admin-configurable Top-Level Domain (TLD) reputation scoring via `tld_scores` table and UI in AdminScoring page. Allows admins to assign reputation scores (0-100) to domain extensions (e.g., .gov=100, .org=100, .dot=75). Includes full CRUD operations with validation (enforces leading dot, clamps scores). Seeded with initial values for .gov, .org, and .dot. This system enables automated URL reputation assessment based on source domain extensions.
- **Facts Count Synchronization:** Automatic `facts_count` tracking in sources table. Increments when facts are inserted via `insertVerifiedFact()` or promoted via `promoteFactsToVerified()`. Admin tool `/api/admin/sync-facts-count` recalculates counts from `verified_facts` table to fix discrepancies. Future fact deletion workflows should either decrement counts or rerun sync.
- **Facts Activity Logging:** Comprehensive audit trail for fact lifecycle events.
- **Core Logic (`lib/factChecker.ts`):** Handles entity detection, numeric claim extraction (supports k/m/b/t notation), attribute inference, multi-source claim verification with trust-weighted consensus, and requested facts tracking with year-specific granularity. Uses `extractYearFromContext()` to detect temporal context (e.g., "in 2003") and logs requests with the specific year, enabling admins to see demand for historical data like "France population 2003: 12 requests" vs "France population 2020: 8 requests". Includes temporal context extraction for year-specific filtering in verification.
- **Configuration Files:** `public/attribute-mapping.json` (keyword to attribute), `public/tolerance-config.json` (attribute-specific tolerances, e.g., founded_year: 0.1%, population/gdp: 10%), `public/entity-mapping.json` (country aliases).
- **Temporal Tracking:** Distinguishes between `evaluated_at` (when source was checked) and `as_of_date` (when data is valid), ensuring `as_of_date` is only stored when provided by the source. An `attribute_class` column (`historical_constant`, `time_series`, `static`) controls filtering behavior, allowing historical constants to show all sources regardless of year.
- **Year-Based Filtering:** For time_series attributes, the system extracts year from temporal context (e.g., "in 2000") and filters evaluations to ±1 year tolerance. Critical implementation: backend `getMultiSourceEvaluations()` must include `attribute_class` field in credibleEvaluations mapping to enable frontend filtering logic in `verifyClaimMultiSource()`.

## External Dependencies
- **PostgreSQL (Neon):** Primary database.
- **Drizzle ORM:** Database interaction.
- **Wikipedia API:** Used for baseline country facts and evaluations.
- **World Bank API:** Provides population, GDP, GDP per capita, area, and inflation data.
- **Wikidata SPARQL API:** Used to query structured knowledge for various attributes.
- **IMF API (IFS):** International Financial Statistics providing GDP, inflation rate, and unemployment rate data. Integration code complete in `server/integrations/imf-api.ts` and available in Pull New Facts tool. Note: IMF API endpoint (dataservices.imf.org) currently blocked in Replit environment; code tested and ready for environments with IMF API access.