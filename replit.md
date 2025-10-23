# Knowledge Agent - AI Fact Checker

## Overview
This project is an AI fact-checking application that verifies numeric claims in text against a trusted PostgreSQL database. It identifies numbers, infers their meaning, and displays inline verification badges (Verified, Mismatch, Unknown) with citations. The application aims to provide a reliable, data-driven solution for quickly validating information, reducing misinformation, and enhancing content credibility using a curated database of facts for 48 countries sourced from Wikipedia and the World Bank.

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
    - `verified_facts`: Immutable verified facts with `entity_type` column (default: "country") for future non-country entity support
    - `facts_evaluation`: Fact evaluations with scoring and `entity_type` classification
    - `sources`: Source reliability metrics and workflow tracking
    - `scoring_settings`: Global scoring configuration
    - `requested_facts`: User-requested entity-attribute combinations with `entity_type`
    - `source_activity_log`: Audit trail of source status changes
    - `facts_activity_log`: Comprehensive lifecycle tracking with `entity_type` for all fact events
- **Backend:** Express server handling API requests for facts, evaluations, sources, and scoring settings.
- **Multi-Source Verification API (`/api/multi-source-evaluations`):** Endpoint for aggregating credible evaluations and determining consensus.
- **Evaluation Scoring (`server/evaluation-scoring.ts`):** Centralized logic for calculating scores based on source trust, recency, and consensus.
- **Admin Configuration System (`/admin`):** Interface for managing scoring methodology (weights, recency, credible threshold).
- **Score Recalculation System:** Dynamic score synchronization via `POST /api/facts-evaluation/recalculate`.
- **Cross-Check Sources System (`/admin`):** Automated tool for identifying and fetching missing data from external sources, with deduplication.
- **Fulfill Requested Facts System (`/admin`):** Processes user-requested facts, fetches data from external sources, and updates the database.
- **Source Management System (`/sources` and `/sources/pipeline`):** UI-driven system for managing data sources, including adding, promoting, and rejecting.
- **Source Activity Logging (`/sources/activity-log`):** Automatic logging of source status changes.
- **Facts Activity Logging (`/facts/activity-log`):** Comprehensive audit trail for fact lifecycle events (requested, fulfilled, added) with fire-and-forget logging and batch inserts.
- **Core Logic (`lib/factChecker.ts`):** Handles entity detection, claim extraction, attribute inference, multi-source claim verification with trust-weighted consensus, and requested facts tracking.
- **Attribute Mapping:** Keyword-to-attribute mappings in `public/attribute-mapping.json`.
- **Entity Alias Mapping (`public/entity-mapping.json`):** Maps country aliases to canonical names.

## External Dependencies
- **PostgreSQL (Neon):** Primary database.
- **Drizzle ORM:** Database interaction.
- **Wikipedia API:** Used for baseline country facts and evaluations.
- **World Bank API:** Provides population, GDP, GDP per capita, area, and inflation data.
- **Wikidata SPARQL API:** Used to query structured knowledge for various attributes.