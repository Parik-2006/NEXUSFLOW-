# NEXUSFLOW 3.0

## Student Project Operating System --- Collaboration, Verification, Intelligence & Real-Time Execution

### Production Architecture, Low-Level Design & Phased Implementation Roadmap

> **Reference baseline:** NEXUSFLOW 2.0 architecture and implementation
> plan. NEXUSFLOW 3.0 is an additive evolution: preserve working 2.0
> systems, strengthen collaboration and identity, introduce verified
> skills and GitHub-aware execution, make the project workspace truly
> real-time, and add intelligence that learns from the team's execution
> history.

------------------------------------------------------------------------

# 1. Version 3.0 Vision

NEXUSFLOW 2.0 established the foundation for a Student Project
Intelligence Platform: project understanding, AI orchestration, RAG,
knowledge relationships, recommendations, decisions, DAA optimization,
tasks, sprints, assignment, analytics and a project-aware copilot.

NEXUSFLOW 3.0 adds the missing **human + execution + trust layer**.

The system should now answer:

-   Who is this teammate?
-   What skills has this person actually verified?
-   What can this person contribute to the project?
-   Who invited me and what teams can I join?
-   Can teammates communicate globally and inside a team?
-   What happened while I was away from the workspace?
-   Why did someone leave or get removed?
-   Is the team balanced and healthy?
-   Is a member overloaded or under-utilized?
-   Does GitHub activity reflect actual project progress?
-   Are project tasks, sprints, graphs and AI insights synchronized for
    everyone?
-   What skills are missing from the team?
-   What risks are emerging?
-   What did the team learn from the previous sprint?
-   What should the next sprint do differently?

### Product definition

> **NEXUSFLOW 3.0 is a real-time, AI-assisted Student Project Operating
> System that combines project intelligence, verified team skills,
> collaboration, execution tracking, GitHub activity, team-health
> intelligence and continuous learning into one shared project
> workspace.**

The core principle remains:

> **AI assists. Deterministic algorithms optimize. Evidence grounds.
> Users decide. Real-time events synchronize.**

------------------------------------------------------------------------

# 2. What Changes from NEXUSFLOW 2.0

NEXUSFLOW 2.0 primarily focused on:

``` text
IDEA
 ↓
UNDERSTAND
 ↓
RESEARCH
 ↓
RECOMMEND
 ↓
DECIDE
 ↓
ARCHITECT
 ↓
PLAN
 ↓
OPTIMIZE
 ↓
EXECUTE
```

NEXUSFLOW 3.0 extends this to:

``` text
IDEA
 ↓
UNDERSTAND
 ↓
RESEARCH
 ↓
RECOMMEND
 ↓
DECIDE
 ↓
FORM THE TEAM
 ↓
VERIFY SKILLS
 ↓
ARCHITECT
 ↓
PLAN
 ↓
OPTIMIZE
 ↓
EXECUTE TOGETHER
 ↓
CHAT / COLLABORATE
 ↓
OBSERVE REAL ACTIVITY
 ↓
DETECT RISKS
 ↓
LEARN FROM SPRINTS
 ↓
REPLAN
 ↓
CONTINUOUSLY IMPROVE
```

### The important distinction

2.0 knows a project.

3.0 knows:

``` text
PROJECT
 +
TEAM
 +
PEOPLE
 +
VERIFIED SKILLS
 +
COMMUNICATION
 +
EXECUTION
 +
GITHUB ACTIVITY
 +
TEAM HEALTH
 +
HISTORICAL LEARNING
```

------------------------------------------------------------------------

# 3. 3.0 Feature Scope

## A. Identity & Access

1.  Google OAuth authentication
2.  Existing email/password authentication preserved
3.  Forgot-password email flow
4.  Secure session handling
5.  Profile completion and identity consistency
6.  Role-aware authorization

## B. Team Collaboration

7.  Real-time team invitations
8.  Real-time invitation notifications
9.  Join/reject invitation workflow
10. Global chat
11. Team chat
12. Real-time presence/activity indicators
13. Leave-team workflow with mandatory/optional reason
14. Team-leader removal workflow with feedback reason
15. Leader-only team deletion
16. Member profile viewing
17. Self-only skill editing
18. Leader/member permission separation

## C. Verified Skills

19. Skill catalogue
20. Self-declared skills
21. Gemini-generated skill quizzes
22. Skill verification scores
23. Verified badges
24. Attempt history
25. Skill confidence levels
26. Team skill graph
27. Skill-gap warnings and recommendations

## D. Project Intelligence

28. Project Brain / persistent project memory
29. Project risk prediction
30. Team health score
31. Workload imbalance detection
32. Dependency-risk detection
33. Deadline-risk detection
34. Skill-coverage warnings
35. Learning recommendations

## E. Development Intelligence

36. GitHub integration
37. Repository/project linking
38. Commit / PR / issue activity ingestion
39. GitHub-to-task correlation
40. Development activity timeline
41. Development progress signals
42. Inactivity / stale-work warnings
43. Recommendation-only automation

## F. Shared Project Workspace

44. Project AI shared for all team members
45. Tasks shared in real time
46. Sprint shared in real time
47. Dependency graph shared in real time
48. Analytics shared in real time
49. Decisions shared in real time
50. Recommendations shared in real time
51. Architecture state shared in real time
52. Copilot remains individually scoped where appropriate

## G. Team Intelligence

53. AI sprint retrospective
54. NEXUSFLOW learning loop
55. Team opinions / voting / consensus collection
56. Opinion-to-AI synthesis
57. Decision records
58. Historical team execution patterns

## H. UX

59. Frontend cleanup and consistency pass
60. Empty/loading/error/success states
61. Notification centre
62. Unread counters
63. Real-time activity indicators
64. Better mobile/responsive behavior
65. Clear role badges
66. Explainable AI recommendations
67. No-refresh collaboration experience

------------------------------------------------------------------------

# 4. Non-Negotiable 3.0 Rules

## 4.1 Do not break 2.0

Existing working features remain functional.

Do not rewrite stable modules simply because a new architecture is
available.

## 4.2 Additive database evolution

New fields and collections must be migration-safe.

``` text
Existing Document
      +
Optional 3.0 Fields
      =
Backward-Compatible Document
```

## 4.3 Server-side authorization

UI hiding is not authorization.

Every protected action must be checked on the backend.

## 4.4 Real-time means real synchronization

A second user should not need to refresh the browser to see:

-   invitation arrival
-   invitation acceptance
-   invitation rejection
-   member joining
-   member leaving
-   member removal
-   task changes
-   sprint changes
-   dependency changes
-   project-AI updates
-   decisions
-   important notifications
-   chat messages
-   team-health updates where applicable

## 4.5 AI never silently performs destructive actions

AI can:

-   analyze
-   recommend
-   summarize
-   warn
-   rank
-   propose

AI cannot silently:

-   delete a team
-   remove a member
-   delete project data
-   change permissions
-   send arbitrary messages
-   execute arbitrary code
-   push Git changes

Major changes require user confirmation.

------------------------------------------------------------------------

# 5. High-Level System Architecture

``` text
                              NEXUSFLOW 3.0
                                     |
          +--------------------------+--------------------------+
          |                          |                          |
          v                          v                          v
      AUTH LAYER               COLLABORATION              PROJECT LAYER
          |                          |                          |
   Google OAuth                 Invitations                  Project
   Password Auth                Global Chat                  Context
   Reset Email                  Team Chat                    Architecture
   Sessions                     Presence                     Tasks
          |                     Notifications                 Sprints
          |                          |                         Graph
          +--------------------------+--------------------------+
                                     |
                                     v
                            REAL-TIME EVENT BUS
                                     |
          +------------+-------------+-------------+------------+
          |            |             |             |            |
          v            v             v             v            v
       Tasks        Sprints       Teams        Chat        Notifications
          |            |             |             |            |
          +------------+-------------+-------------+------------+
                                     |
                                     v
                            PROJECT INTELLIGENCE
                                     |
          +-------------+------------+-------------+-------------+
          |             |            |             |             |
          v             v            v             v             v
       Risk         Team Health   Skill Gap     GitHub       Learning
       Engine       Engine        Engine        Engine       Loop
          |             |            |             |             |
          +-------------+------------+-------------+-------------+
                                     |
                                     v
                              AI ORCHESTRATOR
                                     |
             +-----------------------+-----------------------+
             |                       |                       |
             v                       v                       v
            RAG               Knowledge Graph          AI Provider
             |                       |                       |
             +-----------------------+-----------------------+
                                     |
                                     v
                              PROJECT COPILOT
```

------------------------------------------------------------------------

# 6. Modular Monolith Strategy

NEXUSFLOW 3.0 should remain a **modular monolith** initially.

Do not introduce microservices merely to make the architecture diagram
look impressive.

Recommended backend domains:

``` text
server/
├── auth/
├── users/
├── profiles/
├── teams/
├── invitations/
├── memberships/
├── skills/
├── quizzes/
├── chat/
├── notifications/
├── projects/
├── tasks/
├── dependencies/
├── sprints/
├── decisions/
├── architecture/
├── github/
├── analytics/
├── health/
├── risks/
├── learning/
├── retrospective/
├── opinions/
├── ai/
├── events/
├── algorithms/
├── middleware/
├── validators/
├── models/
└── config/
```

Each domain should expose:

``` text
Route
 ↓
Controller
 ↓
Service
 ↓
Repository / Model
 ↓
Event
 ↓
Subscribers
```

------------------------------------------------------------------------

# 7. Authentication Architecture

## 7.1 Google OAuth

Flow:

``` text
User
 ↓
Google OAuth
 ↓
OAuth Callback
 ↓
Validate Google Identity
 ↓
Find/Create User
 ↓
Create Application Session
 ↓
Load Profile
 ↓
Dashboard
```

The application should not treat the Google profile as the complete
application profile.

Keep:

``` text
Auth Identity
        +
Application Profile
```

separate.

## 7.2 Forgot Password

``` text
User enters email
        ↓
Generate secure reset token
        ↓
Store hashed token + expiry
        ↓
Send email
        ↓
User opens reset link
        ↓
Validate token
        ↓
Set new password
        ↓
Invalidate token
        ↓
Invalidate/revoke old sessions where appropriate
```

Never store raw reset tokens.

Never expose whether an email exists through an unsafe response.

------------------------------------------------------------------------

# 8. Authorization Model

Roles:

``` text
TEAM_LEADER
TEAM_MEMBER
```

Permissions:

  Action                                            Leader   Member
  -------------------------- ----------------------------- --------
  View team                                            Yes      Yes
  View teammates                                       Yes      Yes
  View teammate profile                                Yes      Yes
  Edit own profile                                     Yes      Yes
  Edit own skills                                      Yes      Yes
  Edit teammate skills                                No\*       No
  Invite member                                        Yes       No
  Remove member                                        Yes       No
  Leave team                                       Yes\*\*      Yes
  Delete team                                          Yes       No
  Create tasks                                         Yes      Yes
  Edit shared project data     Based on project permission      Yes
  Chat                                                 Yes      Yes
  View notifications                                   Yes      Yes

\* Unless a future explicit skill-administrator role is introduced.

\*\* Leader leaving requires a special transfer-ownership workflow.

### Leader leaving rule

A leader should not be able to accidentally orphan a team.

Preferred flow:

``` text
Leader clicks Leave Team
        ↓
Are there other members?
   /              \
 No                Yes
 |                  |
Delete/close?      Transfer leadership
 |                  |
Confirm            Select new leader
                     ↓
                 Confirm
                     ↓
                 Leave team
```

Alternative: require leader to delete the team if the product chooses no
leadership transfer. The chosen rule must be explicit in the
implementation.

------------------------------------------------------------------------

# 9. Real-Time Architecture

This is one of the most important 3.0 upgrades.

## 9.1 Event-driven synchronization

``` text
USER ACTION
   ↓
API
   ↓
Database Transaction
   ↓
DOMAIN EVENT
   ↓
REAL-TIME PUBLISHER
   ↓
CONNECTED CLIENTS
   ↓
LOCAL STATE UPDATE
   ↓
UI RE-RENDER
```

Example:

``` text
User A sends invitation
        ↓
Invitation created
        ↓
INVITATION_CREATED
        ↓
Event publisher
        ↓
User B socket/subscription
        ↓
Notification badge +1
        ↓
Invitation card appears
```

No browser refresh.

## 9.2 Event types

``` text
USER_UPDATED
PROFILE_UPDATED

INVITATION_CREATED
INVITATION_ACCEPTED
INVITATION_REJECTED
INVITATION_CANCELLED

TEAM_MEMBER_JOINED
TEAM_MEMBER_LEFT
TEAM_MEMBER_REMOVED
TEAM_LEADERSHIP_TRANSFERRED

TASK_CREATED
TASK_UPDATED
TASK_DELETED
TASK_STATUS_CHANGED

SPRINT_CREATED
SPRINT_UPDATED
SPRINT_COMPLETED

DEPENDENCY_CREATED
DEPENDENCY_UPDATED
DEPENDENCY_REMOVED

DECISION_CREATED
DECISION_UPDATED

OPINION_CREATED
OPINION_UPDATED
OPINION_CLOSED

PROJECT_CONTEXT_UPDATED
RECOMMENDATION_CREATED
RISK_CREATED
RISK_RESOLVED

CHAT_MESSAGE_CREATED
CHAT_MESSAGE_READ

GITHUB_ACTIVITY_RECEIVED

SKILL_UPDATED
SKILL_VERIFIED
QUIZ_COMPLETED

NOTIFICATION_CREATED
```

## 9.3 Client synchronization strategy

Do not blindly refetch the entire application after every event.

Use event-specific updates:

``` text
TASK_UPDATED
    ↓
Update task in local task store
```

instead of:

``` text
TASK_UPDATED
    ↓
Reload whole project
```

Use refetch as a fallback when:

-   event payload is incomplete
-   client detects version mismatch
-   reconnection occurs
-   optimistic update fails

------------------------------------------------------------------------

# 10. Real-Time Conflict Strategy

Two users may modify the same object.

For important shared documents:

``` text
Entity
├── updatedAt
└── version
```

Example:

``` text
Task version: 12

Client A edits version 12
Client B edits version 12

A succeeds → version 13
B submits version 12
       ↓
Version conflict
       ↓
409 Conflict
       ↓
Show latest version
       ↓
User chooses how to merge
```

For simple fields, server-last-write-wins may be acceptable.

For complex project decisions or architecture edits, explicit conflict
handling is preferable.

------------------------------------------------------------------------

# 11. Notification System

NEXUSFLOW 3.0 should have a unified notification model.

``` text
Notification
├── _id
├── recipientId
├── actorId
├── type
├── title
├── message
├── entityType
├── entityId
├── teamId
├── projectId
├── metadata
├── read
├── createdAt
└── expiresAt
```

Notification types:

``` text
INVITATION
MEMBER_JOINED
MEMBER_LEFT
MEMBER_REMOVED
LEADERSHIP_CHANGED
TASK_ASSIGNED
TASK_COMPLETED
TASK_BLOCKED
SPRINT_STARTED
SPRINT_COMPLETED
RISK_DETECTED
SKILL_VERIFIED
GITHUB_ACTIVITY
OPINION_REQUEST
DECISION_REACHED
SYSTEM
```

## 11.1 Leaving-team reason visibility

If a member leaves and teammates remain:

``` text
Member leaves
      ↓
Reason submitted
      ↓
TEAM_MEMBER_LEFT
      ↓
Notification generated for remaining teammates
      ↓
"RAVANA left Team Alpha"
"Reason: Academic workload / schedule conflict"
```

The reason should be shown according to the user's chosen visibility
policy.

Do not expose private/free-form sensitive information unnecessarily.

Recommended UI:

``` text
RAVANA left the team

Reason
Academic workload and schedule conflict

2 hours ago
```

------------------------------------------------------------------------

# 12. Team Invitation System

Invitation lifecycle:

``` text
PENDING
   |
   +----> ACCEPTED
   |
   +----> REJECTED
   |
   +----> CANCELLED
   |
   +----> EXPIRED
```

## Invitation rules

-   Invite using registered email.
-   Prevent duplicate active invitations.
-   Prevent inviting an existing member.
-   Prevent inviting the same user repeatedly while an invitation is
    pending.
-   Validate team capacity.
-   Validate leader permission.
-   Create notification event.
-   Optionally send email notification.
-   Accepting invitation creates membership atomically.
-   Rejecting invitation updates the invitation state.
-   Both dashboard and Join Team modal must read the same source of
    truth.

------------------------------------------------------------------------

# 13. Global Chat + Team Chat

## Global chat

Purpose:

-   student-to-student communication
-   networking
-   coordination outside a single team

## Team chat

Purpose:

-   project coordination
-   task discussion
-   sprint communication
-   project decisions

Architecture:

``` text
Conversation
├── type: GLOBAL_DM | TEAM
├── teamId?
├── participants[]
├── createdAt
└── updatedAt

Message
├── conversationId
├── senderId
├── content
├── attachments?
├── replyTo?
├── createdAt
├── editedAt?
├── deletedAt?
└── readBy[]
```

Real-time flow:

``` text
Send message
 ↓
Validate membership
 ↓
Persist message
 ↓
CHAT_MESSAGE_CREATED
 ↓
Publish to conversation channel
 ↓
Other clients receive message
 ↓
Unread count update
```

------------------------------------------------------------------------

# 14. Member Profiles

In the Members section:

``` text
Click teammate
       ↓
Open teammate profile
       ↓
Read-only profile view
```

Profile may show:

-   Name
-   Avatar
-   Bio
-   Branch
-   Year
-   Verified skills
-   Skill scores
-   GitHub
-   LinkedIn
-   Portfolio
-   Team role
-   Relevant project contribution

Do not expose private account information.

## Skill editing rule

A member can edit:

``` text
MY PROFILE
MY SKILLS
MY SKILL CLAIMS
```

A member cannot edit:

``` text
TEAMMATE PROFILE
TEAMMATE SKILL SCORE
TEAMMATE VERIFIED RESULT
```

Verified quiz results must be system-generated.

------------------------------------------------------------------------

# 15. Verified Skill System

This converts self-reported skills into evidence-backed project skills.

## Skill lifecycle

``` text
User adds skill
       ↓
Self-declared
       ↓
"Verify Skill"
       ↓
Quiz generated
       ↓
User attempts quiz
       ↓
Evaluate
       ↓
Calculate score
       ↓
Store attempt
       ↓
Verified / Needs Improvement
```

Example:

``` text
Python

Self declared: Yes
Quiz score: 86%
Verification: VERIFIED
Confidence: HIGH
Last verified: 2026-09-01
```

## Skill record

``` text
UserSkill
├── userId
├── skillId
├── skillName
├── selfDeclared
├── verificationStatus
├── score
├── confidence
├── attemptCount
├── lastAttemptAt
├── verifiedAt
└── updatedAt
```

------------------------------------------------------------------------

# 16. AI Skill Quiz Engine

Gemini should generate structured quizzes.

Input:

``` text
Skill: Python
Difficulty: Intermediate
Question count: 10
```

Output:

``` text
Quiz
├── skill
├── difficulty
├── questions[]
│   ├── question
│   ├── options[]
│   ├── correctAnswer
│   ├── explanation
│   └── concept
└── version
```

Do not trust the client to submit the correct answer.

The server owns evaluation.

Recommended flow:

``` text
Client requests quiz
 ↓
Backend AI service
 ↓
Structured output validation
 ↓
Store quiz
 ↓
Client receives questions WITHOUT answer key
 ↓
User submits answers
 ↓
Backend evaluates
 ↓
Score generated
 ↓
Skill updated
```

## Anti-cheating baseline

For a student project, reasonable controls include:

-   randomized question order
-   randomized option order
-   time limit
-   attempt history
-   quiz versioning
-   server-side evaluation
-   cooldown before retake

Do not claim that a quiz proves absolute real-world expertise.

It proves a bounded level of demonstrated knowledge.

------------------------------------------------------------------------

# 17. Skill Levels

Recommended normalized levels:

``` text
1–3   Beginner
4–6   Intermediate
7–8   Advanced
9–10  Expert
```

Verification can be separate:

``` text
Skill Level: 7/10
Verification: VERIFIED
```

This avoids confusing self-rating with verified evidence.

------------------------------------------------------------------------

# 18. Team Skill Graph

Team skill graph:

``` text
                 TEAM
                  |
       +----------+----------+
       |          |          |
       v          v          v
    MEMBER A   MEMBER B   MEMBER C
       |          |          |
     Python     React       MongoDB
       |          |          |
     8/10       9/10       7/10
    VERIFIED   VERIFIED   SELF
```

The graph should answer:

-   Which skills exist?
-   How many people have each skill?
-   Which skills are verified?
-   Which skills have only one owner?
-   Which skills are missing?
-   Which project tasks require those skills?

------------------------------------------------------------------------

# 19. Skill Gap Intelligence

Compare:

``` text
Project Required Skills
        -
Team Verified Skills
        =
Skill Gaps
```

Example:

``` text
Project requires:
Python
React
FastAPI
Docker
ML

Team has:
Python ✓
React ✓
FastAPI ✓
Docker ✗
ML ✗

Warnings:
⚠ Docker capability missing
⚠ ML capability missing
```

This feature should be primarily:

> **Warning + recommendation**

not an automatic blocker.

Recommendations:

-   verify an existing member
-   learn the skill
-   redistribute a task
-   recruit a teammate
-   simplify scope

------------------------------------------------------------------------

# 20. Team Leader Controls

Only the team leader can:

### Invite

``` text
Team → Members → Add Member
```

### Remove

``` text
Team → Members → Remove
       ↓
Confirmation
       ↓
Reason
       ↓
Remove
       ↓
Notification
```

Removal reason examples:

-   inactive participation
-   project requirements changed
-   repeated missed commitments
-   skill mismatch
-   communication issues
-   other

The free-form reason should be handled carefully and should not become a
public harassment channel.

### Delete Team

Leader only:

``` text
Team Settings
 ↓
Delete Team
 ↓
Strong confirmation
 ↓
Optional reason
 ↓
Delete/archive workflow
```

Recommended production behavior:

``` text
Soft delete / archive
```

before irreversible deletion.

------------------------------------------------------------------------

# 21. Leave Team Workflow

Every member should have:

``` text
Team Settings
      ↓
Leave Team
```

Flow:

``` text
Leave Team
 ↓
"What is the reason?"
 ↓
Select reason
 ↓
Optional details
 ↓
Confirm
 ↓
Membership removed
 ↓
TEAM_MEMBER_LEFT
 ↓
Remaining teammates notified
```

Example:

``` text
Why are you leaving?

○ Schedule conflict
○ Academic workload
○ Project direction changed
○ Team communication issue
○ Found another team
○ Other
```

If teammates remain:

``` text
RAVANA left Team Alpha

Reason:
Academic workload

The project remains active with 2 members.
```

------------------------------------------------------------------------

# 22. Team Health Intelligence

Team Health is not a judgment of people.

It is an operational indicator.

Example:

``` text
TEAM HEALTH
82 / 100

Task completion       88%
Workload balance      71%
Participation         91%
Deadline adherence    79%
Blocked work          74%
Skill coverage        86%
```

Use explainable sub-scores.

Possible signals:

``` text
CompletionRate
DeadlineAdherence
WorkloadBalance
BlockedTaskRatio
ParticipationBalance
SkillCoverage
StaleTaskRatio
SprintPredictability
```

Do not use hidden behavioral surveillance.

------------------------------------------------------------------------

# 23. Team Health Warnings

Examples:

``` text
⚠ Workload imbalance

Preetam currently owns 58% of open effort.

Recommendation:
Redistribute 2 medium-priority tasks.
```

``` text
⚠ Backend bottleneck

7 tasks depend on one member's backend work.

Recommendation:
Assign a secondary contributor or split the dependency.
```

These are recommendations, not automatic reassignment.

------------------------------------------------------------------------

# 24. Project Risk Prediction

The risk engine should analyze:

-   deadlines
-   dependencies
-   task status
-   estimated effort
-   actual effort
-   sprint capacity
-   team capacity
-   skill coverage
-   blocked tasks
-   GitHub activity
-   unresolved decisions
-   research readiness

Risk levels:

``` text
LOW
MEDIUM
HIGH
CRITICAL
```

Risk record:

``` text
ProjectRisk
├── projectId
├── type
├── severity
├── title
├── description
├── evidence[]
├── affectedEntities[]
├── probability
├── impact
├── recommendation
├── status
├── createdAt
└── resolvedAt
```

------------------------------------------------------------------------

# 25. GitHub Integration

GitHub becomes a **development evidence source**, not a replacement for
the project database.

Architecture:

``` text
GitHub
 |
 +-- Commits
 +-- Pull Requests
 +-- Issues
 +-- Reviews
 +-- Branches
 |
 v
GitHub Adapter
 |
 v
Normalizer
 |
 v
DevelopmentActivity
 |
 +--> Analytics
 +--> Risk Engine
 +--> Task Intelligence
 +--> Team Health
 +--> Project Brain
```

The frontend should not contain GitHub secrets.

OAuth/token handling must remain server-side.

------------------------------------------------------------------------

# 26. GitHub-to-Task Intelligence

NEXUSFLOW should not pretend that a commit automatically equals a
completed task.

Instead:

``` text
GitHub Activity
      ↓
Correlation Engine
      ↓
Possible Task Match
      ↓
Confidence
      ↓
Recommendation
```

Example:

``` text
Recent PR:
"implement-auth"

Possible related task:
"Google OAuth Authentication"

Confidence:
91%

Recommendation:
"Review whether this task is ready for QA."
```

This preserves human control.

------------------------------------------------------------------------

# 27. Development Activity Timeline

Example:

``` text
Today

09:12  Preetam pushed 4 commits
10:02  Ravana completed UI task
11:14  PR opened for authentication
12:20  Dependency blocked
14:10  Sprint capacity updated
```

The timeline should combine:

``` text
Task Activity
+
GitHub Activity
+
Team Activity
+
Decision Activity
+
AI Insights
```

------------------------------------------------------------------------

# 28. Project AI Shared State

This is critical.

All users inside the same team/project should see the same:

``` text
Project Context
Tasks
Sprints
Dependencies
Graph
Architecture
Decisions
Recommendations
Research
Analytics
Project Risks
Team Skill Coverage
```

The exception:

> **Copilot chat conversations can remain user-specific unless
> explicitly shared.**

Therefore:

``` text
                    TEAM PROJECT
                         |
        +----------------+----------------+
        |                |                |
        v                v                v
     USER A           USER B           USER C
        |                |                |
        +----------------+----------------+
                         |
                 SHARED PROJECT STATE
                         |
             Tasks / Sprint / Graph / AI
```

------------------------------------------------------------------------

# 29. Shared Project State Store

Recommended client architecture:

``` text
ProjectStore
├── project
├── context
├── tasks
├── dependencies
├── sprint
├── architecture
├── decisions
├── recommendations
├── risks
├── team
└── syncStatus
```

Chat store:

``` text
ChatStore
├── conversations
├── messages
├── unreadCounts
└── presence
```

Notification store:

``` text
NotificationStore
├── notifications
├── unreadCount
└── lastEvent
```

------------------------------------------------------------------------

# 30. Synchronization State

Every real-time screen should expose:

``` text
syncStatus:
  connected
  reconnecting
  offline
```

UI:

``` text
● Live
```

or:

``` text
↻ Reconnecting...
```

This makes synchronization visible instead of silently failing.

------------------------------------------------------------------------

# 31. Opinions / Team Consensus System

The project should support asking teammates for opinions.

Example:

> "Should we use MongoDB or PostgreSQL?"

Create an opinion request:

``` text
OpinionRequest
├── projectId
├── createdBy
├── question
├── options[]
├── voters[]
├── deadline?
├── status
└── createdAt
```

Members respond:

``` text
MongoDB
PostgreSQL
Not sure
```

Optional:

``` text
Reason
```

------------------------------------------------------------------------

# 32. Opinion → AI → Decision Flow

``` text
Team Question
      ↓
Collect Opinions
      ↓
Aggregate Results
      ↓
AI Analysis
      ↓
Compare with Project Context
      ↓
Recommendation
      ↓
Team Decision
      ↓
Decision Record
```

Example:

``` text
Question:
MongoDB vs PostgreSQL

Team:
PostgreSQL 3
MongoDB 1

AI:
PostgreSQL aligns better with the relational
requirements and existing project relationships.

Final decision:
PostgreSQL

Decided by:
Team
```

This directly strengthens the DBMS and AI academic story.

------------------------------------------------------------------------

# 33. Decision Model

Extend the 2.0 Decision model:

``` text
Decision
├── projectId
├── question
├── options[]
├── teamOpinions[]
├── selectedOption
├── deterministicCriteria[]
├── aiAnalysis
├── evidence[]
├── reasoning
├── confidence
├── decidedBy
├── createdAt
└── updatedAt
```

Distinguish:

``` text
TEAM OPINION
AI RECOMMENDATION
FINAL USER DECISION
```

Never collapse them into one field.

------------------------------------------------------------------------

# 34. AI Sprint Retrospective

At sprint completion:

``` text
Sprint Data
   |
   +-- Planned tasks
   +-- Completed tasks
   +-- Delayed tasks
   +-- Blocked tasks
   +-- Estimated effort
   +-- Actual effort
   +-- Workload
   +-- Dependencies
   +-- GitHub activity
   |
   v
RETROSPECTIVE ENGINE
   |
   v
AI ANALYSIS
```

Output:

``` text
SPRINT RETROSPECTIVE

What went well
----------------
87% of planned tasks completed.

What went wrong
----------------
Backend work was underestimated.

Team pattern
-------------
Workload was concentrated on 2 members.

Recommendation
--------------
Increase backend estimates in future sprints.
```

Recommendations require team acceptance.

------------------------------------------------------------------------

# 35. NEXUSFLOW Learning Loop

The learning loop turns historical project execution into future
planning intelligence.

``` text
SPRINT 1
   ↓
RESULTS
   ↓
RETROSPECTIVE
   ↓
PATTERNS
   ↓
PROJECT BRAIN
   ↓
SPRINT 2
   ↓
BETTER ESTIMATION
   ↓
RESULTS
   ↓
...
```

Possible learned patterns:

``` text
Backend tasks are consistently underestimated.

Tasks with >3 dependencies are frequently delayed.

The team usually completes 80–90% of planned sprint capacity.

ML tasks require additional learning time.

One member is repeatedly becoming the backend bottleneck.
```

These patterns should be evidence-backed from historical data.

Do not allow an LLM to invent "learned patterns."

------------------------------------------------------------------------

# 36. Learning Pattern Model

``` text
LearningPattern
├── projectId
├── type
├── description
├── evidence[]
├── confidence
├── occurrences
├── firstObservedAt
├── lastObservedAt
└── status
```

A pattern becomes actionable only when enough evidence exists.

------------------------------------------------------------------------

# 37. Project Brain

Project Brain becomes the shared memory layer.

``` text
Project Brain
├── ProjectContext
├── Decisions
├── Architecture
├── Research
├── Tasks
├── Sprint History
├── Team Skills
├── Risks
├── GitHub Activity
├── Retrospectives
└── Learning Patterns
```

The Project Copilot retrieves from this shared state.

------------------------------------------------------------------------

# 38. RAG + Knowledge Graph + Real-Time Events

The three layers have different jobs.

### RAG

Answers:

> "What information is relevant?"

### Knowledge Graph

Answers:

> "How are project entities related?"

### Event System

Answers:

> "What changed right now?"

Combined:

``` text
              PROJECT
                 |
      +----------+----------+
      |          |          |
      v          v          v
     RAG       GRAPH      EVENTS
      |          |          |
 Facts/Docs   Relations   Changes
      |          |          |
      +----------+----------+
                 |
                 v
           AI ORCHESTRATOR
                 |
                 v
        Grounded Recommendation
```

------------------------------------------------------------------------

# 39. Database Architecture

NEXUSFLOW 3.0 should preserve the existing MongoDB-oriented direction
from 2.0 unless the current implementation has already adopted another
database.

Core:

``` text
User
Profile
Team
TeamMember
Project
```

Collaboration:

``` text
Invitation
Conversation
Message
Notification
Presence
```

Skills:

``` text
Skill
UserSkill
SkillVerification
Quiz
QuizAttempt
```

Planning:

``` text
Task
Dependency
Sprint
Milestone
```

Intelligence:

``` text
ProjectContext
Recommendation
Decision
ArchitectureComponent
ProjectRisk
LearningPattern
TeamHealthSnapshot
```

Research:

``` text
ResearchPaper
ResearchQuery
Dataset
ResearchInsight
```

Development:

``` text
GitHubConnection
Repository
DevelopmentActivity
PullRequestReference
CommitReference
```

Opinions:

``` text
OpinionRequest
OpinionResponse
```

AI:

``` text
AIConversation
AIMessage
AIRequest
AIResponse
AIProviderUsage
```

Tracking:

``` text
TaskActivity
ProjectActivity
Retrospective
AuditEvent
DomainEvent
```

------------------------------------------------------------------------

# 40. Team Membership Schema

``` text
TeamMember
├── teamId
├── userId
├── role
├── joinedAt
├── invitedBy
├── status
├── leftAt?
├── leftReason?
└── removedAt?
```

Use membership history rather than simply deleting every trace of
membership.

This allows:

-   audit
-   analytics
-   historical project context
-   retrospective analysis

while respecting privacy and retention policies.

------------------------------------------------------------------------

# 41. Invitation Schema

``` text
Invitation
├── teamId
├── inviterId
├── inviteeId
├── inviteeEmail
├── status
├── message?
├── createdAt
├── respondedAt?
├── expiresAt?
└── metadata
```

Recommended unique active-invitation constraint:

``` text
(teamId, inviteeId, status=PENDING)
```

------------------------------------------------------------------------

# 42. Chat Schema

``` text
Conversation
├── type
├── teamId?
├── participants[]
├── createdAt
└── updatedAt

Message
├── conversationId
├── senderId
├── content
├── createdAt
├── editedAt?
├── deletedAt?
└── readBy[]
```

Indexes:

``` text
Conversation(participants)
Conversation(teamId)
Message(conversationId, createdAt)
Message(senderId, createdAt)
```

------------------------------------------------------------------------

# 43. Task Schema Extension

Preserve the 2.0 task schema and extend only where needed:

``` text
Task
├── existing 2.0 fields
├── actualHours?
├── blockedReason?
├── githubReferences[]
├── activitySummary?
├── riskLevel?
├── lastActivityAt?
└── updatedAt
```

Do not duplicate task state in GitHub.

------------------------------------------------------------------------

# 44. Event Envelope

Every important domain event should have a standard envelope:

``` text
DomainEvent
├── eventId
├── type
├── actorId
├── teamId?
├── projectId?
├── entityType
├── entityId
├── version
├── payload
├── createdAt
└── correlationId
```

Example:

``` text
{
  type: "TASK_STATUS_CHANGED",
  actorId: "...",
  projectId: "...",
  entityType: "Task",
  entityId: "...",
  version: 7,
  payload: {
    oldStatus: "IN_PROGRESS",
    newStatus: "DONE"
  }
}
```

------------------------------------------------------------------------

# 45. Event Processing

Start simple:

``` text
Database
 ↓
Application Event Dispatcher
 ↓
Subscribers
```

Subscribers:

``` text
NotificationSubscriber
AnalyticsSubscriber
HealthSubscriber
RiskSubscriber
ProjectBrainSubscriber
RealtimeSubscriber
AuditSubscriber
```

Do not introduce Kafka or a distributed event platform initially.

------------------------------------------------------------------------

# 46. Idempotency

Real-time events may be delivered more than once.

Clients and subscribers should tolerate duplicates.

Use:

``` text
eventId
```

as the idempotency key.

Example:

``` text
Receive TASK_UPDATED event
 ↓
Have eventId?
  |
  +-- Yes → ignore duplicate
  |
  +-- No → process + store eventId
```

------------------------------------------------------------------------

# 47. API Architecture

Recommended domains:

``` text
/api/auth
/api/oauth
/api/password
/api/users
/api/profiles

/api/teams
/api/teams/:id/members
/api/teams/:id/invitations
/api/teams/:id/leave
/api/teams/:id/remove
/api/teams/:id/delete

/api/invitations

/api/skills
/api/skills/:id/verify
/api/quizzes
/api/quizzes/:id/attempts

/api/chat
/api/conversations
/api/messages

/api/notifications

/api/projects
/api/projects/:id/context
/api/projects/:id/tasks
/api/projects/:id/sprints
/api/projects/:id/graph
/api/projects/:id/decisions
/api/projects/:id/opinions
/api/projects/:id/risks
/api/projects/:id/health
/api/projects/:id/retrospectives

/api/github
/api/github/repositories
/api/github/activity

/api/ai
/api/ai/copilot
/api/ai/quiz
/api/ai/retrospective
```

------------------------------------------------------------------------

# 48. API Authorization Middleware

Every protected route should pass through:

``` text
authenticate()
      ↓
loadUser()
      ↓
authorizeResource()
      ↓
controller()
```

Team route:

``` text
authenticate
 ↓
isTeamMember(teamId)
 ↓
if leader-only:
   isTeamLeader(teamId)
 ↓
controller
```

Never trust:

``` text
role
userId
teamId
```

coming directly from the client.

------------------------------------------------------------------------

# 49. Service Layer

Example:

``` text
TeamService
├── createTeam()
├── inviteMember()
├── acceptInvitation()
├── rejectInvitation()
├── removeMember()
├── leaveTeam()
├── transferLeadership()
├── deleteTeam()
└── getMembers()
```

SkillService:

``` text
SkillService
├── addSkill()
├── updateOwnSkill()
├── requestVerification()
├── recordVerification()
└── getSkillGraph()
```

NotificationService:

``` text
NotificationService
├── create()
├── markRead()
├── markAllRead()
├── getForUser()
└── broadcast()
```

------------------------------------------------------------------------

# 50. Frontend Architecture

Recommended:

``` text
client/
├── app/
├── components/
│   ├── auth/
│   ├── dashboard/
│   ├── teams/
│   ├── members/
│   ├── invitations/
│   ├── notifications/
│   ├── chat/
│   ├── skills/
│   ├── quizzes/
│   ├── project/
│   ├── tasks/
│   ├── sprint/
│   ├── graph/
│   ├── github/
│   ├── health/
│   ├── risks/
│   ├── opinions/
│   ├── retrospective/
│   └── ai/
├── hooks/
├── services/
├── stores/
├── types/
├── utils/
└── theme/
```

Large business logic must not live inside page components.

------------------------------------------------------------------------

# 51. Frontend UX Enhancement Pass

NEXUSFLOW 3.0 should retain the approved NEXUSFLOW visual identity.

Preserve:

-   creamy visual language
-   glassmorphism where appropriate
-   rounded cards
-   existing workspace identity
-   task experience
-   project navigation
-   team identity

Improve:

-   spacing consistency
-   typography hierarchy
-   icon consistency
-   button hierarchy
-   modal behavior
-   loading states
-   empty states
-   error states
-   confirmation dialogs
-   responsive layout
-   accessibility
-   keyboard navigation
-   toast feedback
-   optimistic UI
-   real-time status

------------------------------------------------------------------------

# 52. UI State Standards

Every asynchronous feature must define:

``` text
IDLE
LOADING
SUCCESS
EMPTY
ERROR
RECONNECTING
```

Example:

``` text
Join Team

Loading:
Finding invitations...

Empty:
No pending invitations.

Error:
Unable to load invitations.
[Retry]

Success:
1 pending invitation
```

No blank screens.

------------------------------------------------------------------------

# 53. Notification UX

Header:

``` text
[Project] [Bell ③] [Avatar]
```

Clicking the bell:

``` text
Notifications
-------------------------
Team Alpha invitation
Preetam invited you
[Accept] [Reject]

Ravana left Team Beta
Reason: Schedule conflict

Sprint deadline warning
Backend sprint may be delayed
[View]
```

Unread count updates in real time.

------------------------------------------------------------------------

# 54. Real-Time Presence

For team/chat contexts:

``` text
● Online
○ Offline
◌ Away
```

Presence should be lightweight.

Do not store constant activity telemetry.

Use heartbeat/session-based presence.

------------------------------------------------------------------------

# 55. Optimistic UI

For low-risk interactions:

``` text
User sends message
 ↓
Show message immediately
 ↓
Server confirms
 ↓
Mark as sent
```

For destructive actions:

``` text
Remove member
 ↓
Server confirmation
 ↓
Then update UI
```

Do not optimistically delete important project data.

------------------------------------------------------------------------

# 56. Error Recovery

If real-time connection drops:

``` text
CONNECTED
   ↓
DISCONNECTED
   ↓
RECONNECTING
   ↓
CONNECTED
   ↓
SYNC MISSED EVENTS / REFETCH
```

After reconnect:

``` text
lastKnownVersion
       ↓
serverVersion
       ↓
if mismatch:
    resync affected state
```

------------------------------------------------------------------------

# 57. DAA Integration

NEXUSFLOW 3.0 continues to use the 2.0 algorithmic foundation.

### Greedy

Task priority.

### 0/1 Knapsack

Sprint optimization.

### Topological Sort

Dependency execution ordering.

### Branch & Bound

Team-task assignment.

### Merge Sort

Ranking.

### Boyer-Moore

Search.

### BFS / DFS

Dependency traversal and graph analysis where justified.

Do not duplicate existing implementations.

3.0 intelligence should feed better inputs into these algorithms.

Example:

``` text
Verified Skills
+
Capacity
+
Task Requirements
+
Historical Performance
        ↓
Branch & Bound
        ↓
Recommended Assignment
```

The final assignment remains explainable and user-controlled.

------------------------------------------------------------------------

# 58. Project Health + DAA + AI

The responsibilities should remain separated.

``` text
DAA
 ↓
Deterministic optimization

AI
 ↓
Interpretation + recommendation + explanation

Database
 ↓
Persistence + relationships

Event System
 ↓
Synchronization

RAG
 ↓
Grounding

Knowledge Graph
 ↓
Relationships
```

Do not let AI replace deterministic algorithms that can solve the
problem reliably.

------------------------------------------------------------------------

# 59. Academic Mapping

NEXUSFLOW 3.0 becomes stronger as an academic project because multiple
concepts are demonstrated by one production system.

## DAA

-   Greedy
-   0/1 Knapsack
-   Branch & Bound
-   Topological Sort
-   Merge Sort
-   Boyer-Moore
-   BFS/DFS

## AI / ML

-   Gemini orchestration
-   structured generation
-   quiz generation
-   skill verification
-   risk prediction
-   recommendation
-   retrospective analysis
-   RAG
-   semantic retrieval
-   learning loop

## DBMS

-   normalized entities
-   relationships
-   indexes
-   history
-   audit
-   team membership
-   chat
-   task dependencies
-   opinions
-   decisions
-   project knowledge
-   analytics

## Computer Networks / Distributed Concepts

-   real-time communication
-   event propagation
-   client synchronization
-   presence
-   reconnect/resync

## Software Engineering

-   modular monolith
-   service layer
-   authorization
-   testing
-   versioning
-   observability
-   incremental delivery

------------------------------------------------------------------------

# 60. Security Architecture

Required:

-   OAuth security
-   secure password reset
-   hashed reset tokens
-   server-side secrets
-   authorization middleware
-   team membership checks
-   leader-only operations
-   rate limiting
-   input validation
-   schema validation
-   AI request limits
-   prompt injection protection
-   XSS protection
-   CSRF protection where applicable
-   secure cookie/session strategy
-   audit logs
-   safe file handling
-   GitHub OAuth/token security

Never expose:

``` text
AI provider secrets
GitHub access tokens
Password reset tokens
private user data
```

------------------------------------------------------------------------

# 61. AI Reliability Boundaries

Every AI output should be classified:

``` text
FACT
USER DATA
EXTERNAL SOURCE
AI INFERENCE
AI RECOMMENDATION
USER DECISION
```

Example:

``` text
FACT:
Team has 4 members.

VERIFIED DATA:
Python skill verified at 86%.

AI RECOMMENDATION:
Consider assigning the Python-heavy task to Preetam.

USER DECISION:
Team accepted assignment.
```

This makes the product academically and professionally defensible.

------------------------------------------------------------------------

# 62. Cost Strategy

Continue the 2.0 free-first philosophy.

Principles:

-   use free-tier infrastructure where appropriate
-   avoid unnecessary AI calls
-   cache structured AI outputs
-   reuse project context
-   use deterministic algorithms where possible
-   batch analysis
-   avoid duplicate embeddings
-   use event-driven updates instead of constant full reloads
-   keep provider abstraction
-   never assume a third-party free tier is permanent

For quizzes:

``` text
Generate once
 ↓
Store quiz version
 ↓
Reuse for attempts where appropriate
```

Do not generate new questions on every UI render.

------------------------------------------------------------------------

# 63. Observability

Production-quality 3.0 should track:

``` text
API latency
AI latency
AI failures
real-time connection failures
event processing failures
notification failures
email delivery failures
GitHub synchronization failures
quiz generation failures
database errors
authorization failures
```

Use structured logs.

Never log:

-   passwords
-   OAuth tokens
-   reset tokens
-   private chat content unnecessarily

------------------------------------------------------------------------

# 64. Testing Strategy

Each phase must include:

### Unit tests

Services, validators, algorithms.

### Integration tests

API + database.

### Authorization tests

Especially:

``` text
member attempts leader action
non-member accesses team
user edits teammate skill
removed member accesses project
```

### Real-time tests

``` text
A changes task
B receives update
```

``` text
A sends invitation
B receives notification
```

``` text
A leaves team
remaining members receive reason
```

### AI tests

Validate:

-   schema
-   missing fields
-   malformed responses
-   hallucinated values
-   prompt injection boundaries

### Regression tests

Every phase must verify that 2.0 functionality still works.

------------------------------------------------------------------------

# 65. End-to-End Real-Time Example

## User A creates a task

``` text
User A
 ↓
Create Task
 ↓
API
 ↓
TaskService
 ↓
MongoDB
 ↓
TASK_CREATED
 ↓
Event Dispatcher
 ├── User A client
 ├── User B client
 ├── User C client
 ├── Analytics
 ├── Risk Engine
 └── Notification logic
```

User B sees:

``` text
New task appears
```

without refreshing.

------------------------------------------------------------------------

# 66. End-to-End Invitation Example

``` text
Leader A
 ↓
Invite ravana@example.com
 ↓
InvitationService
 ↓
Invitation saved
 ↓
INVITATION_CREATED
 ├── notification
 ├── email
 └── realtime
      ↓
User B
      ↓
Bell +1
      ↓
Invitation card
      ↓
Accept
      ↓
INVITATION_ACCEPTED
      ↓
TEAM_MEMBER_JOINED
      ↓
Team member list updates
      ↓
All teammates see new member
```

------------------------------------------------------------------------

# 67. End-to-End Leave Example

``` text
Member B
 ↓
Leave Team
 ↓
Select "Academic workload"
 ↓
Confirm
 ↓
Membership updated
 ↓
TEAM_MEMBER_LEFT
 ↓
Remaining members receive notification
 ↓
Team roster updates
 ↓
Team health recalculated
 ↓
Open workload recalculated
 ↓
Risk engine checks capacity
```

This demonstrates why the event architecture matters.

------------------------------------------------------------------------

# 68. End-to-End Skill Verification Example

``` text
User adds:
Python
 ↓
Verify
 ↓
AI quiz generated
 ↓
Quiz stored
 ↓
User answers
 ↓
Backend evaluates
 ↓
86%
 ↓
Python VERIFIED
 ↓
Skill graph updated
 ↓
Team skill coverage recalculated
 ↓
Skill-gap warning recalculated
 ↓
Assignment recommendations improve
```

------------------------------------------------------------------------

# 69. End-to-End Opinion Example

``` text
Team asks:
MongoDB or PostgreSQL?
 ↓
Members vote
 ↓
Responses stored
 ↓
AI analyzes
 ↓
DBMS/project requirements retrieved
 ↓
Recommendation
 ↓
Team decides
 ↓
Decision stored
 ↓
Project Brain updated
 ↓
Architecture / tasks can reference decision
```

------------------------------------------------------------------------

# 70. End-to-End Sprint Learning Example

``` text
Sprint ends
 ↓
Collect:
tasks
effort
deadlines
GitHub activity
workload
blocks
 ↓
Retrospective
 ↓
AI summarizes
 ↓
Historical pattern extraction
 ↓
LearningPattern stored
 ↓
Next sprint planning
 ↓
Better estimates / warnings
```

------------------------------------------------------------------------

# 71. Feature Dependency Graph

Do not implement features randomly.

``` text
AUTH FOUNDATION
       ↓
USER / PROFILE
       ↓
TEAM MEMBERSHIP
       ↓
INVITATIONS
       ↓
NOTIFICATIONS
       ↓
REAL-TIME EVENT LAYER
       ↓
CHAT
       ↓
SKILL SYSTEM
       ↓
QUIZ VERIFICATION
       ↓
TEAM SKILL GRAPH
       ↓
SHARED PROJECT STATE
       ↓
GITHUB
       ↓
TEAM HEALTH
       ↓
RISK ENGINE
       ↓
OPINIONS / DECISIONS
       ↓
SPRINT RETROSPECTIVE
       ↓
LEARNING LOOP
       ↓
FULL 3.0 INTELLIGENCE
```

------------------------------------------------------------------------

# 72. Implementation Phases

## Phase 0 --- Baseline & Codebase Audit

Before changing anything:

-   run current application
-   inspect frontend
-   inspect backend
-   inspect database schemas
-   inspect authentication
-   inspect existing team logic
-   inspect invitations
-   inspect notifications
-   inspect tasks
-   inspect sprint
-   inspect graph
-   inspect Project AI
-   inspect chat if already present
-   inspect existing DAA implementations
-   identify duplicated code
-   establish regression checklist
-   document current routes
-   document current APIs

Do not modify code unnecessarily.

**Exit criteria:**

``` text
Current application runs
+
Existing features documented
+
Regression checklist ready
```

------------------------------------------------------------------------

## Phase 1 --- Authentication & Identity

Implement:

-   Google OAuth
-   email/password preservation
-   forgot password
-   reset email
-   secure reset tokens
-   session hardening
-   profile synchronization

Test:

-   new Google user
-   existing Google user
-   duplicate email behavior
-   invalid reset token
-   expired reset token
-   successful reset
-   session invalidation

------------------------------------------------------------------------

## Phase 2 --- Team Membership & Permissions

Implement:

-   role model
-   membership authorization
-   leader-only controls
-   self-only profile/skill editing
-   teammate profile view
-   leave team
-   leader removal
-   leader transfer if required
-   leader-only team deletion

Test every permission boundary.

------------------------------------------------------------------------

## Phase 3 --- Invitation + Notification Foundation

Implement:

-   invitation lifecycle
-   invitation deduplication
-   accept/reject
-   notification model
-   unread count
-   invitation email
-   dashboard notification centre
-   Join Team invitation surface

Important:

``` text
One invitation source of truth
+
Multiple UI surfaces
```

------------------------------------------------------------------------

## Phase 4 --- Real-Time Event Layer

Implement:

-   event envelope
-   event dispatcher
-   realtime transport/subscriptions
-   client event handlers
-   connection state
-   reconnect
-   resync
-   idempotency

First prove:

``` text
Task A changes
 → User B sees it without refresh
```

Then expand the same infrastructure to other domains.

------------------------------------------------------------------------

## Phase 5 --- Real-Time Team Collaboration

Implement:

-   member joined
-   member left
-   member removed
-   leadership changes
-   invitation changes
-   team notifications
-   leave reason notifications

Success condition:

> Two browsers logged into two different users remain synchronized
> without manual refresh.

------------------------------------------------------------------------

## Phase 6 --- Global + Team Chat

Implement:

-   conversations
-   messages
-   team chat
-   global/DM chat
-   unread counts
-   read state
-   real-time messages
-   reconnect
-   basic presence

Do not overbuild file sharing or calls yet.

------------------------------------------------------------------------

## Phase 7 --- Skill System

Implement:

-   skill catalogue
-   self-declared skills
-   skill editing
-   skill levels
-   skill verification state
-   skill history
-   teammate read-only skill view

------------------------------------------------------------------------

## Phase 8 --- AI Skill Verification

Implement:

-   Gemini quiz generation
-   structured output validation
-   quiz storage
-   answer submission
-   server-side evaluation
-   score
-   verification badge
-   attempt history
-   retake policy

Test malformed AI output aggressively.

------------------------------------------------------------------------

## Phase 9 --- Team Skill Graph + Skill Gap

Implement:

-   skill graph
-   required project skills
-   team coverage
-   verified coverage
-   unique-skill ownership
-   missing skills
-   recommendations

Integrate with existing Branch & Bound assignment.

------------------------------------------------------------------------

## Phase 10 --- Shared Project Workspace

Unify real-time state for:

-   Project AI
-   Tasks
-   Sprint
-   Graph
-   Architecture
-   Decisions
-   Recommendations
-   Research
-   Analytics

Goal:

``` text
User A changes task
 ↓
User B sees task change
 ↓
Project AI reads new state
 ↓
Risk/health state updates
```

Copilot conversations remain user-scoped unless shared.

------------------------------------------------------------------------

## Phase 11 --- GitHub Integration

Implement:

-   GitHub OAuth/connection
-   repository linking
-   commit ingestion
-   PR ingestion
-   issue references
-   activity normalization
-   task correlation
-   development timeline

Keep recommendations human-controlled.

------------------------------------------------------------------------

## Phase 12 --- Team Health

Implement:

-   completion rate
-   deadline adherence
-   workload balance
-   blocked work
-   participation balance
-   skill coverage
-   stale task ratio

Add:

``` text
Team Health
+
Explanation
+
Recommendation
```

------------------------------------------------------------------------

## Phase 13 --- Risk Intelligence

Implement:

-   deadline risk
-   dependency bottleneck
-   skill gap
-   workload imbalance
-   stale work
-   GitHub inactivity signals
-   unresolved decision risk
-   research readiness risk

Every risk needs evidence.

------------------------------------------------------------------------

## Phase 14 --- Opinions + AI + DBMS Decision System

Implement:

-   opinion requests
-   voting
-   optional reasoning
-   AI synthesis
-   deterministic criteria
-   recommendation
-   final decision
-   decision history

Make this a first-class DBMS-backed project feature.

------------------------------------------------------------------------

## Phase 15 --- AI Sprint Retrospective

Implement:

-   sprint metrics
-   planned vs actual
-   effort accuracy
-   blocked work
-   GitHub signals
-   workload distribution
-   AI retrospective
-   accepted/ignored recommendations

Do not automatically change future plans.

------------------------------------------------------------------------

## Phase 16 --- NEXUSFLOW Learning Loop

Implement:

-   historical pattern detection
-   evidence aggregation
-   learning pattern storage
-   confidence
-   future sprint recommendations
-   estimation improvement
-   recurring risk detection

Only surface patterns when enough evidence exists.

------------------------------------------------------------------------

## Phase 17 --- Project Brain Integration

Integrate:

``` text
Project Context
+
RAG
+
Knowledge Graph
+
Team Skills
+
Decisions
+
GitHub
+
Retrospectives
+
Learning Patterns
```

The Copilot should now understand both:

``` text
WHAT the project is
+
HOW the team actually works
```

------------------------------------------------------------------------

## Phase 18 --- Frontend Excellence Pass

Audit every screen.

Fix:

-   spacing
-   typography
-   inconsistent buttons
-   inconsistent icons
-   modal sizing
-   responsive behavior
-   accessibility
-   loading states
-   empty states
-   error states
-   notification UX
-   realtime status
-   confirmation flows
-   toast feedback

No feature is considered complete if its UI has no meaningful
loading/error/empty state.

------------------------------------------------------------------------

## Phase 19 --- Production Hardening

Implement:

-   authorization audit
-   validation audit
-   rate limiting
-   AI usage limits
-   caching
-   event retry
-   idempotency
-   logging
-   monitoring
-   email failure handling
-   realtime reconnect
-   database indexes
-   query optimization
-   security review
-   responsive testing

------------------------------------------------------------------------

## Phase 20 --- Full Integration & Regression

Test complete journeys:

### Journey A

``` text
Register
 → Create profile
 → Create team
 → Invite user
 → User receives realtime notification
 → Accept
 → Team updates for both
```

### Journey B

``` text
Add skill
 → Take quiz
 → Verify
 → Skill graph updates
 → Skill gap changes
```

### Journey C

``` text
Create task
 → Sprint
 → GitHub work
 → Completion
 → Analytics
 → Retrospective
 → Learning pattern
 → Better next sprint
```

### Journey D

``` text
Member leaves
 → reason
 → teammates notified
 → roster updates
 → health recalculated
 → risks recalculated
```

------------------------------------------------------------------------

# 73. Development Agent Rules

Any AI coding agent working on NEXUSFLOW 3.0 must follow:

1.  Inspect existing code first.
2.  Do not rewrite stable modules unnecessarily.
3.  Reuse existing algorithms.
4.  Reuse existing APIs where appropriate.
5.  Avoid duplicate state sources.
6.  Keep schemas additive.
7.  Keep secrets server-side.
8.  Never trust client roles.
9.  Verify authorization server-side.
10. Keep AI behind the provider abstraction.
11. Validate AI structured output.
12. Never let AI perform destructive actions silently.
13. Build real-time synchronization from domain events.
14. Make event handlers idempotent.
15. Test each phase independently.
16. Run frontend type checks after frontend changes.
17. Run backend tests/syntax checks after backend changes.
18. Test with two users whenever real-time functionality is changed.
19. Do not commit/push unless explicitly instructed.
20. Before claiming completion, report:
    -   files changed
    -   files created
    -   APIs added/changed
    -   schema changes
    -   events added
    -   permissions changed
    -   tests run
    -   known limitations
    -   remaining risks

------------------------------------------------------------------------

# 74. What NOT to Build Yet

Do not overengineer 3.0.

Avoid initially:

-   Kafka
-   Kubernetes
-   microservices
-   dedicated graph database
-   blockchain for normal data
-   autonomous coding agents
-   autonomous Git pushes
-   arbitrary code execution
-   complex video conferencing
-   full Slack clone
-   full Jira clone
-   surveillance-style activity tracking
-   expensive AI pipelines
-   permanent dependence on a paid AI provider

Start with:

> **Modular monolith + MongoDB + real-time transport + clean event
> layer + provider-independent AI.**

------------------------------------------------------------------------

# 75. Final NEXUSFLOW 3.0 Architecture

``` text
                           NEXUSFLOW 3.0
                                 |
                  +--------------+--------------+
                  |                             |
                  v                             v
             IDENTITY                      COLLABORATION
                  |                             |
        Google / Password                 Teams / Chat
        Profile / Roles                   Invitations
        Reset Email                       Notifications
                  |                             |
                  +--------------+--------------+
                                 |
                                 v
                         REAL-TIME EVENT LAYER
                                 |
          +----------------------+----------------------+
          |                      |                      |
          v                      v                      v
       PROJECT                TEAM                  DEVELOPMENT
          |                      |                      |
     Tasks / Sprint         Skills / Health          GitHub
     Graph / AI             Opinions                 Activity
     Decisions              Membership               PRs/Commits
          |                      |                      |
          +----------------------+----------------------+
                                 |
                                 v
                         PROJECT INTELLIGENCE
                                 |
        +------------+------------+------------+------------+
        |            |            |            |            |
        v            v            v            v            v
      RISK        HEALTH       SKILL GAP   LEARNING    RETROSPECTIVE
        |            |            |            |            |
        +------------+------------+------------+------------+
                                 |
                                 v
                          AI ORCHESTRATOR
                                 |
                  +--------------+--------------+
                  |              |              |
                  v              v              v
                 RAG          GRAPH           TOOLS
                  |              |              |
                  +--------------+--------------+
                                 |
                                 v
                          PROJECT COPILOT
                                 |
                                 v
                         RECOMMENDATIONS
                                 |
                                 v
                          USER DECISIONS
                                 |
                                 v
                           PROJECT BRAIN
                                 |
                                 v
                         NEXT SPRINT / PLAN
```

------------------------------------------------------------------------

# 76. NEXUSFLOW 3.0 Core Data Loop

The complete product loop becomes:

``` text
PEOPLE
  ↓
FORM TEAM
  ↓
VERIFY SKILLS
  ↓
UNDERSTAND PROJECT
  ↓
DESIGN ARCHITECTURE
  ↓
MAKE DECISIONS
  ↓
PLAN TASKS
  ↓
OPTIMIZE SPRINT
  ↓
BUILD
  ↓
CHAT / COLLABORATE
  ↓
GITHUB ACTIVITY
  ↓
REAL-TIME PROJECT STATE
  ↓
HEALTH + RISK ANALYSIS
  ↓
SPRINT RETROSPECTIVE
  ↓
LEARN
  ↓
REPLAN
  ↓
BUILD BETTER
```

------------------------------------------------------------------------

# 77. NEXUSFLOW 3.0 Success Criteria

NEXUSFLOW 3.0 is successful when two or more students can use the
application simultaneously and experience one coherent project
workspace.

A successful system must support:

``` text
✓ Google OAuth
✓ Secure password reset email
✓ Profiles
✓ Team creation
✓ Team invitations
✓ Realtime invitation notifications
✓ Accept / reject invitations
✓ Leader-only member management
✓ Member self-leave
✓ Leave reason visibility
✓ Leader-only team deletion
✓ Teammate profile viewing
✓ Self-only skill editing
✓ Skill verification quizzes
✓ Verified skill badges
✓ Team skill graph
✓ Skill-gap warnings
✓ Global chat
✓ Team chat
✓ Realtime messages
✓ Realtime task synchronization
✓ Realtime sprint synchronization
✓ Realtime graph synchronization
✓ Shared Project AI state
✓ GitHub integration
✓ Development activity
✓ Team health
✓ Risk prediction
✓ Opinion collection
✓ AI opinion synthesis
✓ DBMS-backed decision history
✓ AI sprint retrospective
✓ Learning loop
✓ Project Brain
✓ RAG
✓ Knowledge Graph
✓ Explainable recommendations
✓ Strong authorization
✓ Error/loading/empty states
✓ Reconnect/resync
✓ Regression-safe 2.0 compatibility
```

------------------------------------------------------------------------

# 78. Final Product Definition

> **NEXUSFLOW 3.0 is not just a smarter task manager.**
>
> It is a shared, real-time project operating system for students.

It understands:

``` text
WHO is working
WHAT they know
WHAT the project needs
WHAT the team decided
WHAT everyone is doing
WHAT has changed
WHAT is going wrong
WHAT GitHub shows
WHAT the team thinks
WHAT the team learned
WHAT should happen next
```

And it connects those pieces:

``` text
IDENTITY
   ↓
TEAM
   ↓
VERIFIED SKILLS
   ↓
PROJECT KNOWLEDGE
   ↓
DECISIONS
   ↓
TASKS
   ↓
SPRINTS
   ↓
REAL EXECUTION
   ↓
GITHUB
   ↓
HEALTH
   ↓
RISKS
   ↓
RETROSPECTIVE
   ↓
LEARNING
   ↓
BETTER PLANNING
```

The system therefore evolves from:

> **"Manage my project."**

to:

> **"Understand my project, understand my team, keep everyone
> synchronized, help us make better decisions, warn us before problems
> become failures, and learn from how we actually work."**

------------------------------------------------------------------------

# 79. Core Philosophy

1.  **AI assists; students decide.**
2.  **Verified skills are evidence, not absolute proof of expertise.**
3.  **Self-declared and verified skills remain separate.**
4.  **Team permissions are enforced server-side.**
5.  **A member can control their own profile and skills, not another
    member's.**
6.  **Only authorized leaders can manage membership and delete teams.**
7.  **Leaving a team is allowed and transparent.**
8.  **Important team changes generate visible events.**
9.  **Shared project state is synchronized in real time.**
10. **Copilot conversations can remain personal even when project state
    is shared.**
11. **GitHub activity is evidence, not automatic proof of task
    completion.**
12. **Warnings and recommendations do not silently mutate project
    state.**
13. **DAA handles deterministic optimization.**
14. **AI handles interpretation, synthesis and recommendation.**
15. **RAG grounds AI in project knowledge.**
16. **Knowledge Graph represents project relationships.**
17. **Events synchronize the application.**
18. **Retrospectives create historical knowledge.**
19. **Learning patterns must be evidence-backed.**
20. **Every phase is tested before the next phase begins.**
21. **Existing working functionality must remain intact.**
22. **Free-first architecture remains the default.**
23. **The architecture should be scalable without premature
    distributed-system complexity.**

------------------------------------------------------------------------

# 80. NEXUSFLOW 3.0 End State

``` text
                         "WE HAVE AN IDEA"
                                  |
                                  v
                         FORM THE RIGHT TEAM
                                  |
                                  v
                         VERIFY OUR SKILLS
                                  |
                                  v
                         UNDERSTAND THE IDEA
                                  |
                                  v
                           RESEARCH IT
                                  |
                                  v
                          DESIGN THE SYSTEM
                                  |
                                  v
                         DISCUSS + DECIDE
                                  |
                                  v
                          PLAN THE WORK
                                  |
                                  v
                            OPTIMIZE IT
                                  |
                                  v
                             BUILD IT
                                  |
                                  v
                       COLLABORATE IN REAL TIME
                                  |
                                  v
                         OBSERVE DEVELOPMENT
                                  |
                                  v
                         DETECT RISKS EARLY
                                  |
                                  v
                         COMPLETE THE SPRINT
                                  |
                                  v
                         REFLECT + LEARN
                                  |
                                  v
                         IMPROVE THE NEXT PLAN
                                  |
                                  v
                        "WE CAN BUILD THIS"
```

------------------------------------------------------------------------

# 81. Final Engineering Principle

Every NEXUSFLOW 3.0 phase follows:

``` text
PLAN
 ↓
INSPECT EXISTING CODE
 ↓
DESIGN
 ↓
IMPLEMENT
 ↓
UNIT TEST
 ↓
INTEGRATION TEST
 ↓
REAL-TIME TEST WITH MULTIPLE USERS
 ↓
REGRESSION CHECK
 ↓
DOCUMENT
 ↓
ONLY THEN MOVE FORWARD
```

A feature is **not complete** merely because the button works.

It is complete only when:

``` text
Frontend
+
Backend
+
Database
+
Authorization
+
Error handling
+
Loading/empty states
+
Real-time synchronization
+
Persistence
+
Testing
+
Existing-feature compatibility
```

all work together.

------------------------------------------------------------------------

# NEXUSFLOW 3.0

## From Project Management → Project Intelligence → Project Operating System

**Version 2.0 taught NEXUSFLOW how to understand and plan a project.**

**Version 3.0 teaches NEXUSFLOW how people form teams, prove skills,
collaborate, execute, synchronize, learn and improve together.**
