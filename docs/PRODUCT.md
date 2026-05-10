# Yelli

## App Identity
Name:           Yelli
Tagline:        Instant video intercom for offices, hospitals, and government departments
Industry:       Communication / Unified Communications
Primary users:  Office staff, hospital personnel, LGU employees, corporate teams — anyone who needs instant department-to-department video communication

## Problem Statement
Existing video conferencing tools (Zoom, Google Meet) are built for scheduled meetings, not instant department-to-department communication. They require accounts, scheduling, and don't provide a persistent intercom-style interface showing real-time availability across departments. Organizations like hospitals, LGUs, and corporate offices need a speed-dial video intercom that works like a physical intercom panel — tap a department, see if they're online, and connect instantly — without forcing every user through account creation or meeting scheduling flows.

## Core User Flows

1. **Instant intercom call (1:1):** Staff member opens Yelli → sees speed dial board with department buttons showing online (green) / offline (gray) status → taps an online department → recipient device rings with incoming call notification → recipient accepts → live video/audio call begins → either party hangs up → call logged automatically. Error: if recipient doesn't answer within 30 seconds, call times out and caller is notified "No answer — try again or leave a message." Edge: if the department's assigned device is offline, button shows gray and tap shows "Department offline."

2. **Create and join a meeting:** Host clicks "New Meeting" → enters meeting title, selects date/time (or "Start now") → system generates a shareable link → host shares link via copy/paste or in-app → participants (including guests with no account) open link → enter display name → join meeting room → host can mute/unmute participants, share screen, enable whiteboard, share files → host or moderator can promote participants to moderator → host ends meeting → call log and chat history saved. Error: if meeting link is invalid or expired, guest sees "This meeting has ended or doesn't exist." Edge: if host loses connection, moderator (if promoted) keeps the meeting alive; if no moderator, participants see "Host disconnected — waiting 60 seconds before ending."

3. **Admin sets up organization:** Tenant Admin logs in → navigates to Department Management → creates departments (e.g., "ER Nurse Station", "Radiology", "Mayor's Office", "HR Department") → assigns devices or users to each department → sets department display name and optional description → departments appear on the speed dial board for all org users. Error: duplicate department name within same org blocked with "Department name already exists." Edge: deleting a department with active calls shows warning "This department has an active call — end the call first."

4. **SaaS billing and plan management:** Tenant Admin navigates to Billing → views current plan (Free / Pro / Enterprise) → sees usage summary (minutes used, recordings stored, participants count) → can upgrade plan → Xendit payment flow for card/e-wallet → plan activated immediately → usage limits updated. Error: payment fails → "Payment could not be processed — please try another method." Edge: usage exceeds free tier mid-call → call continues but recording stops and notification shown "Free tier limit reached — upgrade to continue recording."

5. **Super Admin manages platform:** Super Admin logs into admin panel → sees platform-wide dashboard (total tenants, active calls, revenue, usage trends) → can view/edit/suspend any tenant → manages platform settings (free tier limits, pricing, TURN server config) → exports revenue and usage reports. Error: suspending a tenant with active calls shows confirmation "This tenant has X active calls — suspending will end them. Continue?"

## Modules + Features

### Speed Dial Board (Intercom)
- Department grid: large tappable buttons per department with real-time online/offline presence indicator (green = online, gray = offline)
- Instant call initiation: tap online department → rings recipient device → video call starts on accept
- Device binding: departments can be bound to specific devices (e.g., a wall-mounted tablet in the nurse station)
- Presence engine: real-time status updates via WebSocket — shows online/offline/in-call states
- Customizable layout: admin can reorder departments, group by floor/wing/section
- Auto-answer mode: admin can enable auto-answer per department — when active, incoming calls connect instantly without requiring the recipient to accept. Camera turns on automatically. Indicated by a blue ⚡ badge on the speed dial button. Useful for always-on stations (e.g., nurse stations, reception desks, security monitors)
- Adaptive button sizing: when fewer departments exist, speed dial buttons scale larger to fill available screen space; grid compresses as departments are added

### Video Calling
- 1:1 intercom calls: low-latency direct video/audio via LiveKit SFU
- Multi-participant meetings: up to 50 participants via LiveKit rooms (hardware-dependent)
- Screen sharing: any participant can share their screen or specific application window
- Call controls: mute/unmute audio, enable/disable video, switch camera, speaker selection
- Adaptive quality: LiveKit simulcast — auto-adjusts video quality based on bandwidth
- Call ringing: incoming call notification with ringtone, accept/reject buttons
- Reconnection handling: automatic reconnection on temporary network drop (up to 30 seconds)

### In-Call Chat
- Persistent chat: messages saved to database and accessible after call ends
- Real-time messaging: instant delivery via WebSocket during active call
- Chat sidebar: collapsible panel within the call UI
- Message history: viewable in call logs after the call ends

### File Sharing
- In-call file drop: drag-and-drop or click-to-upload files during a call
- Screenshot paste: paste clipboard screenshots directly into chat
- File preview: inline preview for images, PDF thumbnail for documents
- Storage gating (SaaS): free plan — files available during call only, not persisted after call ends; paid plans — files saved and downloadable from call history
- Storage gating (Self-Hosted): configurable in settings — admin chooses whether to persist shared files

### Whiteboard
- Collaborative doodling: real-time shared canvas during calls
- Drawing tools: pen, shapes, text, eraser, color picker
- Multi-user: all participants can draw simultaneously with cursor indicators
- Persistence gating (SaaS): free plan — whiteboard not saved after call; paid plans — whiteboard snapshots saved to call history
- Persistence gating (Self-Hosted): configurable in settings

### Recording
- Call recording (Self-Hosted): one-click recording start/stop by host or moderator, saved to local file storage (MinIO/S3)
- Call recording (SaaS): available on paid plans only — recorded via LiveKit Egress, stored in platform S3/R2
- Recording library: browse, play, download recordings from past calls
- Recording consent: visual indicator shown to all participants when recording is active

### Meeting Management
- Create meeting: title, optional description, date/time or "Start now"
- Shareable links: unique meeting URL — no account required for guests
- Guest access: enter display name → join immediately, no registration
- Meeting lobby: optional waiting room — host admits participants one by one
- Host controls: mute all, remove participant, promote to moderator, lock meeting, end meeting for all
- Moderator role: host can promote any participant — moderator gets mute/remove powers but cannot end the meeting

### Department & Station Management
- CRUD departments: create, rename, delete departments with display name and description
- Device binding: assign a specific device/browser to a department station
- Grouping: organize departments by floor, wing, section, or custom category
- Bulk import: CSV upload for initial department setup

### User Management
- User CRUD: invite users via email, assign roles, deactivate accounts
- Role assignment: Tenant Admin, Host, Participant roles per organization
- User directory: searchable list of all org members with role and status

### Tenant Admin Dashboard
- Usage analytics: total calls, total minutes, active users, calls by department (chart)
- Call logs: searchable/filterable table — caller, recipient, duration, type (intercom/meeting), timestamp
- Recording access: browse and manage recordings (if enabled)
- Chat history: view persistent chat logs from past calls
- Export: download call logs and usage reports as CSV or PDF

### Billing & Subscription (SaaS only)
- Plan display: current plan tier, usage vs limits, renewal date
- Plan tiers:
  - **Starter (Free):** 10 users, 5 departments, 45-min group calls, 8 participants/call, no recording, no file/whiteboard persistence, 30-day chat history, 2 auto-answer stations, basic analytics, 1 admin
  - **Pro (₱2,999/mo or ₱29,990/yr):** 50 users, 25 departments, 4-hour group calls, 25 participants/call, 20hrs recording/month, file + whiteboard persistence, 1-year chat history, 10 auto-answer stations, full analytics + export, 3 admins, email support (48hr)
  - **Enterprise (₱8,499/mo or ₱84,990/yr):** Unlimited users/departments, unlimited group calls, 50 participants/call, 100hrs recording/month, full persistence, unlimited chat history, unlimited auto-answer, full analytics + export, unlimited admins, white-label branding, priority support (4hr)
- Usage add-ons (Pro/Enterprise): extra recording (₱299/10hrs), extra participants (₱499/mo per +10), extra departments (₱199/mo per +5)
- Upgrade/downgrade: self-service plan changes via Xendit payment
- Billing cycles: monthly or annual (annual = ~2 months free: Pro ₱2,499/mo effective, Enterprise ₱7,083/mo effective)
- Payment methods: credit/debit card, GCash, Maya, GrabPay, BPI/BDO online banking via Xendit
- Invoice history: downloadable invoices for each billing period
- Failed payment handling: 3-day grace → past_due status → 7-day grace → auto-downgrade to Starter (no data deleted, features gated)
- Usage alerts: in-app notification when approaching plan limits (80% and 100%); 5-minute warning before group call duration cap

### Super Admin Panel (SaaS only)
- Platform dashboard: total tenants, total active calls right now, total revenue, growth trends (charts)
- Tenant management: list all tenants, view details, edit plan, suspend/reactivate
- Revenue reports: revenue by period, by plan tier, by payment method — exportable CSV/PDF
- Platform settings: configure free tier limits, pricing per minute, recording storage quotas, TURN server settings
- System health: LiveKit server status, database status, storage usage

### Reports & Export
- Report types: usage summary, call detail records, revenue summary (Super Admin), department activity
- Date range filter: custom date range, presets (today, this week, this month, last 30/60/90 days)
- Export formats: CSV and PDF
- Scheduled reports: none in v1 (out of scope)

## Roles + Permissions

| Role | Scope | Can do | Cannot do |
|------|-------|--------|-----------|
| Super Admin | Platform-wide (SaaS only) | Manage all tenants, view platform analytics, configure pricing and limits, suspend tenants, export revenue reports, access system health | Cannot join tenant calls or view call content/recordings — privacy boundary |
| Tenant Admin | Organization-scoped | Create/manage departments, manage users, view org analytics, manage billing (SaaS), configure org settings (recording, file persistence), export org reports, host and join calls | Cannot access other tenants' data, cannot modify platform-wide settings, cannot access Super Admin panel |
| Host | Organization-scoped | Create meetings, generate shareable links, start/stop recording (if plan allows), mute/remove participants, promote to moderator, share screen, use whiteboard, end meeting | Cannot manage departments or users, cannot access billing, cannot access admin dashboard |
| Moderator | Per-meeting (promoted by Host) | Mute/unmute participants, remove participants, share screen, use whiteboard | Cannot end meeting, cannot start/stop recording, cannot promote other moderators, role expires when meeting ends |
| Participant | Organization-scoped | Join meetings, make intercom calls, send chat messages, share files, use whiteboard, share screen | Cannot create meetings, cannot mute/remove others, cannot start recording, cannot access admin features |
| Guest | Per-meeting (no account) | Join a meeting via shared link, send chat messages, share screen, use whiteboard | Cannot make intercom calls (no org membership), cannot access any other pages, cannot start recording, no persistent identity across sessions |

## Data Entities

**Organization (Tenant):** id, name, slug, plan_tier (free/pro/enterprise), subscription_status, billing_email, created_at, updated_at, suspended_at (nullable)

**User:** id, organization_id (FK), email, password_hash, display_name, role (tenant_admin/host/participant), avatar_url (nullable), status (active/inactive), last_seen_at, created_at, updated_at

**Department:** id, organization_id (FK), name, description (nullable), group_label (nullable — floor/wing/section), sort_order, device_binding_token (nullable), auto_answer_enabled (boolean, default false — when true, incoming calls connect instantly without recipient acceptance), is_online (derived from presence), created_at, updated_at

**Meeting:** id, organization_id (FK), host_user_id (FK), title, description (nullable), scheduled_at (nullable — null means instant), started_at (nullable), ended_at (nullable), meeting_link_token (unique), status (scheduled/active/ended/cancelled), recording_enabled (boolean), livekit_room_name, created_at

**CallLog:** id, organization_id (FK), meeting_id (FK, nullable — null for intercom calls), caller_user_id (FK, nullable), caller_department_id (FK, nullable), recipient_department_id (FK, nullable), call_type (intercom/meeting), started_at, ended_at (nullable), duration_seconds (computed), participant_count, status (completed/missed/failed), created_at

**Participant:** id, meeting_id (FK), user_id (FK, nullable — null for guests), guest_display_name (nullable), role_in_meeting (host/moderator/participant/guest), joined_at, left_at (nullable)

**ChatMessage:** id, meeting_id (FK), sender_user_id (FK, nullable), sender_guest_name (nullable), content (text), message_type (text/file/system), file_url (nullable), created_at

**Recording:** id, organization_id (FK), meeting_id (FK), call_log_id (FK), file_path, file_size_bytes, duration_seconds, storage_type (local/s3), status (processing/ready/failed/deleted), recorded_by_user_id (FK), created_at, deleted_at (nullable)

**SharedFile:** id, meeting_id (FK), uploaded_by_user_id (FK, nullable), uploaded_by_guest_name (nullable), file_name, file_path, file_size_bytes, mime_type, is_persisted (boolean — false for free SaaS, configurable for self-hosted), created_at, expires_at (nullable)

**WhiteboardSnapshot:** id, meeting_id (FK), snapshot_data (JSON — canvas state), is_persisted (boolean), created_at

**Subscription (SaaS only):** id, organization_id (FK), plan_tier, xendit_subscription_id, payment_method, status (active/past_due/cancelled), current_period_start, current_period_end, minutes_used_this_period, created_at, updated_at

**Invoice (SaaS only):** id, organization_id (FK), subscription_id (FK), xendit_invoice_id, amount_cents, currency (PHP), status (paid/pending/failed/refunded), issued_at, paid_at (nullable), pdf_url (nullable)

**PlatformSettings (SaaS only — singleton):** id, free_tier_group_call_limit_minutes, free_tier_max_participants, pro_tier_price_cents, enterprise_tier_price_cents, recording_storage_quota_gb, created_at, updated_at

## Integrations
- **LiveKit (self-hosted):** SFU media server — handles video/audio routing, simulcast, screen sharing, recording (Egress). Apache 2.0 — OSS
- **Coturn (self-hosted):** TURN/STUN server — NAT traversal for WebRTC when direct connections fail. OSS
- **Xendit:** Payment gateway for SaaS billing — credit/debit card, GCash, Maya, bank transfer. Paid API
- **SMTP (mail.powerbyteitsolutions.com):** Transactional email — meeting invitations, password resets, usage alerts, invoice receipts. Self-hosted

## Deployment Config
Environments: dev / staging / prod
Hosting:      VPS (single server for now — multi-server planned for future)
Dev mode:     MODE A — WSL2 native (only supported mode — pre-locked)
Docker Hub:   enabled — hub_repo: bonitobonita24/yelli

## Mobile Needs

**Native mobile app:** None — web only
**Auth mode:** N/A

**Per-page mobile strategy (auto-classified, reviewed by user):**

| # | Page | Strategy | Notes |
|---|------|----------|-------|
| 1 | Login / Register | Mobile First | Public entry point — must work on phone |
| 2 | Join Meeting (guest link) | Mobile First | Guests join from any device, often phone |
| 3 | Speed Dial Board (intercom) | Mobile First | Core feature — staff calls from phone or wall tablet |
| 4 | Video Call (1:1 intercom) | Mobile First | Real-time call UI — must work on phone |
| 5 | Meeting Room (multi-participant) | Mobile First | Participants may join from phone |
| 6 | In-Call Chat Sidebar | Mobile First | Chat during call, often on phone |
| 7 | In-Call File Sharing | Mobile First | Share files during call from any device |
| 8 | In-Call Whiteboard | Mobile First | Touch-draw works on phones and tablets |
| 9 | Meeting Scheduler / Create | Mobile First | Host may create meetings on the go |
| 10 | Department / Station Management | Mobile First | Admin may manage from phone |
| 11 | User Management | Mobile First | Admin may manage from phone |
| 12 | Tenant Admin Dashboard | Mobile First | Admin needs quick stats on mobile |
| 13 | Tenant Admin Settings | Mobile First | Configuration accessible anywhere |
| 14 | Tenant Billing & Subscription | Mobile First | Payment and upgrades from phone |
| 15 | Super Admin Dashboard | Mobile First | Platform monitoring on the go |
| 16 | Super Admin Tenant Management | Mobile First | Tenant management anywhere |
| 17 | Super Admin Billing / Revenue | Mobile First | Revenue check on mobile |
| 18 | Super Admin Platform Settings | Mobile First | Emergency config from phone |
| 19 | Call History / Logs | Mobile First | Quick log lookup on mobile |
| 20 | Recordings Library | Mobile First | Play recordings on phone |
| 21 | Reports & Export | Mobile First | View charts + trigger export on mobile |

**Phase 4 implementation guidance (for Claude Code):**
- **ALL pages are Mobile First.** Design mobile layout first (375px baseline), progressively enhance for tablet (768px) and desktop (1024px+).
- Touch targets ≥44×44px minimum on all interactive elements.
- Single-column layouts at base. Multi-column grids activate at `md:` (768px) and above.
- Tables use card-list pattern on mobile (each row becomes a stacked card), switch to horizontal table at `md:` breakpoint.
- Sidebars become bottom sheet or drawer on mobile — never visible as permanent sidebar below `lg:` (1024px).
- Speed dial buttons fill available viewport width/height on mobile — single column of large round buttons, scrollable.
- Video call controls use bottom-anchored toolbar on mobile with large touch targets (≥48×48px).
- Chat sidebar becomes full-screen overlay on mobile with back-button to return to call.
- Admin dashboards use vertically stacked stat cards (1 column) on mobile, 2 columns at `sm:`, 4 columns at `lg:`.
- File dropzone supports tap-to-upload on mobile (no drag-and-drop required).
- All shadcn/ui components used — the Mobile First approach only changes breakpoint priority, NEVER the component library.
- **Tailwind breakpoint convention:** `sm:` (640px), `md:` (768px), `lg:` (1024px), `xl:` (1280px). Base styles target 375px mobile. Enhancements layer with `sm:`, `md:`, `lg:`, `xl:` prefixes.

## Non-functional Requirements
Performance:    <200ms API response at 100 concurrent users; <150ms call setup latency (ring to connect)
Uptime:         99.5% SLA for SaaS prod environment
Data retention: Call logs kept indefinitely; recordings kept per plan (free: N/A, pro: 90 days, enterprise: 1 year); self-hosted: admin configurable
Compliance:     Standard data privacy practices — no HIPAA/GDPR-specific compliance in v1 (out of scope); TLS encryption on all connections; DTLS/SRTP for media streams
Accessibility:  WCAG AA — required for government/hospital environments

## Tenancy Model
Multi-tenant for SaaS; single-tenant for self-hosted deployments
Subdomain routing: [org-slug].yelli.powerbyte.app (SaaS) | single domain for self-hosted
Shared global data: platform settings, plan tier definitions, Super Admin accounts
DB isolation exception: none — all tenants share database with organization_id scoping (L1-L6 security stack)

## User-Facing URLs
/                       Public landing page (SaaS) or login redirect (self-hosted)
/login                  Login page
/register               Registration page (SaaS only — self-hosted uses admin-created accounts)
/join/:token            Guest meeting join page (no auth required)
/app                    Main app — speed dial board (intercom)
/app/call/:id           Active video call view (1:1 intercom)
/app/meeting/:id        Active meeting room view (multi-participant)
/app/meetings           Meeting list — scheduled and past
/app/meetings/new       Create new meeting
/app/history            Call history / logs
/app/recordings         Recordings library
/app/chat/:meetingId    Chat history for a specific call
/admin                  Tenant Admin dashboard
/admin/departments      Department management
/admin/users            User management
/admin/settings         Organization settings
/admin/billing          Billing & subscription (SaaS only)
/admin/reports          Reports & export
/superadmin             Super Admin dashboard (SaaS only)
/superadmin/tenants     Tenant management
/superadmin/revenue     Revenue reports
/superadmin/settings    Platform settings

## Access Control
Public routes:    / (landing), /login, /register, /join/:token
Protected routes: /app/*, /admin/* (require login + org membership)
Admin-only:       /admin/* (require tenant_admin role)
Super Admin only: /superadmin/* (require super_admin role, SaaS deployment only)

## Data Sensitivity
PII stored:       Yes — email addresses, display names, IP addresses in call logs
Financial data:   Yes — Xendit subscription IDs, invoice amounts, payment status (no raw card numbers — Xendit handles PCI)
Health data:      No — Yelli is a communication tool only, does not store patient/medical records
Audit required:   User creation/deletion, role changes, department changes, recording start/stop, plan upgrades/downgrades, tenant suspension/reactivation, payment events
GDPR/compliance:  User data export on request (JSON); account deletion removes PII and anonymizes call logs; recording deletion is permanent (no soft-delete for media files)

## Security Requirements
Rate limiting:    public: 30/min | auth: 10/min | api: 120/min | upload: 20/min | call-initiation: 10/min
CORS origins:     dev: localhost:* | staging: https://yelli-staging.powerbyte.app | prod: https://yelli.powerbyte.app
Security layers:  L3 RBAC + L5 AuditLog + L6 Prisma guardrails always active
                  L1+L2+L4 dormant in single-tenant (self-hosted), activated for multi-tenant (SaaS) — no migration needed
WebRTC security:  DTLS-SRTP for all media streams; LiveKit access tokens (JWT) with room-scoped permissions; TURN server with credential rotation

## Environments Needed
dev / stage / prod

## Domain / Base URL Expectations
Dev:     http://localhost:[port assigned by Phase 3 — do not specify a number here]
Stage:   https://yelli-staging.powerbyte.app
Prod:    https://yelli.powerbyte.app

## Infrastructure Notes
All services run in Docker Compose — mono-server for dev/staging/prod (multi-server planned for future scaling).
Docker Hub publishing: enabled — hub_repo: bonitobonita24/yelli
LiveKit: self-hosted in Docker Compose — separate container with UDP port exposure for media; Egress service for recording
Coturn: self-hosted TURN/STUN server in Docker Compose — required for NAT traversal
Valkey: in-memory cache + BullMQ job queue — recording processing, report generation, usage calculation, billing cycle jobs
MinIO: local S3-compatible storage for dev — recordings, shared files, whiteboard snapshots; S3/R2 in production
SMTP: mail.powerbyteitsolutions.com — meeting invitations, password resets, usage alerts, invoice receipts
pgAdmin: included on all environments — credentials auto-generated by Phase 3
CREDENTIALS.md: generated by Phase 3 — master credentials list for all envs, strictly gitignored
Security: HTTP headers + rate limiter + DOMPurify sanitizer scaffolded by Phase 4 — always-on defaults
Spec stress-test: Phase 2.7 runs automatically before Phase 3 — catches PRODUCT.md gaps early
AWS path when ready: RDS, S3, ElastiCache, SES — update .env.{env} only, zero code changes

## Tech Stack Preferences
Frontend framework:        Next.js
API style:                 tRPC
ORM / DB layer:            Prisma
Auth provider:             Auth.js v5 (email/password, social, magic link, sessions in PostgreSQL)
Auth strategy:             authjs
Primary database:          PostgreSQL
Cache / queue:             Valkey + BullMQ
File storage:              MinIO (dev) / S3 or R2 (prod)
Media server (SFU):        LiveKit (self-hosted, Apache 2.0)
TURN/STUN server:          Coturn (self-hosted)
Signaling / realtime:      Socket.IO (presence, chat, call ringing, notifications)
UI component library:      shadcn/ui + Tailwind CSS (locked — no alternatives)
Chart library:             shadcn/ui Chart (Recharts)
Map library:               none
Complex UI components:     Kibo UI (file dropzone)
Icon set:                  lucide-react (shadcn/ui default — no other icon libraries)
Payment gateway:           Xendit

## Out of Scope
- No end-to-end encryption (E2EE) — standard TLS/DTLS encryption only for v1
- No native mobile app (iOS/Android) — web-only, responsive design
- No public API for third-party embedding or integration
- No AI features — no live transcription, meeting summaries, or AI noise cancellation
- No multi-language / internationalization (i18n) — English only
- No SSO/SAML enterprise login — email/password + social login only
- No breakout rooms — no splitting meetings into sub-groups
- No virtual backgrounds — no blur or custom background replacement
- No calendar integration — no Google Calendar or Outlook sync
- No scheduled/automated reports — manual export only in v1
- No phone dial-in (PSTN) — WebRTC browser-only
- No live streaming / broadcasting to external platforms
