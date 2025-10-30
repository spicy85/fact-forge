# Knowledge Agent - AI Fact Checker

## Overview
This project is an AI fact-checking application that verifies numeric claims in text against a trusted PostgreSQL database. It identifies numbers, infers their meaning, and displays inline verification badges with citations. The application aims to provide a reliable, data-driven solution for quickly validating information, reducing misinformation, and enhancing content credibility using a curated database of facts for 195 countries sourced from Wikipedia, World Bank, and Wikidata.

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
- **Key Pages:** FactChecker, ClaimsMatrix, DataCoverage, SourcesOverview, SourcePipeline, SourceActivityLog, FactsActivityLog, EvaluationScoring, AdminScoring.

**Technical Implementations:**
- **Data Layer:** PostgreSQL database accessed via Drizzle ORM. Key tables include `verified_facts`, `facts_evaluation`, `sources`, `source_identity_metrics`, `tld_scores`, `requested_facts`, and `historical_events`.
- **Backend:** Express server handles API requests for facts, evaluations, sources, and scoring settings.
- **Multi-Source Verification API:** Aggregates credible evaluations and determines consensus.
- **Fact Promotion System:** Automates promotion of high-trust evaluations to `verified_facts`. Uses batch operations (batch insert for new facts, SQL CASE-based batch update for existing facts) to efficiently promote/update 1000+ facts in ~2 seconds. Updates all metadata fields (value, last_verified_at, source_url, value_type, attribute_class) ensuring fresher evaluations completely replace stale citation data.
- **Evaluation Scoring:** Centralized logic for calculating scores based on source trust, recency, and consensus.
- **Admin Configuration System:** Manages scoring methodology.
- **Cross-Check Sources & Fulfill Requested Facts Systems:** Tools for identifying and fetching missing data, and processing user-requested facts with year-specific granularity.
- **Time-Series Data Pipeline:** Automated fetching of historical population and GDP data from Wikidata (1960-2025).
- **Pull New Facts System:** Admin tool to fetch specific data on demand from World Bank and Wikidata APIs.
- **Historical Events Pipeline:** Admin tool (`/api/admin/pull-historical-events`) to fetch historical events from Wikidata SPARQL API using `server/integrations/wikidata-events.ts`. **Dual-insertion mechanism** ensures data consistency: when any historical event is inserted into `historical_events` table, the system automatically creates a corresponding `facts_evaluation` entry enabling these historical dates to flow through the existing fact promotion pipeline. **Event type mappings:** founding→founded_year, independence→independence_year, revolution→revolution_year, liberation→liberation_year, unification→unification_year, war→war_year, other→significant_event_year. Deduplication prevents duplicate events using `(entity, event_year, title)` and duplicate fact evaluations using `(entity, attribute, source_name)`. This architecture keeps historical events timeline and numeric fact-checking systems perfectly synchronized through shared Wikidata source data.
- **Historical Facts Backfill System:** Admin tool (`/api/admin/backfill-historical-facts`) syncs all existing historical_events to facts_evaluation table for events inserted before the dual-insertion mechanism was expanded. Processes all event types, creates missing facts_evaluation entries using event_type→attribute mappings, and reports processed/created/skipped stats. UI integrated in AdminScoring page. Critical for data migrations when schema changes require re-syncing historical_events to facts_evaluation.
- **Source Management System:** UI for managing data sources (add, promote, reject) with activity logging and auto-creation of identity metrics.
- **Source Identity Metrics System:** Tracks `url_repute`, `certificate`, and `ownership` for each source, calculating an `identity_score`. Includes auto-sync with `sources.identity_score`.
- **Certificate Validation System:** Automated SSL/TLS certificate checking for sources.
- **WHOIS Ownership Validation System:** Automated domain ownership verification using `whoiser` for `source_identity_metrics`.
- **TLD Configuration System:** Admin-configurable TLD reputation scoring in `tld_scores` table, auto-populating `url_repute`.
- **Facts Count Synchronization:** Automatic `facts_count` tracking in the `sources` table.
- **Facts Activity Logging:** Audit trail for fact lifecycle events.
- **Data Coverage System:** UI page displaying source capabilities matrix, aggregating attributes from trusted sources.
- **Core Logic (`lib/factChecker.ts`):** Handles entity detection, numeric claim extraction (supports k/m/b/t notation with **±50 char context window** for keyword detection), attribute inference, multi-source claim verification with trust-weighted consensus, and requested facts tracking with year-specific granularity. **Historical event year filtering:** Years appearing with historical event keywords (revolution, liberation, unification, war events) are treated as claims to verify, NOT filtered as temporal context. This ensures claims like "France was liberated in 1944" verify the year 1944 against liberation_year attribute. Distinguishes temporal context from historical event claims. **Assay Integration:** Exports `tryAssayVerification()` function that provides optional structured verification using pre-defined assays before falling back to keyword-based verification.
- **Assay-Based Verification System:** Deterministic, reproducible fact-checking with complete audit trails. **Architecture:** Assay definitions stored as JSON files in `server/assays/` directory, each specifying metadata, inputs, fetch plans (REST/SPARQL), parsers (JSONPath/regex), expected signals, and validation hooks. **Assay Executor (`server/assay-executor.ts`):** Loads assay definitions, executes multi-source fetch plans, applies parsers, validates signals, determines consensus, and stores complete provenance. **Provenance Tracking (`assay_provenance` table):** Stores every verification attempt with assay_id, claim, raw_responses, parsed_values, consensus_result, timestamp, and hash for full audit trail. **API Integration:** `/api/verify-with-assay` endpoint accepts entity/attribute/value/year and returns verification result with provenance_id. `/api/assay-provenance` endpoints query verification history (supports filtering by entity via `?entity=` query param). **UI Integration:** processTextMultiSource in factChecker.ts now calls assay API first before falling back to keyword matching; provenance_id tracked through VerifiedClaim and VerificationResult interfaces for future audit trail links. **AssayProvenance Page:** Dedicated UI at `/assay-provenance` for viewing verification audit trails, supporting search by provenance ID or entity name, displaying raw API responses, parsed values, and consensus results with defensive rendering for optional fields. **Current Assays:** population-check-v1.json, gdp-check-v1.json, founding-year-check.json with Wikidata SPARQL and World Bank REST API fetch plans. **Design Philosophy:** Assays complement keyword matching - assays provide structured, deterministic verification while keywords serve as fallback for broader coverage.
- **Configuration Files:** `public/attribute-mapping.json` (keyword to attribute - **must be synced between public/ and client/public/ directories**), `public/tolerance-config.json` (attribute-specific tolerances, e.g., founded_year: 0.1%, population/gdp: 10%), `public/entity-mapping.json` (country aliases). **Historical event attribute mappings:** revolution/revolutionary/revolt/uprising→revolution_year, liberated/liberation/freed→liberation_year, unification/unified/reunification→unification_year, world war/wwii/ww2/ww1/vietnam war/korean war/gulf war→war_year. **Design decision:** Uses specific multi-word war phrases (e.g., "world war") instead of generic single-word keywords (e.g., "war") to avoid misclassifying non-year numbers like casualty counts or war costs as war_year.
- **Temporal Tracking:** Distinguishes `evaluated_at` and `as_of_date`, using `attribute_class` (`historical_constant`, `time_series`, `static`) for filtering.
- **Year-Based Filtering:** For `time_series` attributes, extracts year from context and filters evaluations to ±1 year tolerance.

## External Dependencies
- **PostgreSQL (Neon):** Primary database.
- **Drizzle ORM:** Database interaction.
- **Wikipedia API:** For baseline country facts.
- **World Bank API:** Provides population, GDP, and other economic data.
- **Wikidata SPARQL API:** For structured knowledge and historical events.
- **IMF API (IFS):** Provides economic statistics (integration code complete, awaiting environment access).
- **whoiser:** NPM package for WHOIS domain lookups and ownership verification.