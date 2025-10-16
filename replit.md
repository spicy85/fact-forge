# Knowledge Agent - AI Fact Checker

## Overview
A fact-checking application that verifies numeric claims in paragraphs against a trusted PostgreSQL database. The app identifies numbers in text, infers what they represent using keyword mapping, and displays inline verification badges (Verified/Mismatch/Unknown) with citations.

**Current State**: Fully functional MVP with database backend
- ✅ Verified claims show green badges with source links
- ✅ Mismatched claims show red badges with source links  
- ✅ Unknown claims show gray badges
- ✅ Results table displays detailed verification data
- ✅ 48 countries with 192 facts from Wikipedia & World Bank APIs
- ✅ Automated data fetcher (3 API requests for all countries)
- ✅ PostgreSQL database for reliable fact storage
- ✅ Claims matrix page showing supported claims by country

## Project Architecture

### Frontend (React + Vite)
- **Multi-Page Application**: Three main pages with client-side processing
- **Pages**:
  - `FactChecker` (/) - Main fact-checking workflow
  - `ClaimsMatrix` (/claims-matrix) - Visual matrix of supported claims
  - `SourcesOverview` (/sources) - Data source monitoring and reliability tracking
- **Component Structure**:
  - `ParagraphInput`: Textarea for claim text
  - `VerificationBadge`: Color-coded badges (verified/mismatch/unknown)
  - `RenderedParagraph`: Displays text with inline verification badges
  - `ResultsTable`: Detailed results with citations
  - `ThemeToggle`: Dark/light mode support

### Data Layer
- **Facts Database**: PostgreSQL - Truth table with entity facts
  - Schema: `facts` table (shared/schema.ts)
  - Columns: id, entity, attribute, value, value_type, source_url, source_trust, last_verified_at
  - Current data: 48 countries with 192 facts (founding years, population, area, GDP)
  - Fetched from Wikipedia (Wikidata) and World Bank APIs
  - API endpoint: GET `/api/facts` (server/routes.ts)
  - Structure supports adding more countries and additional attributes (capital, language, etc.)

- **Sources Database**: PostgreSQL - Source reliability metrics
  - Schema: `sources` table (shared/schema.ts)
  - Columns: domain, public_trust, data_accuracy, proprietary_score (all integer 0-100)
  - Current data: Wikipedia (85/78/92), World Bank (88/94/75)
  - API endpoints:
    - GET `/api/sources` - Retrieve all source metrics
    - PUT `/api/sources/:domain` - Update source metrics (partial updates supported)
  - Overall Trust Level = Weighted average (equal weights): (public_trust + data_accuracy + proprietary_score) / 3
  - **Editable in UI**: All three metrics can be edited directly on the Sources Overview page with real-time trust recalculation
  
- **Attribute Mapping**: `/public/attribute-mapping.json` - Keyword-to-attribute mappings
  - Maps keywords like "founded", "independence" → "founded_year"
  - "population", "people" → "population"
  - "area", "square" → "area_km2"
  - Easily extensible for new attributes

### Core Logic (`lib/factChecker.ts`)
1. **Detect Entity**: Auto-detect country name from text using word boundaries
2. **Extract Numeric Claims**: Regex-based number extraction with surrounding context
3. **Guess Attributes**: Match keywords in context to attributes using mapping
4. **Verify Claims**: Exact match comparison against database data
5. **Generate Results**: Create badges and table data with citations

### Backend (Express + PostgreSQL)
- Express server with Vite integration
- PostgreSQL database (Neon) for facts storage
- API endpoint: GET `/api/facts` returns all facts as JSON
- Drizzle ORM for database operations
- Frontend fetches facts on page load, then processes locally

## Features

### Current Features
- ✅ Automatic entity detection from paragraph text
- ✅ Numeric claim extraction from paragraphs
- ✅ Keyword-based attribute inference
- ✅ Exact match verification against database data
- ✅ Inline badge rendering with three states
- ✅ Citation links to source URLs
- ✅ Detailed results table
- ✅ Claims matrix view (countries × claim types)
- ✅ Sources overview page with editable reliability metrics (public trust, data accuracy, proprietary score)
- ✅ Real-time overall trust calculation when editing source metrics
- ✅ Dark/light theme support
- ✅ Responsive design
- ✅ Keyboard shortcuts (Enter to verify, Shift+Enter for new line)

### Future Enhancements (Next Phase)
- Fuzzy matching with configurable tolerance
- Multi-entity verification in single paragraph
- Date and percentage claim support
- Claim history tracking
- Export functionality (JSON/CSV)

## Development Setup

### Running the Application
```bash
npm run dev
```
- Frontend + Backend served on port 5000
- Hot module replacement enabled
- Access at http://localhost:5000

### Key Files
```
client/
  src/
    pages/
      FactChecker.tsx              # Main fact-checking page (/)
      ClaimsMatrix.tsx             # Claims matrix view (/claims-matrix)
      SourcesOverview.tsx          # Sources monitoring page (/sources)
    components/
      VerificationBadge.tsx        # Verification status badges
      ParagraphInput.tsx           # Text input area
      RenderedParagraph.tsx        # Text with inline badges
      ResultsTable.tsx             # Verification results table
    lib/
      factChecker.ts               # Core verification logic
      theme-provider.tsx           # Dark/light mode
server/
  db.ts                            # Database client setup
  storage.ts                       # Storage interface + implementation
  routes.ts                        # API routes (GET /api/facts, /api/sources)
shared/
  schema.ts                        # Database schema (facts, sources tables)
public/
  attribute-mapping.json           # Keyword mappings
scripts/
  fetch-country-data.ts            # Data fetcher (writes to database)
  migrate-csv-to-db.ts             # One-time CSV migration script
```

### Testing
All acceptance criteria verified via end-to-end testing:
1. "Canada was founded in 1867" → ✅ Green Verified badge with Wikipedia source link
2. "Japan has an area of 377972 square kilometers" → ✅ Green Verified badge with Wikipedia source
3. "Germany has 500 million people" → ✅ Red Mismatch badge (actual population: different)

### Data Format

**Database Schema** (`shared/schema.ts`):
```typescript
// Facts table - stores verified claims
export const facts = pgTable("facts", {
  id: serial("id").primaryKey(),
  entity: text("entity").notNull(),              // Country name
  attribute: text("attribute").notNull(),        // founded_year, population, etc.
  value: text("value").notNull(),                // Numeric value as string
  value_type: text("value_type").notNull(),      // "integer", "decimal", etc.
  source_url: text("source_url").notNull(),      // Citation URL
  source_trust: text("source_trust").notNull(),  // "high", "medium", "low"
  last_verified_at: text("last_verified_at").notNull()  // Last verification date
});

// Sources table - stores reliability metrics
export const sources = pgTable("sources", {
  domain: text("domain").primaryKey(),           // Source domain (e.g., en.wikipedia.org)
  public_trust: integer("public_trust").notNull(),        // 0-100 scale
  data_accuracy: integer("data_accuracy").notNull(),      // 0-100 scale
  proprietary_score: integer("proprietary_score").notNull() // 0-100 scale
});
```

**API Response** (GET `/api/facts`):
```json
[
  {
    "id": 1,
    "entity": "United States",
    "attribute": "founded_year",
    "value": "1776",
    "value_type": "integer",
    "source_url": "https://en.wikipedia.org/wiki/United_States",
    "source_trust": "high",
    "last_verified_at": "2025-10-14"
  }
]
```

**API Response** (GET `/api/sources`):
```json
[
  {
    "domain": "en.wikipedia.org",
    "public_trust": 85,
    "data_accuracy": 78,
    "proprietary_score": 92
  },
  {
    "domain": "data.worldbank.org",
    "public_trust": 88,
    "data_accuracy": 94,
    "proprietary_score": 75
  }
]
```

**attribute-mapping.json**:
```json
{
  "founded": "founded_year",
  "independence": "founded_year",
  "established": "founded_year",
  "independent": "founded_year"
}
```

**Adding More Data**:

**Automatic (Recommended)**:
Run the data fetching script to systematically update facts from APIs:
```bash
npx tsx scripts/fetch-country-data.ts
```
This fetches data for 50 major countries using only 3 API requests total and saves directly to the database.

**Manual**:
To manually add countries or attributes:
1. Insert rows into the `facts` table via SQL or the storage interface
2. For new attributes, add relevant keywords to `attribute-mapping.json`
3. Example future attributes: capital, language, currency

See `scripts/README.md` for details on the data fetcher.

## Usage Instructions

1. **Enter Paragraph**: Paste text containing numeric claims about a country
   - The app will automatically detect which country is mentioned
   - Press Enter to submit verification
   - Press Shift+Enter to add a new line in the paragraph
2. **Check Facts**: Click "Check Facts" button or press Enter to verify
3. **View Detected Entity**: The detected country name appears next to the button
4. **Review Results**: 
   - Inline badges show verification status
   - Table shows detailed comparison with citations
   - Click source links to view original data

### Example Usage
```
Paragraph: "The United States declared independence in 1776 and became a nation."

Results:
- Detected entity: United States
- "1776" → Verified ✓ (founded_year)
```

```
Paragraph: "India gained independence in 1947 from British rule."

Results:
- Detected entity: India
- "1947" → Verified ✓ (founded_year)
```

```
Paragraph: "Paraguay was founded in 1811 and has a population of 6929153 people."

Results:
- Detected entity: Paraguay
- "1811" → Verified ✓ (founded_year)
- "6929153" → Verified ✓ (population)
```

## Technical Stack
- **Frontend**: React 18, TypeScript, Vite
- **Styling**: Tailwind CSS, shadcn/ui components
- **State Management**: React hooks (useState, useEffect)
- **Data Parsing**: Client-side CSV parsing
- **Backend**: Express (minimal, serves static files only)
- **Theme**: Custom dark/light mode with localStorage persistence

## Design Philosophy
- **Client-Side First**: No backend processing required
- **Exact Matching**: v0.0001 uses strict equality (no fuzzy logic)
- **Single Entity**: One entity verification per session
- **Transparent Citations**: All verifications show source URLs
- **Clean UI**: Focus on clarity and instant comprehension

## User Preferences
- Clean, data-focused interface design
- Monospace font for numeric values
- Clear visual distinction between verification states
- Tooltips for additional context
- Responsive layout for mobile/desktop