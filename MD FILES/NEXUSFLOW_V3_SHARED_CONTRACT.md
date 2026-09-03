# NEXUSFLOW 3.0 SHARED CONTRACT
## Contract between Agent 1 (User/Team/Real-Time Domain) and Agent 2 (Project Intelligence Domain)

---

## 1. AUTH CONTRACT

### Authentication Methods
- **Local**: Email/password via `POST /api/auth/login` and `POST /api/auth/signup`
- **Google OAuth**: `GET /api/auth/google` redirects to Google, callback at `GET /api/auth/google/callback`
- **Forgot Password**: `POST /api/auth/forgot-password` → `POST /api/auth/reset-password`

### JWT Token
- Header: `Authorization: Bearer <token>`
- Payload: `{ id, email, name }`
- Expiry: 7 days
- Secret: `JWT_SECRET` environment variable
- Client storage: `nf_jwt` via `expo-secure-store` (native) or `localStorage` (web)

### Session Restoration
- On app launch, client calls `GET /api/me` with stored token
- If invalid/expired, token is cleared and user is redirected to login

### User Identity Resolution
- Server MUST resolve identity from authenticated JWT/session
- `resolveAuthUser(req.user)` helper returns `{ _id, name, email, avatar }` or null
- Never trust `userId`, `teamId`, or `role` from frontend

---

## 2. USER IDENTITY CONTRACT

### User Model
```javascript
{
  _id: ObjectId,
  name: String (required),
  email: String (required, unique, indexed),
  password: String (hashed, select: false),
  avatar: String (base64 or URL, default ""),
  bio: String (default ""),
  role: String (default "Product Builder"),
  experience: String (default "Mid-level"),
  skills: [String] (default ["Frontend"]),
  googleId: String (default "", indexed),
  authProvider: String (enum: ["local", "google"], default "local"),
  createdAt: Date,
  updatedAt: Date
}
```

### User Format Response
```javascript
{
  id: String,
  _id: String,
  name: String,
  email: String,
  avatar: String,
  bio: String,
  role: String,
  experience: String,
  skills: [String],
  createdAt: Date,
  updatedAt: Date
}
```

### User Operations
- `GET /api/me` — Get current user profile
- `PATCH /api/me` — Update own profile (name, avatar, bio, role, experience, skills)
- Profile sync cascades name/avatar changes to all Team.members entries

---

## 3. TEAM CONTRACT

### Team Model
```javascript
{
  _id: ObjectId,
  name: String (required),
  ownerId: ObjectId (indexed),
  logo: String (base64 or URL),
  settings: {
    sprintCapacity: Number (default 40),
    defaultReminder: String,
    aiPreferences: String,
    defaultPriority: String,
    themeColor: String
  },
  projectTitle: String,
  projectDescription: String,
  members: [TeamMemberSchema],
  taskCount: Number (default 0),
  doneCount: Number (default 0),
  activeProjectId: ObjectId (ref: Project, default null),
  aiGeneratedTasks: [AiTaskSeedSchema],
  createdAt: Date,
  updatedAt: Date
}
```

### TeamMember Schema
```javascript
{
  userId: ObjectId (ref: User, required),
  name: String,
  avatar: String,
  role: String (default "member", options: "leader", "member"),
  skills: SkillProfileSchema,
  capacity: Number (default 40),
  assignedLoad: Number (default 0)
}
```

### SkillProfile Schema
```javascript
{
  frontend: Number (1-10, default 5),
  backend: Number (1-10, default 5),
  devops: Number (1-10, default 5),
  design: Number (1-10, default 5),
  ml: Number (1-10, default 5),
  testing: Number (1-10, default 5)
}
```

### Team Operations
- `GET /api/teams` — List user's teams (owner or member)
- `GET /api/teams/:teamId` — Get single team (must be member)
- `POST /api/teams` — Create team (creator becomes leader)
- `PATCH /api/teams/:teamId` — Update team (name, logo, projectTitle, projectDescription, settings)
- `DELETE /api/teams/:teamId` — Delete team (owner only)
- `POST /api/teams/:teamId/members` — Add member
- `PATCH /api/teams/:teamId/members/:userId` — Update member name/role
- `DELETE /api/teams/:teamId/members/:userId` — Remove member
- `POST /api/teams/:teamId/leave` — Leave team (members only, not owner)
- `PATCH /api/teams/:teamId/members/:userId/skills` — Update own skills only

### Team Authorization
- `verifyTeamAccess(teamId, user)` checks:
  1. Team exists
  2. User is owner OR user is in members array
  3. Returns `{ team }` or `{ error, status }`
- All team mutations require `requireAuth` + `verifyTeamAccess`

---

## 4. ROLE CONTRACT

### Roles
| Role | Permissions |
|------|-------------|
| **TEAM LEADER** | Create team, rename team, delete team, invite members, remove members, manage team membership, view team information, manage team-level settings |
| **TEAM MEMBER** | Work on project, view team, update own profile, update ONLY own skills, leave team, participate in chat, receive notifications |

### Role Enforcement Rules
- Team leader CANNOT leave their own team (must delete instead)
- Team member CANNOT: edit another member's skills, remove another member, delete team, change team ownership, modify another user's private data
- Role is stored in `Team.members[].role` as string: `"leader"` or `"member"`
- Authorization is checked server-side on every mutation

---

## 5. INVITATION CONTRACT

### Invitation Model
```javascript
{
  _id: ObjectId,
  teamId: ObjectId (required, indexed),
  teamName: String (required),
  inviterId: ObjectId (required),
  inviterName: String,
  inviterEmail: String,
  invitedUserId: ObjectId (required, indexed),
  invitedEmail: String (required, indexed),
  status: String (enum: "pending", "accepted", "rejected", "expired", "canceled", default "pending", indexed),
  role: String (default "member"),
  expiresAt: Date (default: now + 7 days, indexed with TTL),
  createdAt: Date,
  updatedAt: Date
}
```

### Invitation Statuses
- `pending` — Awaiting response
- `accepted` — User joined team
- `rejected` — User declined
- `expired` — Auto-expired after 7 days
- `canceled` — Cancelled by inviter (future use)

### Invitation Operations
- `POST /api/teams/:teamId/invitations` — Invite by email (team leader only)
- `GET /api/invitations` — List pending invitations for current user
- `POST /api/invitations/:id/accept` — Accept invitation
- `POST /api/invitations/:id/reject` — Reject invitation

### Invitation Rules
- Only registered users can be invited (returns 404 if unregistered)
- Self-invite prevention
- Duplicate invitation prevention
- Duplicate membership prevention
- Invitation expiry (7 days default)
- Expired invitations filtered from pending list
- Accept/reject validates expiry before processing

### Invitation Notifications
- On invite: `Notification` created for invited user
- On accept: `Notification` created for inviter
- Real-time socket events:
  - `invitation:received` → target user room
  - `invitation:updated` → inviter user room

---

## 6. NOTIFICATION CONTRACT

### Notification Model
```javascript
{
  _id: ObjectId,
  userId: ObjectId (required, indexed),
  type: String (enum: "team_invitation", "invitation_accepted", "invitation_rejected", "task_assigned", "general", default "team_invitation"),
  title: String (required),
  message: String (required),
  data: {
    teamId: ObjectId,
    teamName: String,
    invitationId: ObjectId,
    inviterName: String
  },
  read: Boolean (default false),
  status: String (enum: "unread", "read", "archived", default "unread"),
  createdAt: Date,
  updatedAt: Date
}
```

### Notification Operations
- `GET /api/notifications` — Get user's notifications (user-scoped)
- `PATCH /api/notifications/:id/read` — Mark as read

### Notification Rules
- Notifications are ALWAYS scoped to `userId`
- User A must NEVER receive User B's private notifications
- Server-side authorization checks `userId === authUser._id`

### Real-time Notification Events
- `invitation:received` — New invitation
- `invitation:updated` — Invitation accepted/rejected
- `team:member_left` — Team member left
- `notification:new` — General new notification
- `notification:read` — Notification read update

---

## 7. SOCKET.IO EVENT CONTRACT

### Connection
- All socket connections require valid JWT in `auth.token`
- Unauthorized connections are rejected with `Error("unauthorized")`
- On connect, socket joins `user:{userId}` room

### Room Strategy
| Room | Pattern | Purpose |
|------|---------|---------|
| User room | `user:{userId}` | Direct user notifications |
| User room (email) | `user:{email}` | Legacy email-based targeting |
| Team room | `team:{teamId}` | Team collaboration events |
| Project room | `project:{projectId}` | Project intelligence events (Agent 2 territory) |

### Event Contracts

#### Team Events
| Event | Emitter | Target Room | Payload | Auth |
|-------|---------|-------------|---------|------|
| `member:added` | REST/Socket | `team:{teamId}` | `{ teamId, member, team }` | Team member |
| `member:removed` | REST/Socket | `team:{teamId}` | `{ teamId, userId, name, team? }` | Team member |
| `member:updated` | REST/Socket | `team:{teamId}` | `{ teamId, userId, team? }` | Team member |
| `member:skills_updated` | REST/Socket | `team:{teamId}` | `{ teamId, userId, skills, member?, team? }` | Self only |
| `team:updated` | REST/Socket | `team:{teamId}` | `{ teamId, team? }` | Team member |
| `team:deleted` | REST/Socket | `team:{teamId}` | `{ teamId }` | Owner only |
| `team:member_left` | REST/Socket | `user:{userId}` (per remaining member) | `{ teamId, userId, name, reason }` | — |

#### Invitation Events
| Event | Emitter | Target Room | Payload | Auth |
|-------|---------|-------------|---------|------|
| `invitation:received` | REST | `user:{invitedUserId}` | `{ invitation, teamName, inviterName }` | — |
| `invitation:updated` | REST | `user:{inviterId}` | `{ invitationId, status, teamId }` | — |

#### Task Events (existing, preserved)
| Event | Emitter | Target Room | Payload | Auth |
|-------|---------|-------------|---------|------|
| `task:created` | REST/Socket | `team:{teamId}` | Task object | Team member |
| `task:updated` | REST/Socket | `team:{teamId}` | Task object | Team member |
| `task:deleted` | REST/Socket | `team:{teamId}` | `{ taskId }` | Team member |
| `task:execution-order` | Socket | `team:{teamId}` | `{ tasks, edges }` | Team member |
| `task:priority_refreshed` | Socket | `team:{teamId}` | `{ teamId, count }` | Team member |
| `task:assigned` | Socket | `team:{teamId}` | `{ taskId, memberId, cost, totalCost, meta }` | Team member |

#### Chat Events (NEXUSFLOW 3.0)
| Event | Emitter | Target Room | Payload | Auth |
|-------|---------|-------------|---------|------|
| `chat:global:new` | Socket | Global (all) | ChatMessage object | Authenticated |
| `chat:team:new` | Socket | `team:{teamId}` | ChatMessage object | Team member |
| `chat:typing` | Socket | `team:{teamId}` | `{ userId, isTyping }` | Team member |

#### Presence Events (NEXUSFLOW 3.0)
| Event | Emitter | Target Room | Payload | Auth |
|-------|---------|-------------|---------|------|
| `presence:online` | Socket | `user:{userId}` | `{ userId }` | — |
| `presence:offline` | Socket | `user:{userId}` | `{ userId }` | — |

### Socket.IO Rules
1. Socket.IO is a SYNCHRONIZATION LAYER, not the source of truth
2. MongoDB remains the persistent source of truth
3. Every mutation: API → MongoDB → Socket.IO → Clients
4. On reconnect, client should re-fetch authoritative state
5. Server validates all socket events against team membership
6. Never emit sensitive data to unauthorized rooms

---

## 8. CHAT CONTRACT

### ChatMessage Model
```javascript
{
  _id: ObjectId,
  senderId: ObjectId (ref: User, required, indexed),
  senderName: String (default ""),
  teamId: ObjectId (ref: Team, default null, indexed),
  message: String (required),
  type: String (enum: "global", "team", default "global", indexed),
  replyTo: ObjectId (ref: ChatMessage, default null),
  editedAt: Date (default null),
  deletedAt: Date (default null),
  status: String (enum: "sent", "delivered", "read", default "sent"),
  createdAt: Date,
  updatedAt: Date
}
```

### Chat Operations
- `GET /api/chat/global` — Global chat messages (paginated)
- `POST /api/chat/global` — Send global message
- `GET /api/chat/team/:teamId` — Team chat messages (paginated, member-only)
- `POST /api/chat/team/:teamId` — Send team message (member-only)
- `PATCH /api/chat/:messageId` — Edit own message
- `DELETE /api/chat/:messageId` — Soft-delete own message

### Chat Rules
- Global chat: any authenticated user can send/receive
- Team chat: ONLY team members can access
- Users can ONLY edit/delete their OWN messages
- Messages are persisted in MongoDB
- Pagination: `?before=<messageId>&limit=50`
- Server-side authorization enforced on all endpoints

---

## 9. SKILL CONTRACT

### Skill Storage
Skills are stored in two places:
1. **User.skills**: `[String]` — User's self-declared skill tags (e.g., `["Frontend", "Backend"]`)
2. **Team.members[].skills**: `SkillProfileSchema` — 1-10 ratings per member per team

### Skill Editing
- `PATCH /api/teams/:teamId/members/:userId/skills` — Update skills
- Users can ONLY edit their OWN skills
- Team leader does NOT automatically gain permission to edit another person's skills
- Rating range: 1-10 (validated server-side)
- Skill keys: `frontend`, `backend`, `devops`, `design`, `ml`, `testing`

### Skill Verification (NEXUSFLOW 3.0)
```javascript
{
  _id: ObjectId,
  userId: ObjectId (ref: User, required, indexed),
  skill: String (required, indexed),
  score: Number (0-100, required),
  totalQuestions: Number (required),
  percentage: Number (0-100, required),
  difficulty: String (enum: "beginner", "intermediate", "advanced"),
  attemptId: String (indexed),
  verified: Boolean (default false),
  questions: [{
    question: String,
    options: [String],
    correctIndex: Number,
    userAnswer: Number
  }],
  expiresAt: Date (default null),
  createdAt: Date
}
```

### Skill Verification Operations
- `POST /api/ai/quiz/generate` — Generate quiz (auth required)
- `POST /api/ai/quiz/submit` — Submit quiz answers (auth required)
- `GET /api/skills/verifications` — Get current user's verification history
- Threshold: `>= 80%` → `verified: true`

### Skill Graph Operations
- `GET /api/skills/team/:teamId/graph` — Team skill graph (member-only)
- `GET /api/skills/team/:teamId/gaps` — Skill gap analysis (member-only)

---

## 10. API CONVENTIONS

### Standard Response Format
```javascript
// Success
{ success: true, data: {...} }

// Error
{ error: "Human readable error message" }
```

### HTTP Status Codes
- `200` — Success (GET, PATCH)
- `201` — Created (POST)
- `400` — Bad request (validation)
- `401` — Unauthorized (missing/invalid token)
- `403` — Forbidden (insufficient permissions)
- `404` — Not found
- `409` — Conflict (duplicate, already exists)
- `422` — Unprocessable (semantic error like cycle detected)
- `500` — Server error

### Pagination
- Query params: `?limit=50&before=<lastId>`
- Default limit: 50
- Max limit: 100
- Cursor-based pagination using `_id`

### ID Validation
- All `:id` params MUST be validated with `mongoose.isValidObjectId()`
- Invalid IDs return `400` before any DB query
- Never let invalid ObjectIds cause 500 errors

### Authorization Pattern
```javascript
// 1. requireAuth validates JWT
// 2. resolveAuthUser resolves to real MongoDB _id
// 3. verifyTeamAccess checks membership
// 4. Additional role checks as needed
```

---

## 11. FRONTEND CONVENTIONS

### State Management
- React Context for auth (`AuthContext`)
- Custom hooks for feature state (`useTeam`, `useInvitations`, `useChat`, etc.)
- Socket.IO client singleton via `getSocket(token)`

### API Calls
- Base URL: `API_BASE_URL` from `@/utils/api`
- Auth header: `Authorization: Bearer ${token}`
- Token storage: `nf_jwt` via `expo-secure-store`/`localStorage`

### Navigation (Expo Router)
```
(app)/
├── _layout.tsx          # Root: SafeAreaProvider > AuthProvider > FeedbackProvider > AuthGate > Stack
├── index.tsx            # Landing / Google OAuth callback handler
├── docs.tsx             # Documentation
├── daa-insights.tsx     # DAA algorithm insights
├── team/[teamId].tsx    # Workspace
├── (auth)/
│   ├── login.tsx
│   ├── signup.tsx
│   ├── forgot-password.tsx
│   └── ...
├── (tabs)/
│   ├── _layout.tsx      # Bottom tabs
│   ├── dashboard.tsx    # Home
│   └── profile.tsx      # Profile
├── global-chat.tsx      # Global chat
├── skill-verification.tsx
└── skill-graph.tsx
```

### Theme
- Design tokens in `@/theme`
- Colors: `colors.primary`, `colors.accent`, `colors.danger`, `colors.success`, etc.
- Spacing: `spacing.xs`, `spacing.sm`, `spacing.md`, `spacing.lg`, etc.
- Radius: `radius.sm`, `radius.md`, `radius.lg`, `radius.xl`, `radius.pill`

---

## 12. DATABASE INDEXES

### Required Indexes
| Collection | Field | Type |
|------------|-------|------|
| User | email | unique |
| User | googleId | standard |
| Invitation | teamId | standard |
| Invitation | invitedUserId | standard |
| Invitation | status | standard |
| Invitation | invitedEmail | standard |
| Invitation | expiresAt | TTL |
| Notification | userId | standard |
| ChatMessage | teamId | standard |
| ChatMessage | type | standard |
| ChatMessage | senderId | standard |
| SkillVerification | userId | standard |
| SkillVerification | skill | standard |
| SkillVerification | userId + skill + createdAt | compound |

---

## 13. SECURITY REQUIREMENTS

### Server-Side Only
1. **Never trust frontend**: All auth, authz, validation on server
2. **Resolve identity**: Always resolve JWT to real MongoDB `_id`
3. **Team membership check**: Verify before any team-scoped operation
4. **Skill ownership**: Users edit only own skills
5. **Message ownership**: Users edit/delete only own messages
6. **Notification isolation**: Scoped by `userId`, never cross-user
7. **Chat authorization**: Team chat requires team membership
8. **ObjectId validation**: All ID params validated before queries
9. **No secrets in frontend**: OAuth secrets, API keys server-side only

### Rate Limiting
- Use existing `createRateLimiter` utility where available
- Forgot password should be rate-limited (implementation left to existing rate limiter)

---

## 14. AGENT 2 INTEGRATION NOTES

### What Agent 2 Can Consume
1. **Socket.IO rooms**: `project:{projectId}` for project intelligence events
2. **Team membership**: `verifyTeamAccess()` pattern for authorization
3. **User identity**: `resolveAuthUser()` pattern for auth resolution
4. **Notification pattern**: User-scoped notifications with `userId`
5. **Team model**: `activeProjectId` links team to project
6. **Existing algorithms**: Greedy, B&B, Knapsack, TopoSort, MergeSort, Boyer-Moore

### What Agent 2 Should NOT Modify
1. Authentication routes (`/api/auth/*`)
2. User model core fields
3. Team model core fields
4. Socket.IO team room strategy
5. Existing JWT auth middleware
6. `verifyTeamAccess` helper
7. Existing notification model

### Shared Utilities Agent 2 Can Use
- `server/auth.js` — `sign`, `verify`, `requireAuth`, `formatUser`
- `server/routes/teams.js` — `verifyTeamAccess`, `resolveAuthUser`
- `server/socket/projectSyncHandlers.js` — Project room broadcast helpers
- `server/utils/logger.js` — Logging
- `server/utils/rateLimiter.js` — Rate limiting

### Agent 2 Should Extend
- `server/routes/projects.js` — Add project intelligence endpoints
- `server/socket/` — Add project-scoped socket handlers
- `server/models/` — Add project intelligence models
- `server/services/` — Add AI orchestration services

---

## 15. TESTING REQUIREMENTS

### Authentication Tests
- Google OAuth mapping
- Duplicate email prevention
- Forgot password flow
- Expired token handling
- Invalid token handling

### Team Tests
- Leader permissions
- Member permissions
- Unauthorized deletion
- Leave team
- Owner cannot leave

### Invitation Tests
- Registered email
- Unregistered email
- Duplicate invitation
- Self invite
- Accept/reject
- Expiry

### Notification Tests
- User isolation
- Unread count
- Read state
- Real-time delivery

### Skill Tests
- Own skill editing
- Teammate skill editing rejected
- 1-10 validation

### Quiz Tests
- Valid attempt
- Invalid attempt
- Scoring
- Verification threshold
- History

### Chat Tests
- Global chat
- Team chat
- Unauthorized team chat
- Persistence
- Realtime delivery

### Realtime Tests
- Connect
- Reconnect
- Duplicate events
- Synchronization

### Security Tests
- Cross-user access
- Cross-team access
- IDOR attempts

---

## 16. KNOWN LIMITATIONS

1. **Email service**: Password reset emails are logged to console. Production needs SMTP integration.
2. **Google OAuth**: Requires valid `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` in `.env`
3. **Chat persistence**: Messages stored in MongoDB but no message search yet
4. **Skill verification**: Uses fallback questions; AI-generated quizzes require additional LLM integration
5. **Skill graph**: Basic coverage analysis; advanced gap prediction needs Agent 2's AI
6. **File uploads**: Avatars use base64; production should use S3/Cloudinary
7. **Rate limiting**: Password reset endpoint should be rate-limited in production

---

*Contract Version: 3.0.0*
*Last Updated: 2026-09-01*
