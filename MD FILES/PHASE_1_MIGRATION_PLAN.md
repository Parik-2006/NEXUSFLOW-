# NEXUSFLOW 2.0 — Phase 1: Migration Plan

> **Purpose:** Step-by-step guide for safely deploying Phase 1 changes to an existing NEXUSFLOW installation.
> The goal is zero downtime, zero data loss, and a fully reversible migration.

---

## Overview

Phase 1 introduces **additive-only database changes**:
- 8 new Mongoose models (new MongoDB collections — don't conflict with existing)
- 2 optional new fields on existing models (both default to `null` — no existing documents break)
- 1 new route file (new endpoints, no changes to existing endpoints)

**Existing data is never deleted or modified by the code changes alone.**
The optional migration script (`migratePhase1.js`) backfills data as a separate, controllable step.

---

## Pre-Migration Checklist

Before running any migration steps, verify the following:

- [ ] MongoDB is running and accessible
- [ ] You have a database backup (see Step 0 below)
- [ ] Node.js >= 18 is installed (`node --version`)
- [ ] You are on the `version2.0` branch (or the correct development branch)
- [ ] The existing server starts without errors on the current code

---

## Step 0: Database Backup (CRITICAL)

Before any code deployment, back up your MongoDB database.

### Option A: mongodump (local MongoDB)
```bash
mongodump --db nexusflow --out ./backups/pre_phase1_backup
```

### Option B: MongoDB Atlas (cloud)
In MongoDB Atlas:
1. Go to your cluster → Backup → Take Snapshot
2. Wait for snapshot to complete
3. Note the snapshot ID for potential restore

### Option C: Export collections directly
```bash
mongoexport --db nexusflow --collection teams --out ./backups/teams.json
mongoexport --db nexusflow --collection tasks --out ./backups/tasks.json
```

> [!CAUTION]
> Do not skip this step. Even though Phase 1 changes are additive, always back up before any database migration.

---

## Step 1: Deploy Code Changes

The following files were created or modified by Phase 1:

### New Files (no conflicts with existing)
```
server/models/Project.js
server/models/Decision.js
server/models/ResearchItem.js
server/models/Recommendation.js
server/models/ArchitectureComponent.js
server/models/Resource.js
server/models/AIConversation.js
server/models/AIMessage.js
server/routes/projects.js
server/scripts/migratePhase1.js
server/scripts/testPhase1DataFoundation.js
PHASE_1_DATABASE_ARCHITECTURE.md
PHASE_1_MIGRATION_PLAN.md
```

### Modified Files (additive-only changes)
```
server/models/Task.js      — Added: optional projectId field, 2 new indexes
server/models/Team.js      — Added: optional activeProjectId field
server/index.js            — Added: import + mount projectRoutes
```

### Deploy the code:
```bash
# On the version2.0 branch, pull the latest changes
# (or copy files to the deployment environment)
```

---

## Step 2: Verify Syntax (Safety Check)

After deploying code, verify all files are syntactically correct before starting the server:

```bash
cd server
node --check index.js models/Team.js models/Task.js models/Project.js models/Decision.js \
  models/ResearchItem.js models/Recommendation.js models/ArchitectureComponent.js \
  models/Resource.js models/AIConversation.js models/AIMessage.js \
  routes/teams.js routes/projects.js socket/taskHandlers.js socket/aiOrchestrator.js
```

**Expected output:** No output = all files pass (exit code 0).

---

## Step 3: Run Static Tests

Run the verification test suite (no MongoDB connection required):

```bash
cd server
node scripts/testPhase1DataFoundation.js
```

**Expected output:**
```
[ 1. Model Imports ]           — 10 ✓
[ 2. Schema Structure ]        — 12 ✓
[ 3. Index Definitions ]       — 4 ✓
[ 4. Validation Rules ]        — 0 in static mode
[ 5. Backward Compatibility ]  — 6 ✓
[ 6. Routes Import ]           — 1 ✓

TEST RESULTS: 29 Passed, 0 Failed
```

If any test fails, **do not proceed**. Investigate and fix before continuing.

---

## Step 4: Start the Server (Test Deploy)

```bash
cd server
npm start
# or: node index.js
```

The server should start with the existing behavior plus the new `/api/projects` routes registered.

### Verify existing endpoints still work:
```bash
# Team routes (must return existing data unchanged)
curl http://localhost:3001/api/teams/<teamId>
curl http://localhost:3001/api/tasks/<teamId>
```

### Verify new endpoints are reachable:
```bash
curl -H "Authorization: Bearer <token>" http://localhost:3001/api/projects
# Expected: [] (empty array — no projects yet)
```

---

## Step 5: Run the Migration Script (Optional but Recommended)

> [!IMPORTANT]
> This step is OPTIONAL for Phase 1 to work. Existing teams and tasks continue working with `projectId=null` and `activeProjectId=null`. The migration script backfills these to make the data cleaner.

### First, do a DRY RUN to see what will happen:

```bash
cd server
DRY_RUN=true MONGO_URI=mongodb://localhost:27017/nexusflow node scripts/migratePhase1.js
```

**Sample dry run output:**
```
======================================================================
NEXUSFLOW 2.0 — Phase 1 Database Migration
Mode: DRY RUN (no writes)
======================================================================
✓ MongoDB connected

Found 3 teams without an active project.

Processing team: "Team Alpha" (64a1b2c3...)
  → Project title: "Smart Irrigation System"
  → Project description: "An IoT system that monitors soil moisture..."
  → Tasks to backfill: 24
  [DRY RUN] Would create Project "Smart Irrigation System"
  [DRY RUN] Would backfill 24 tasks with projectId
  [DRY RUN] Would set Team.activeProjectId

...

MIGRATION SUMMARY
Teams processed:   3 / 3
Projects created:  3
Tasks backfilled:  67
⚠️  DRY RUN — No changes were written to the database.
```

### If the dry run looks correct, run the live migration:

```bash
cd server
MONGO_URI=mongodb://localhost:27017/nexusflow node scripts/migratePhase1.js
```

**The script is idempotent** — running it multiple times is safe. Teams with `activeProjectId` already set are skipped.

---

## Step 6: Full Verification with Live Database

After migration, run the test suite with a live database connection to verify end-to-end data operations:

```bash
cd server
MONGO_URI=mongodb://localhost:27017/nexusflow node scripts/testPhase1DataFoundation.js
```

This runs all static tests PLUS the live MongoDB tests. The live tests:
1. Create a test team
2. Create a project with full context
3. Create decisions, research items, recommendations, architecture components, resources
4. Create an AI conversation with messages
5. Run aggregation queries
6. Clean up all test data

**Expected:** All tests pass, test data is deleted in cleanup.

---

## Step 7: Post-Migration Validation

After migration, verify data integrity in the database:

```js
// In MongoDB shell or Compass:

// 1. Verify all teams have activeProjectId set
db.teams.find({ activeProjectId: null }).count()
// Expected: 0 (after migration)

// 2. Verify all tasks have projectId set
db.tasks.find({ projectId: null }).count()
// Expected: 0 (after migration)

// 3. Verify project count matches team count (1:1 for initial migration)
db.projects.countDocuments()
// Expected: Same as db.teams.countDocuments()

// 4. Verify no team data was corrupted (existing fields intact)
db.teams.findOne()
// Must have: name, members, projectTitle, projectDescription, taskCount, doneCount
// Must also have (new): activeProjectId (pointing to a valid Project)
```

---

## Rollback Plan

If something goes wrong, rollback is straightforward:

### Option A: Restore backup
```bash
mongorestore --db nexusflow ./backups/pre_phase1_backup/nexusflow
```

### Option B: Revert only the migration (keep new code)
```js
// In MongoDB shell:
// 1. Remove all new Project documents
db.projects.deleteMany({})

// 2. Clear projectId from all tasks
db.tasks.updateMany({}, { $set: { projectId: null } })

// 3. Clear activeProjectId from all teams
db.teams.updateMany({}, { $set: { activeProjectId: null } })

// 4. The new collections are now empty — no effect on system
// 5. The new routes still work, they'll just return empty data
```

### Option C: Full code rollback
Revert `server/models/Task.js`, `server/models/Team.js`, and `server/index.js` to their pre-Phase 1 versions. The new model files and routes can remain (they don't cause errors if not used).

---

## MongoDB Index Creation

When the server starts for the first time after Phase 1, Mongoose automatically creates the new indexes defined in the schemas. This happens in the background and may take a moment on large collections.

For large databases (>100K tasks), create indexes manually before starting the server:

```js
// In MongoDB shell:
db.tasks.createIndex({ projectId: 1, priorityScore: -1 }, { background: true })
db.tasks.createIndex({ projectId: 1, topoOrder: 1 }, { background: true })
db.projects.createIndex({ teamId: 1, createdAt: -1 }, { background: true })
db.decisions.createIndex({ projectId: 1, createdAt: -1 }, { background: true })
db.researchitems.createIndex({ projectId: 1, relevance: -1 }, { background: true })
// ... etc for all new collections
```

Using `{ background: true }` prevents the database from locking during index creation.

---

## Summary: What Changed at Each Level

| Layer | Change | Impact on Existing System |
|-------|--------|--------------------------|
| **MongoDB** | 8 new collections | None — new collections don't affect existing queries |
| **Mongoose** | 2 optional fields added to Task/Team | None — defaults to `null`, existing docs valid |
| **Node.js** | 8 new model files imported | None — models register only when imported |
| **Express** | 1 new route file mounted at `/api` | None — new path prefix, no conflicts |
| **Algorithms** | No changes | Unchanged — all algorithms run as before |
| **Socket.IO** | No changes | Unchanged — all events fire as before |
| **Frontend** | No changes | Unchanged — no frontend code modified |

**Total risk to existing functionality: ZERO.**

---

## Files Created/Modified Summary

| File | Type | Description |
|------|------|-------------|
| [`server/models/Project.js`](file:///p:/DAA%20OPTIONAL/server/models/Project.js) | NEW | Central project entity with embedded context |
| [`server/models/Decision.js`](file:///p:/DAA%20OPTIONAL/server/models/Decision.js) | NEW | Architecture decision records |
| [`server/models/ResearchItem.js`](file:///p:/DAA%20OPTIONAL/server/models/ResearchItem.js) | NEW | Research findings storage |
| [`server/models/Recommendation.js`](file:///p:/DAA%20OPTIONAL/server/models/Recommendation.js) | NEW | AI advisor suggestions |
| [`server/models/ArchitectureComponent.js`](file:///p:/DAA%20OPTIONAL/server/models/ArchitectureComponent.js) | NEW | System architecture layers |
| [`server/models/Resource.js`](file:///p:/DAA%20OPTIONAL/server/models/Resource.js) | NEW | Project resource inventory |
| [`server/models/AIConversation.js`](file:///p:/DAA%20OPTIONAL/server/models/AIConversation.js) | NEW | AI chat session header |
| [`server/models/AIMessage.js`](file:///p:/DAA%20OPTIONAL/server/models/AIMessage.js) | NEW | Individual AI chat messages |
| [`server/routes/projects.js`](file:///p:/DAA%20OPTIONAL/server/routes/projects.js) | NEW | REST API for all Phase 1 entities |
| [`server/scripts/migratePhase1.js`](file:///p:/DAA%20OPTIONAL/server/scripts/migratePhase1.js) | NEW | Idempotent migration script |
| [`server/scripts/testPhase1DataFoundation.js`](file:///p:/DAA%20OPTIONAL/server/scripts/testPhase1DataFoundation.js) | NEW | 29-test verification suite |
| [`server/models/Task.js`](file:///p:/DAA%20OPTIONAL/server/models/Task.js) | MODIFIED | +projectId (optional, null default) |
| [`server/models/Team.js`](file:///p:/DAA%20OPTIONAL/server/models/Team.js) | MODIFIED | +activeProjectId (optional, null default) |
| [`server/index.js`](file:///p:/DAA%20OPTIONAL/server/index.js) | MODIFIED | +import + mount projectRoutes |
| [`PHASE_1_DATABASE_ARCHITECTURE.md`](file:///p:/DAA%20OPTIONAL/PHASE_1_DATABASE_ARCHITECTURE.md) | NEW | Architecture education document |
| [`PHASE_1_MIGRATION_PLAN.md`](file:///p:/DAA%20OPTIONAL/PHASE_1_MIGRATION_PLAN.md) | NEW | This document |

---

*NEXUSFLOW 2.0 — Phase 1: Database Architecture & Data Foundation*
