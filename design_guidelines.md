# Design Guidelines: AI Chatbot Fact-Checker

## Design Approach: Utility-Focused Productivity Tool

**Selected Framework**: Clean, data-focused interface inspired by Linear and Notion
**Rationale**: Information-dense utility application requiring clarity, efficiency, and immediate comprehension of verification states

## Core Design Principles

1. **Clarity First**: Verification status must be instantly recognizable
2. **Trust Through Transparency**: Citations and data provenance prominently displayed
3. **Minimal Cognitive Load**: Clean interface that doesn't distract from the verification task
4. **State Visibility**: Clear visual feedback for all three verification states

## Color Palette

### Light Mode
- **Background**: 0 0% 100% (pure white)
- **Surface**: 0 0% 98% (subtle gray for cards/inputs)
- **Text Primary**: 220 13% 13% (near black)
- **Text Secondary**: 220 9% 46% (medium gray)
- **Verified**: 142 76% 36% (confident green)
- **Mismatch**: 0 84% 60% (alert red)
- **Unknown**: 220 9% 46% (neutral gray)
- **Border**: 220 13% 91% (subtle borders)

### Dark Mode
- **Background**: 222 47% 11% (deep blue-gray)
- **Surface**: 217 33% 17% (elevated surface)
- **Text Primary**: 210 40% 98% (near white)
- **Text Secondary**: 215 20% 65% (muted blue-gray)
- **Verified**: 142 71% 45% (vibrant green)
- **Mismatch**: 0 72% 51% (bright red)
- **Unknown**: 215 16% 47% (neutral blue-gray)
- **Border**: 217 33% 24% (subtle borders)

## Typography

**Font Stack**: 
- Primary: 'Inter', system-ui, sans-serif (Google Fonts)
- Monospace: 'JetBrains Mono', monospace (for numbers/data)

**Scale**:
- Page Title: text-2xl font-semibold (24px)
- Section Headers: text-lg font-medium (18px)
- Body Text: text-base (16px)
- Labels: text-sm font-medium (14px)
- Badge Text: text-xs font-semibold (12px)
- Table Data: text-sm (14px, monospace for numeric values)

## Layout System

**Spacing Primitives**: Use Tailwind units of 2, 4, 6, 8, 12, 16 (p-2, p-4, gap-6, mt-8, py-12, mb-16)

**Container Strategy**:
- Max width: max-w-6xl mx-auto
- Page padding: px-4 md:px-6 lg:px-8
- Section spacing: space-y-8 for main sections
- Component spacing: space-y-4 within sections

**Grid Structure**:
- Single column layout on mobile
- Two-column layout for entity selection (md:grid-cols-2)
- Full-width for paragraph input and results

## Component Library

### 1. Page Header
- App title with fact-checker icon
- Subtle subtitle explaining purpose
- Clean, minimal design with bottom border

### 2. Entity Selection Section
- **Dropdown**: Pre-populated entity selector with search capability
- **Manual Input**: Text field for custom entity names
- Side-by-side on desktop (grid-cols-2)
- Clear labels with helper text

### 3. Paragraph Input
- Large textarea (min-height: 200px)
- Placeholder text showing example paragraph
- Character count indicator
- Clear/reset button in top-right corner

### 4. Inline Badge System
**Badge Specifications**:
- **Verified**: Green background, white text, checkmark icon, clickable for citation
- **Mismatch**: Red background, white text, X icon, clickable for details
- **Unknown**: Gray background, white text, question icon, non-interactive
- Design: Rounded (rounded-full), small padding (px-2 py-1), inline with text
- Hover state: Slight scale (hover:scale-105) for interactive badges

### 5. Rendered Paragraph Display
- White/dark card with subtle border
- Original text with numbers wrapped in appropriate badges
- Smooth badge insertion without text reflow
- Superscript citation numbers for verified/mismatch claims

### 6. Results Table
**Table Design**:
- Striped rows for readability
- Fixed header on scroll
- Columns: Claim | Attribute | Verdict | Recorded Value | As of Date | Citation
- Verdict column uses badge styling
- Citation column shows clickable source links with external link icon
- Responsive: Stack on mobile, horizontal scroll on tablet

### 7. Citation Links
- Underlined on hover
- External link icon suffix
- Opens in new tab
- Truncated with ellipsis if too long (max-w-xs truncate)

### 8. Empty States
- Centered message when no entity selected
- Helpful icon and call-to-action text
- Subtle background to indicate inactive state

## Interaction Patterns

1. **Form Validation**: Real-time feedback on entity selection
2. **Auto-verification**: Trigger on paragraph input blur or explicit "Check Facts" button
3. **Badge Tooltips**: Hover shows full source information
4. **Table Sorting**: Click column headers to sort (optional but recommended)
5. **Reset Functionality**: Clear button returns to initial state

## Accessibility

- ARIA labels for all interactive elements
- Keyboard navigation for all functions
- High contrast for badge states (WCAG AAA)
- Focus indicators on all interactive elements (ring-2 ring-offset-2)
- Screen reader announcements for verification results

## Visual Hierarchy

1. **Primary Focus**: Paragraph input and rendered results
2. **Secondary**: Entity selection
3. **Tertiary**: Results table for detailed analysis
4. **Supporting**: Page header and instructions

## Responsive Breakpoints

- Mobile (default): Single column, stacked layout
- Tablet (md: 768px): Two-column entity selection, side-by-side badges
- Desktop (lg: 1024px): Optimized table view, full layout

## Animation Strategy

**Minimal, Purposeful Animations**:
- Badge appearance: Subtle fade-in (200ms)
- Table row hover: Background color transition (150ms)
- Button press: Scale down slightly (100ms)
- NO: Elaborate scroll effects, unnecessary transitions, or decorative animations

## Images

**No Hero Images Required**: This is a utility-focused application. Visual emphasis should be on the data, badges, and clarity of information presentation.