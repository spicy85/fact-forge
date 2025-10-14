# Knowledge Agent - AI Fact Checker

## Overview

Knowledge Agent is an AI-powered fact-checking application that verifies numeric claims in text against a trusted dataset. Users paste paragraphs containing factual claims (e.g., "Acme Inc was founded in 1985 and has 123 stores"), select an entity, and receive instant verification with inline badges showing whether claims are verified, mismatched, or unknown. The application emphasizes clarity, transparency, and trust through clear visual feedback and citation links.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Framework**: React 18 with TypeScript, using Vite as the build tool and development server.

**UI Component Library**: shadcn/ui components built on Radix UI primitives, providing an accessible, customizable component system. The design follows a utility-focused approach inspired by Linear and Notion, prioritizing clarity and information density.

**Styling**: 
- Tailwind CSS for utility-first styling with a custom design system
- Custom CSS variables for theming (light/dark mode support)
- Inter font for primary text, JetBrains Mono for monospace data display
- Theme system with clearly defined color palettes for verification states (verified green, mismatch red, unknown gray)

**State Management**: 
- @tanstack/react-query for server state and data fetching
- React hooks (useState, useEffect) for local component state
- Custom context providers (ThemeProvider) for global UI state

**Routing**: Wouter for lightweight client-side routing

**Key Features**:
- Entity selection (dropdown with custom input option)
- Paragraph input with character counter
- Real-time fact verification display with inline badges
- Tabular results view with citations
- Dark/light theme toggle
- Responsive tooltip system for detailed verification information

### Backend Architecture

**Runtime**: Node.js with Express.js framework

**API Design**: RESTful API architecture with `/api` prefix for all application routes

**Static File Serving**: 
- Public directory serves static assets (attribute-mapping.json, facts.csv)
- Vite development middleware in development mode
- Pre-built static assets in production

**Development Features**:
- Hot Module Replacement (HMR) via Vite in development
- Request logging middleware with duration tracking
- Error handling middleware for consistent error responses

**Data Processing**:
- Client-side CSV parsing for facts database
- Attribute mapping system for flexible claim interpretation
- Numeric claim extraction using regex patterns
- Context-aware verification matching

### Data Storage Solutions

**Current Implementation**: In-memory storage using Map data structures (MemStorage class)

**Schema Design**: 
- User table with id, username, password fields
- Prepared for PostgreSQL migration via Drizzle ORM
- Database configuration ready with Neon serverless PostgreSQL support

**Fact Data Storage**:
- CSV-based fact database (facts.csv) containing:
  - Entity name
  - Attribute (store_count, founded_year, employee_count, revenue)
  - Value and value type
  - As-of date for temporal accuracy
  - Source URL for citation
  - Source trust level
  - Last verified timestamp
- JSON-based attribute mapping for synonym resolution

**Design Decision**: Started with in-memory storage for rapid prototyping and simple fact-checking use case. The architecture supports migration to PostgreSQL for persistent user data and expanded fact databases as the application scales.

### Authentication and Authorization

**Current State**: Basic user schema defined but authentication not yet implemented

**Prepared Infrastructure**:
- Drizzle ORM schema with users table
- Password field in schema (intended for hashed passwords)
- Session middleware configuration in dependencies (connect-pg-simple)

**Future Implementation Path**: The schema and dependencies indicate plans for session-based authentication with PostgreSQL session storage.

### External Dependencies

**Core UI Libraries**:
- Radix UI primitives (@radix-ui/*) - Accessible, unstyled component primitives
- class-variance-authority - Type-safe variant system for components
- tailwindcss - Utility-first CSS framework
- lucide-react - Icon library

**Data & State Management**:
- @tanstack/react-query - Server state management and caching
- react-hook-form with @hookform/resolvers - Form handling and validation
- zod - Schema validation
- drizzle-zod - Zod schema generation from Drizzle models

**Database & ORM**:
- drizzle-orm - Type-safe SQL ORM
- @neondatabase/serverless - Neon PostgreSQL serverless driver
- drizzle-kit - Database migration and schema management tool

**Development Tools**:
- @replit/vite-plugin-* - Replit-specific development enhancements
- tsx - TypeScript execution for Node.js
- esbuild - JavaScript bundler for production builds

**Routing & Navigation**:
- wouter - Minimalist routing library
- react-day-picker - Date selection component
- date-fns - Date utility library

**Carousel & UI Utilities**:
- embla-carousel-react - Touch-friendly carousel component
- cmdk - Command menu component
- vaul - Drawer component library
- input-otp - OTP input component

**Design Rationale**: The application prioritizes developer experience and performance with modern tooling (Vite, esbuild, Drizzle) while maintaining a lean dependency footprint. The component library strategy (shadcn/ui on Radix) allows for complete UI customization while ensuring accessibility compliance.