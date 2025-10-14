# Knowledge Agent - AI Fact Checker

## Overview
A client-side fact-checking demo application that verifies numeric claims in paragraphs against a trusted CSV dataset. The app identifies numbers in text, infers what they represent using keyword mapping, and displays inline verification badges (Verified/Mismatch/Unknown) with citations.

**Current State**: Fully functional MVP with all acceptance criteria passing
- ✅ Verified claims show green badges with source links
- ✅ Mismatched claims show red badges with source links  
- ✅ Unknown claims show gray badges
- ✅ Results table displays detailed verification data

## Project Architecture

### Frontend (React + Vite)
- **Single Page Application**: All processing happens client-side
- **Component Structure**:
  - `FactChecker` (main page): Orchestrates the fact-checking workflow
  - `EntitySelector`: Dropdown + custom entity input
  - `ParagraphInput`: Textarea for claim text
  - `VerificationBadge`: Color-coded badges (verified/mismatch/unknown)
  - `RenderedParagraph`: Displays text with inline verification badges
  - `ResultsTable`: Detailed results with citations
  - `ThemeToggle`: Dark/light mode support

### Data Layer
- **Facts Database**: `/public/facts.csv` - Truth table with entity facts
  - Columns: entity, attribute, value, value_type, as_of_date, source_url, source_trust, last_verified_at
  - Sample entities: Acme Inc, TechCorp, GlobalMart
  
- **Attribute Mapping**: `/public/attribute-mapping.json` - Keyword-to-attribute mappings
  - Maps words like "stores" → "store_count", "founded" → "founded_year"

### Core Logic (`lib/factChecker.ts`)
1. **Extract Numeric Claims**: Regex-based number extraction with surrounding context
2. **Guess Attributes**: Match keywords in context to attributes using mapping
3. **Verify Claims**: Exact match comparison against CSV data
4. **Generate Results**: Create badges and table data with citations

### Backend (Express)
- Minimal server setup serving static files from `/public`
- No backend API required - all processing is client-side

## Features

### Current Features
- ✅ Entity selection (dropdown or custom input)
- ✅ Numeric claim extraction from paragraphs
- ✅ Keyword-based attribute inference
- ✅ Exact match verification against CSV data
- ✅ Inline badge rendering with three states
- ✅ Citation links to source URLs
- ✅ Detailed results table
- ✅ Dark/light theme support
- ✅ Responsive design

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
1. "Acme has 123 stores" → ✅ Green Verified badge with source link
2. "Acme has 124 stores" → ✅ Red Mismatch badge with source link
3. "Acme has 77 employees" → ✅ Gray Unknown badge (no data)

### Data Format

**facts.csv**:
```csv
entity,attribute,value,value_type,as_of_date,source_url,source_trust,last_verified_at
Acme Inc,store_count,123,integer,2024-01-15,https://example.com/acme-stores,high,2024-10-01
```

**attribute-mapping.json**:
```json
{
  "stores": "store_count",
  "founded": "founded_year",
  "employees": "employee_count"
}
```

## Usage Instructions

1. **Select Entity**: Choose from dropdown or enter custom entity name
2. **Enter Paragraph**: Paste text containing numeric claims
3. **Check Facts**: Click "Check Facts" button to verify
4. **Review Results**: 
   - Inline badges show verification status
   - Table shows detailed comparison with citations
   - Click source links to view original data

### Example Usage
```
Entity: Acme Inc
Paragraph: "Acme Inc was founded in 1985 and now operates 123 stores."

Results:
- "1985" → Verified ✓ (founded_year)
- "123" → Verified ✓ (store_count)
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