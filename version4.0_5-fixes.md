# NexusFlow V4.0 — Parallel Fixes & Improvements
## Current Implementation Batch — 5 Items Only

> **Status:** Active implementation batch  
> **Scope:** Only the five fixes/improvements documented below should be worked on in this batch.  
> **Important:** Methodology-specific environments (Scrum, Kanban, Waterfall, Hybrid) are being designed separately in ChatGPT and are **not** part of these five implementation tasks yet.

Each item contains:
1. A detailed implementation prompt for the coding agent.
2. A short explanation of what is being implemented, why it is needed, and how it improves the existing V3 infrastructure.

---

# FIX 1 — NexusFlow AI Core for AI Processes + Local Pretrained Model Direction

## Short Description

V3 currently relies on OmniRoute/free external AI routes for AI functionality and can fall back to deterministic/local canned responses in some situations.

V4 should evolve this into a proper **NexusFlow AI Core**.

The boundary is strict:
- **AI Core handles AI-related processes.**
- **DAA/deterministic algorithms remain completely separate and unchanged.**
- Global Chat and Team Chat remain separate communication systems.

The future architecture should allow a pretrained/open local model to become an internal AI capability for project understanding, document understanding, quiz generation, AI recommendations, explanations, resource recommendations, and other genuinely AI-related processing.

Do not select or hard-code a specific pretrained model yet. Model selection, storage, inference requirements, licensing, RAM/VRAM requirements, and deployment strategy will be researched separately.

## Detailed Implementation Prompt

```text
TASK: Implement the V4 AI Core abstraction and harden the existing AI routing architecture.

IMPORTANT ARCHITECTURAL BOUNDARY:
The AI Core must handle ONLY AI-related processing.

Do NOT modify, replace, or move DAA/deterministic project-management logic into an LLM.

DAA/deterministic systems such as:
- Greedy task planning
- priority calculations
- sprint calculations
- deterministic scoring
- critical-path calculations
- workload/capacity calculations
- optimization logic
must remain in their existing algorithmic services.

CHAT IS ALSO SEPARATE:
Global Chat and Team Chat are communication systems.
Do not merge them into the project AI-processing architecture.

OBJECTIVE:
Create a clean AI abstraction/orchestration layer so existing AI features can use a consistent interface instead of scattering provider-specific logic throughout the application.

Conceptually support:

AI Request
  ↓
NexusFlow AI Core
  ↓
configured AI provider
  ├── OmniRoute/free route
  └── future local pretrained model
  ↓
normalized AI result
  ↓
existing feature

The local pretrained model is a planned capability.
Do not pretend that a particular model has already been selected or deployed.

REQUIREMENTS:

1. Inspect all existing V3 AI services before changing anything.
2. Identify direct AI-provider calls, OmniRoute usage, deterministic fallbacks, AI-specific services, Copilot, quiz generation, recommendations, and resource recommendation.
3. Introduce a clean provider abstraction/interface where appropriate.
4. Existing AI features should call the abstraction rather than duplicate provider-specific implementation.
5. Preserve existing OmniRoute/free routing behavior.
6. Preserve the $0-cost requirement: no paid fallback, no hidden API provider, no automatic paid upgrade.
7. Deterministic fallback examples must not be presented as genuine AI output. If retained, clearly label them or expose them only through explicit user action.
8. Normalize AI responses so frontend features do not depend on provider-specific response shapes.
9. Handle provider unavailable, timeout, invalid response, malformed output, quota/rate-limit, and empty response cases explicitly.
10. Design the abstraction so a future local pretrained model can be added without rewriting every AI feature.
11. Do NOT download or select a model as part of this task.
12. Do NOT alter DAA algorithms.
13. Do NOT alter Global Chat or Team Chat architecture.
14. Add/maintain tests for provider success, provider failure, normalized response, fallback behavior, no accidental paid route, and AI/DAA separation.
15. Verify existing V3 AI features still work.
16. Do not remove working V3 functionality simply to simplify implementation.
17. Keep compatibility with React Native + Expo Router + TypeScript, React Native Web, Node.js + Express + Socket.IO, MongoDB/Mongoose, JWT, and OmniRoute.

FINAL VERIFICATION:
- No direct OpenAI production calls.
- No paid AI fallback.
- DAA remains untouched.
- Chat remains separate.
- Existing AI features continue working.
- AI provider abstraction is reusable for future local model integration.
```

---

# FIX 2 — Workflow Role Selection + Registered User Invitation

## Short Description

When creating/configuring a workflow and selecting a role, the selected role should connect to the existing skill-verification system.

Selecting a role should trigger the relevant skill quiz so the system can verify the required capability.

Also fix the workflow creation invitation bug: if a leader enters the email of an already registered NexusFlow user, that user should receive a proper invitation exactly like the Members flow.

## Detailed Implementation Prompt

```text
TASK: Fix workflow role selection, role-based skill verification, and workflow email invitations.

OBJECTIVE:
When a user creates/configures a workflow and selects a role, connect that role to the existing verified-skill infrastructure.

ROLE → SKILL QUIZ:
User selects role
  ↓
Identify role-required skills
  ↓
Show skill verification prompt/quiz
  ↓
Use existing 5-question verification infrastructure
  ↓
Score result
  ↓
Persist verified result using existing skill/badge infrastructure

Reuse the existing V3 skill verification infrastructure.
Do not create a second incompatible quiz system.

QUIZ RULE:
- 5 questions per selected skill
- 3/5 or higher = Verified
- below 3/5 = Not Verified
- immediate Correct/Wrong feedback
- explanation after each answer
- persist verified result/badge

WORKFLOW INVITATION FIX:
When an email is entered:
1. Normalize the email.
2. Check whether a registered NexusFlow User exists.
3. If registered:
   - resolve actual User ID
   - create/send the appropriate invitation
   - preserve selected role
   - preserve project/team association
   - reuse existing invitation infrastructure
   - notify the invited user
4. If unregistered:
   - do NOT create fake membership
   - do NOT create fake User ID
   - preserve current product behavior for unregistered addresses.

SECURITY:
- Only authorized leaders can send invitations.
- Prevent duplicate active invitations.
- Respect invitation expiry and existing notification behavior.
- Do not break Members-tab invitation flow.
- Reuse/centralize the invitation service if appropriate.

FRONTEND:
- Make role selection clear.
- Explain why a quiz is requested.
- Make the quiz popup/modal professional and accessible.
- Do not expose debug information.

BACKEND:
- Validate role and project/team permissions.
- Resolve registered users through the actual User model.
- Reuse existing invitation and skill-verification services.

TEST:
- registered invitation succeeds
- unregistered email does not become a member
- duplicate invitation is handled
- expiry remains correct
- unauthorized invitation is rejected
- role quiz opens correctly
- 5-question scoring works
- verified result persists
- existing Members invitation flow remains intact
```

---

# FIX 3 — Members / Skills Permissions + Professional Team Member Information

## Short Description

V4 should make team skill data trustworthy.

A user should update their own verified skills through the appropriate verification flow. A teammate must not manually edit another teammate's verified skills.

Clicking a teammate should show useful professional information such as email, role, skills, and verified badges, subject to privacy rules.

Only the authorized team leader can remove teammates.

## Detailed Implementation Prompt

```text
TASK: Harden team member skill permissions and improve team-member information.

OBJECTIVE:
Make verified skill information trustworthy and prevent unauthorized manipulation of another member's verified skills.

SKILL OWNERSHIP:
A user may:
- view their own skills
- take relevant skill quizzes
- earn/update their own verification state through the verification system

A user must NOT:
- manually increase another teammate's verified skill
- manually decrease another teammate's verified skill
- forge another member's verified badge
- directly edit another member's verification result

Reuse existing skill verification infrastructure.

MEMBER PROFILE VIEW:
When a teammate is selected/clicked, show, subject to privacy rules:
- email
- team role
- project role
- skills
- verified skills/badges
- relevant skill status

Do not expose unrelated private account information.

TEAM LEADER REMOVAL:
Only the authorized team leader can remove a teammate.

Removal must:
- verify authorization server-side
- require confirmation
- capture reason where required
- create/send appropriate notification
- create audit record
- remove the correct User ID
- prevent ordinary members from performing the action

SECURITY:
Do not rely only on hiding frontend buttons. Enforce permissions in backend routes/services.

DATA INTEGRITY:
- Use actual User IDs.
- Do not rely on display names/email strings for identity.
- Preserve verified skill data.
- Do not silently overwrite badges.

FRONTEND:
Create a clean professional member profile panel/modal/card.
Clearly distinguish self-editable/verified information, read-only teammate information, and leader-only management actions.

TEST:
- user can verify/update own skill through quiz
- user cannot edit teammate verified skill
- ordinary member cannot remove teammate
- leader can remove authorized member
- unauthorized API requests are rejected
- member profile displays correct User data
- no cross-user skill mutation
- notification and audit behavior remain correct
```

---

# FIX 4 — Professional Team Discovery + Skill-Based Applications

## Short Description

Introduce the V4 team-discovery model without removing the existing invitation model.

There are now two legitimate membership paths:

1. Direct invitation from an authorized team leader.
2. Discoverable team → application → role quiz → leader review → accept/reject.

Discovering a team must never automatically add someone to it.

The application experience should feel like a professional role application system.

## Detailed Implementation Prompt

```text
TASK: Implement the foundation of V4 Open Team Discovery and Professional Skill-Based Team Applications.

IMPORTANT:
This feature must coexist with the existing direct invitation system.

VALID MEMBERSHIP PATHS:

PATH A:
Team Leader Invitation
  ↓
Registered User
  ↓
Invitation Accepted
  ↓
Team Membership

PATH B:
Discoverable Team
  ↓
Student searches/browses
  ↓
Views public team/project information
  ↓
Selects open role
  ↓
Understands requirements
  ↓
Takes role-specific skill quiz
  ↓
Submits professional application
  ↓
Team Leader reviews
  ↓
Accept
OR
Reject
  ↓
If accepted → actual registered User ID becomes team member

KEY SECURITY RULE:
Discoverability NEVER equals membership.

Only a valid leader invitation acceptance or authorized leader acceptance of an application can result in actual membership.

TEAM DISCOVERY:
Only teams explicitly marked discoverable should appear.

Public information may include:
- team/project name
- project description
- domain
- methodology
- project stage
- open roles
- required skills
- preferred skills
- expectations
- general project information

Do NOT expose:
- private chat
- private documents
- private member data
- sensitive project information
- private contact information

SEARCH/FILTERS:
- domain
- methodology
- required skills
- open roles
- project stage
- team size
- deadline
- difficulty
- academic/project category

OPEN ROLE:
Leader can define:
- role name
- role description
- required skills
- preferred skills
- minimum skill verification requirement
- expectations
- available slots

APPLICATION FLOW:
1. Open team
2. Select role
3. Read project/team requirements
4. Start role quiz
5. Complete relevant skill verification
6. Receive result
7. See skill-match information
8. Write application message
9. Review application
10. Submit

APPLICATION STATES:
- DRAFT
- QUIZ_PENDING
- SUBMITTED
- UNDER_REVIEW
- ACCEPTED
- REJECTED
- WITHDRAWN

PREVENT:
- duplicate active application for same user/team/role
- unauthorized application status changes
- unauthorized acceptance/rejection
- direct membership creation by applicants

LEADER APPLICATION VIEW:
Show:
- candidate
- requested role
- verified skills
- quiz score
- skill match
- role compatibility
- workload where permitted
- application message
- status

Leader actions:
- Accept
- Reject
- optionally provide reason

ACCEPTANCE:
- verify leader authorization
- verify application is still valid
- verify candidate is registered
- create membership using actual User ID
- prevent duplicate membership
- notify candidate
- update relevant team/skill state
- create audit event

REJECTION:
- verify leader authorization
- update status
- optionally capture reason
- notify candidate
- create audit event

WITHDRAWAL:
Applicant can withdraw an eligible application.

SKILL QUIZ:
Reuse existing V3 infrastructure:
- 5 questions per relevant skill
- immediate correctness feedback
- explanation
- 3/5 verification threshold
- persist result/badge

PROFESSIONAL UI:
The application flow must not look like a generic Join Team button.
Design:
- role overview
- requirement cards
- skill-match section
- quiz status
- application form
- application preview
- submission confirmation
- application status timeline

LEADER DASHBOARD:
Create a professional applications view with candidate cards/table, role, skill match, quiz result, status, and review actions.

PRIVACY:
Public team discovery must not leak private information.

TEST:
- only discoverable teams appear
- private teams are hidden
- applicant cannot directly join
- role quiz works
- duplicate active applications are blocked
- leader-only acceptance/rejection enforced server-side
- accepted application creates actual User membership
- rejected application does not create membership
- withdrawal works
- notifications work
- audit records work
- existing invitation path still works
```

---

# FIX 5 — Chat Markdown Rendering + Professional Chat UI

## Short Description

Fix the issue where chat/AI responses can visibly show raw Markdown markers such as `**text**` instead of properly rendering formatted text.

Create a proper safe message-rendering layer while preserving the existing V3 chat architecture:

- Global Chat
- Team Chat
- Socket.IO realtime
- MongoDB persistence
- unread counters
- mark-as-read
- conversation isolation

Do not merge chat into the NexusFlow AI Core.

## Detailed Implementation Prompt

```text
TASK: Fix raw Markdown rendering in NexusFlow chat and improve message presentation.

CURRENT PROBLEM:
Some messages can display raw Markdown syntax such as:
**Important**
*item*
`code`
instead of rendering professionally.

OBJECTIVE:
Create a safe, consistent message-rendering layer.

CHAT ARCHITECTURE MUST REMAIN:
- Global Chat remains separate.
- Team Chat remains separate.
- Socket.IO realtime remains.
- MongoDB persistence remains.
- unread counters remain.
- mark-as-read remains.
- authorization/isolation remains.

Do NOT merge chat into the project AI Core.

MARKDOWN RENDERING:
Support a controlled subset:
- bold
- italic
- inline code
- code blocks
- bullets
- numbered lists
- headings where appropriate
- links where safe
- line breaks

Raw formatting markers should not unnecessarily remain visible.

SECURITY:
Treat user/AI content as untrusted.
Prevent XSS, script injection, unsafe HTML, dangerous URL schemes, and arbitrary embedded HTML.
Do not blindly inject raw HTML.
If a Markdown renderer is introduced, use safe configuration and sanitize output appropriately.

MESSAGE TYPES:
Renderer should work for:
- normal user messages
- AI-generated content where displayed in chat
- system messages if applicable
- code snippets

CODE:
Readable code blocks with monospace font, preserved whitespace, horizontal scrolling where necessary, and no layout overflow.

UI:
Improve readability with proper spacing, paragraph separation, list indentation, code-block styling, message grouping, and timestamps where existing UI supports them.

Do not radically redesign the existing chat unless necessary for the rendering fix.

RESPONSIVENESS:
Desktop, tablet, mobile. No horizontal page overflow.

TEST:
- bold renders correctly
- italic renders correctly
- lists render correctly
- inline code renders correctly
- code blocks render correctly
- unsafe HTML is not executed
- unsafe links are handled
- plain text works
- multiline messages work
- realtime Socket.IO messages render correctly
- persisted messages render identically after reload
- Global Chat remains isolated
- Team Chat remains isolated
- unread/mark-read behavior remains unchanged
```

---

# Batch Scope Summary

These are the **only 5 implementation items for the current parallel batch**:

| # | Fix | Main Purpose |
|---|---|---|
| 1 | NexusFlow AI Core | Centralize AI-related processing + prepare for local pretrained AI |
| 2 | Workflow Role + Invitation | Role-based quiz + fix registered-user workflow invitations |
| 3 | Member/Skill Permissions | Protect verified skills + leader-only removal + better member profiles |
| 4 | Team Discovery + Applications | Professional discover → quiz → apply → leader review flow |
| 5 | Chat Markdown/UI | Properly render chat/AI Markdown without raw `**` |

## Explicitly NOT part of this batch

These are being designed separately in ChatGPT:

- Scrum environment
- Kanban environment
- Waterfall environment
- Hybrid environment
- methodology-specific tabs
- methodology-specific state machines
- methodology-specific dashboards
- methodology-specific DAA behavior
- methodology-specific AI behavior
- domain × methodology execution environments

---

# V3 → V4 Improvement Principle

V4 should **extend and connect the existing V3 infrastructure**, not rebuild everything from zero.

```text
V3 Existing Infrastructure
        ↓
      Preserve
        ↓
V4 Fix / Extension
        ↓
Better abstraction + permissions + intelligence + UX
```

Core V3 foundations remain:

- React Native + Expo Router + TypeScript
- React Native Web
- Node.js + Express
- Socket.IO
- MongoDB/Mongoose
- JWT
- OmniRoute
- existing DAA algorithms
- existing team/chat infrastructure
- existing skill verification infrastructure

Each of the five tasks should be implemented incrementally and safely, with regression testing after each item.

---

# Current Working Strategy

**Parallel implementation:** Fixes 1–5.

**Parallel design discussion in ChatGPT:** Methodology environments.

Methodology design sequence:

```text
WATERFALL
   ↓
SCRUM
   ↓
KANBAN
   ↓
HYBRID
```

For each methodology, first decide:

**User journey → tabs → project states → execution rules → DAA behavior → AI behavior → V3 mapping → V4 improvements → edge cases → unique NexusFlow features → UI/UX → only then implementation.**
