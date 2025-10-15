# Knowledge Agent - AI Fact Checker

## Overview
A client-side fact-checking demo application that verifies numeric claims in paragraphs against a trusted CSV dataset. The app identifies numbers in text, infers what they represent using keyword mapping, and displays inline verification badges (Verified/Mismatch/Unknown) with citations.

**Current State**: Fully functional MVP with systematic data fetching
- ✅ Verified claims show green badges with source links
- ✅ Mismatched claims show red badges with source links  
- ✅ Unknown claims show gray badges
- ✅ Results table displays detailed verification data
- ✅ 48 countries with 192 facts from Wikipedia & World Bank APIs
- ✅ Automated data fetcher (3 API requests for all countries)

## Project Architecture

### Frontend (React + Vite)
- **Single Page Application**: All processing happens client-side
- **Component Structure**:
  - `FactChecker` (main page): Orchestrates the fact-checking workflow
  - `ParagraphInput`: Textarea for claim text
  - `VerificationBadge`: Color-coded badges (verified/mismatch/unknown)
  - `RenderedParagraph`: Displays text with inline verification badges
  - `ResultsTable`: Detailed results with citations
  - `ThemeToggle`: Dark/light mode support

### Data Layer
- **Facts Database**: `/public/facts.csv` - Truth table with entity facts
  - Columns: entity, attribute, value, value_type, as_of_date, source_url, source_trust, last_verified_at
  - Current data: 48 countries with 192 facts (founding years, population, area, GDP)
  - Fetched from Wikipedia (Wikidata) and World Bank APIs
  - Structure supports adding more countries and additional attributes (capital, language, etc.)
  
- **Attribute Mapping**: `/public/attribute-mapping.json` - Keyword-to-attribute mappings
  - Maps keywords like "founded", "independence" → "founded_year"
  - "population", "people" → "population"
  - "area", "square" → "area_km2"
  - Easily extensible for new attributes

### Core Logic (`lib/factChecker.ts`)
1. **Detect Entity**: Auto-detect country name from text using word boundaries
2. **Extract Numeric Claims**: Regex-based number extraction with surrounding context
3. **Guess Attributes**: Match keywords in context to attributes using mapping
4. **Verify Claims**: Exact match comparison against CSV data
5. **Generate Results**: Create badges and table data with citations

### Backend (Express)
- Minimal server setup serving static files from `/public`
- No backend API required - all processing is client-side

## Features

### Current Features
- ✅ Automatic entity detection from paragraph text
- ✅ Numeric claim extraction from paragraphs
- ✅ Keyword-based attribute inference
- ✅ Exact match verification against CSV data
- ✅ Inline badge rendering with three states
- ✅ Citation links to source URLs
- ✅ Detailed results table
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
    pages/FactChecker.tsx          # Main application page
    components/
      VerificationBadge.tsx        # Verification status badges
      EntitySelector.tsx           # Entity selection UI
      ParagraphInput.tsx           # Text input area
      RenderedParagraph.tsx        # Text with inline badges
      ResultsTable.tsx             # Verification results table
    lib/
      factChecker.ts               # Core verification logic
      theme-provider.tsx           # Dark/light mode
public/
  facts.csv                        # Truth table dataset
  attribute-mapping.json           # Keyword mappings
```

### Testing
All acceptance criteria verified via end-to-end testing:
1. "Canada was founded in 1867" → ✅ Green Verified badge with Wikipedia source link
2. "Japan has an area of 377972 square kilometers" → ✅ Green Verified badge with Wikipedia source
3. "Germany has 500 million people" → ✅ Red Mismatch badge (actual population: different)

### Data Format

**facts.csv**:
```csv
entity,attribute,value,value_type,as_of_date,source_url,source_trust,last_verified_at
United States,founded_year,1776,integer,2024-01-01,https://en.wikipedia.org/wiki/...,high,2024-10-14
France,founded_year,1789,integer,2024-01-01,https://en.wikipedia.org/wiki/...,high,2024-10-14
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
node scripts/fetch-country-data.js
```
This fetches data for 50 major countries using only 3 API requests total.

**Manual**:
To manually add countries or attributes:
1. Add rows to `facts.csv` with same column structure
2. For new attributes, add relevant keywords to `attribute-mapping.json`
3. Example future attributes: gdp, capital, language, currency

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