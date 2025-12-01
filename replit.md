# Overview

GemRPG is an AI-powered text-based RPG game that generates dynamic fantasy adventures using Google's Gemini AI. The application provides both authenticated (unlimited) and anonymous (rate-limited) gameplay, featuring character creation, turn-based narrative progression, and rich fantasy storytelling.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend Architecture

**Framework**: React with TypeScript, using Vite as the build tool and development server.

**UI Components**: Built with Radix UI primitives and shadcn/ui component library, styled with Tailwind CSS. The design uses a dark fantasy theme with custom fonts (Cinzel, Inter, Merriweather) for different UI contexts.

**Routing**: Client-side routing implemented with Wouter, supporting pages for gameplay, login, terms, and privacy.

**State Management**: React Query (@tanstack/react-query) for server state management and API interactions. Local component state with React hooks for UI state.

**Key Design Patterns**:
- Component composition with separate screens for character creation and active gameplay
- Custom hooks for authentication state (`useAuth`) and responsive design (`useIsMobile`)
- Typewriter effect for narrative text display
- Dice rolling animation for turn transitions

## Backend Architecture

**Framework**: Express.js server with TypeScript, running on Node.js.

**API Design**: RESTful API endpoints under `/api` namespace for game state management and authentication.

**Authentication**: Replit Auth integration using OpenID Connect with Passport.js strategy. Sessions stored in PostgreSQL using connect-pg-simple. Supports both authenticated users (unlimited gameplay) and anonymous users (IP-based rate limiting).

**Database ORM**: Drizzle ORM for type-safe database operations with PostgreSQL.

**Rate Limiting**: IP-based rate limiting for anonymous users (3 games per day) to manage free tier usage. Authenticated users have unlimited access.

**Build Strategy**: Custom build script using esbuild for server bundling and Vite for client bundling. Selected dependencies are bundled with the server to reduce cold start times.

## Data Storage

**Database**: PostgreSQL (via Neon serverless driver with WebSocket support).

**Schema Design**:
- `sessions`: Required for Replit Auth session storage
- `users`: User profiles from OAuth authentication (email, name, profile image, premium status)
- `game_states`: Individual game sessions with player state, inventory, story progression, and metadata
- `ip_rate_limits`: Tracks daily game creation limits for anonymous users

**Data Access Pattern**: Storage abstraction layer (`IStorage` interface) with `DatabaseStorage` implementation, allowing for potential future storage backend changes.

## External Dependencies

**AI Services**:
- Google Gemini AI (`gemini-2.0-flash` model) for narrative generation and character name generation
- Imagen 3.0 for dynamic image generation (prepared but not fully implemented)
- API integration through environment variable `GEMINI_API_KEY`

**Authentication**:
- Replit OpenID Connect for user authentication
- Session management with PostgreSQL backing store
- Environment variables: `ISSUER_URL`, `REPL_ID`, `SESSION_SECRET`

**Database**:
- Neon serverless PostgreSQL
- WebSocket connections for serverless compatibility
- Environment variable: `DATABASE_URL`

**Payment Processing** (Prepared for future implementation):
- Stripe integration scaffolded in schema (`stripeCustomerId`, `isPremium`, `premiumExpiresAt`)
- Login page includes disabled Stripe payment button

**Development Tools**:
- Replit-specific Vite plugins for development experience (cartographer, dev banner, runtime error overlay)
- Custom meta images plugin for OpenGraph image handling

**Dependencies Architecture Decisions**:
- Server dependencies are selectively bundled (whitelist approach) to reduce filesystem syscalls and improve cold start performance
- Client uses standard Vite bundling with code splitting
- Shared schema definitions between client and server via `@shared` namespace