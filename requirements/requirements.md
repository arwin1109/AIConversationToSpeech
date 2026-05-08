# Requirements: User Auth & UI Redesign

## 1. Authentication System
- **Database**: PostgreSQL (Prism DB)
- **Session Store**: Redis
- **Credentials**:
    - Default Admin: `admin` / `admin$123`
- **Features**:
    - Login Page
    - Registration Page
    - JWT-based authentication with HttpOnly Cookies
    - Protected API routes

## 2. Multi-User Audio Caching
- **Isolation**: Each user must have their own audio cache folder.
- **Server Storage**: Files stored in `audiocache/{userId}/`.
- **Archiving**: "Clear Cache" moves files to `audiocache_archive/{userId}/` with timestamp prefixes.
- **Local Cache**: Fallback/synchronization between browser state and server storage.

## 3. UI/UX Redesign (Chat Interface)
- **Layout**: Split-screen layout.
- **Left Column**:
    - **Top**: Incident Preview (Textarea).
    - **Bottom**: Conversation Transcript (Chat bubble style, top-to-bottom flow).
- **Right Column**:
    - Audio Visualizer.
    - Generation Controls (Generate line-by-line).
    - Merged Download (Cloud icon).
    - Settings & Auth controls.
- **Theme**: Premium Dark/Glassmorphism aesthetic.
