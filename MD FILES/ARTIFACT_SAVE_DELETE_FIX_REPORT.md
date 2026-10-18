# Artifact Save & Delete Persistence Fix Report

**Status:** `PASS` — Fully Implemented, Persisted, Gated & Verified  
**Date:** October 13, 2026  
**Repository Branch:** `version4.0`  
**Starting Commit SHA:** `3a95d67247fd22f2d3c4a4d0421e77f7829826a6`  
**Application Endpoints:** Frontend at `http://localhost:8081` | Backend at `http://localhost:4000`  
**Zero-Cost AI Policy:** Strictly Preserved ($0.00 cost)  
**GitHub Push:** None (Working directory preserved, zero git commits or pushes performed)  

---

## 1. Exact Root Cause of "project.save is not a function"

1. **`findProject` Helper Returned Lean JavaScript POJOs**:
   In `server/routes/projects.js`, line 144:
   ```javascript
   const project = await Project.findById(projectId).lean();
   ```
   Calling `.lean()` instructs Mongoose to skip document hydration and return a plain JavaScript object (POJO) instead of a live Mongoose Document. Plain JavaScript objects do not inherit Mongoose model prototype methods, meaning `project.save` is `undefined`.

2. **Route Handlers Attempted to Call `await project.save()` on POJOs**:
   In `POST /api/projects/:projectId/artifacts` (and subsequent Waterfall plan mutation routes):
   ```javascript
   const project = await findProject(req.params.projectId, res, req.user);
   // ...
   project.artifacts.push(newArtifact);
   await project.save(); // Threw TypeError: project.save is not a function
   ```
   This error was caught by the route's `catch (e)` block and returned as HTTP 500:
   ```json
   { "error": "project.save is not a function" }
   ```

3. **Frontend UI Displayed the Unhandled Exception**:
   In `client/components/workspace/PlanPanel.tsx`:
   ```typescript
   const err = await res.json();
   toast(err.error || "Failed to save artifact", "error");
   ```
   The toast displayed `project.save is not a function`. Because the server threw an exception before persisting anything to MongoDB Atlas, the artifact was dropped and the artifact list displayed `"No project artifacts uploaded yet"`.

---

## 2. Exact Root Cause of Delete Failure

1. **Deletion Route Also Invoked `findProject` and Failed on `.save()`**:
   In `DELETE /api/projects/:projectId/artifacts/:artifactId`:
   ```javascript
   const project = await findProject(req.params.projectId, res, req.user);
   // ...
   await project.save(); // Threw TypeError: project.save is not a function
   ```
   Just as in the save workflow, the deletion endpoint threw `TypeError: project.save is not a function` and failed with HTTP 500.

2. **Missing Response Validation & Error Notification in Frontend**:
   In `PlanPanel.tsx`, `handleDeleteArtifact` lacked an `else` branch for non-200 responses:
   ```typescript
   if (res.ok) {
     const data = await res.json();
     setArtifacts(data.artifacts || []);
     toast("Artifact removed.", "info");
   }
   // Missing else: no toast or user feedback on 500 failure
   ```
   When the delete call failed on the backend, the user saw no toast, and the item remained in the UI list because the deletion request was rejected.

3. **Missing Subdocument Array Mutation Flag & Error Handling**:
   Reassigning `project.artifacts = ...` without calling `project.markModified("artifacts")` or checking if the artifact actually existed meant 404 cases were not cleanly returned to the caller.

---

## 3. Files Changed and Purpose of Each Change

| File Path | Purpose of Changes |
| :--- | :--- |
| `server/models/Project.js` | Added explicit `_id: { type: mongoose.Schema.Types.ObjectId, default: () => new mongoose.Types.ObjectId() }` to the `artifacts` subdocument schema array to guarantee stable, unique identifiers across all documents. |
| `server/routes/projects.js` | 1. Extended `findProject` to support `{ lean = true }` option.<br>2. Implemented `findProjectDoc(projectId, res, user)` returning a live Mongoose Document.<br>3. Rewrote `POST /projects/:projectId/artifacts` to validate inputs, assign stable ObjectIds, sync persistent artifacts to `ProjectMemory` as `IMPORTANT_ARTIFACT`, and call `await project.save()`.<br>4. Rewrote `DELETE /projects/:projectId/artifacts/:artifactId` to check artifact existence (return 404 if absent), clean up linked `ProjectMemory` records, mark modified, and persist deletion.<br>5. Converted all plan mutation routes (`extract`, `scope`, `conflicts`, `readiness`, `finalize`) to use `findProjectDoc` so `.save()` executes cleanly. |
| `client/components/workspace/PlanPanel.tsx` | 1. Added `savingArtifact` loading state to prevent duplicate submissions on double-clicks.<br>2. Added `deletingArtifactId` loading state and spinner feedback on trash buttons.<br>3. Refetched canonical plan state (`await fetchPlan()`) after successful save and delete.<br>4. Kept modal open and input text intact upon error so user never loses multiline Markdown, headings, or tables on network failures.<br>5. Added error-toast handling on deletion failure. |
| `server/scripts/testArtifactSaveDeletePersistence.js` | Added end-to-end regression test suite covering Save, Delete, Error Handling (400, 404), and Cross-Project Isolation (403). |

---

## 4. API Endpoints Used for Create and Delete

### 4.1 Create / Upload Artifact
- **Endpoint**: `POST /api/projects/:projectId/artifacts`
- **Authentication**: `Bearer <JWT_TOKEN>`
- **Authorization**: Team owner, team member, or admin role.
- **Request Body**:
  ```json
  {
    "name": "Threat Intelligence Specification",
    "artifactType": "srs",
    "scope": "persistent",
    "content": "# Threat Intelligence Specification\n..."
  }
  ```
- **Validation**:
  - `name` required (returns 400 if missing or whitespace).
  - `content` required (returns 400 if missing or whitespace).
  - `scope` constrained to `"persistent"` or `"temporary"`.
- **Response**: HTTP 201 Created
  ```json
  {
    "success": true,
    "artifact": {
      "_id": "6ace51c1f7bbf7a5d10014da",
      "name": "Threat Intelligence Specification",
      "artifactType": "srs",
      "content": "# Threat Intelligence Specification\n...",
      "scope": "persistent",
      "fileSize": 384,
      "uploadedAt": "2026-10-13T15:44:01.000Z"
    },
    "artifacts": [ ... ],
    "lifecycle": { ... }
  }
  ```

### 4.2 Delete Artifact
- **Endpoint**: `DELETE /api/projects/:projectId/artifacts/:artifactId`
- **Authentication**: `Bearer <JWT_TOKEN>`
- **Authorization**: Team owner, team member, or admin role.
- **Validation**:
  - `artifactId` required.
  - Returns HTTP 404 if artifact does not exist in the project.
- **Response**: HTTP 200 OK
  ```json
  {
    "success": true,
    "message": "Artifact removed successfully.",
    "deletedArtifactId": "6ace51c1f7bbf7a5d10014da",
    "artifacts": [ ... ],
    "lifecycle": { ... }
  }
  ```

---

## 5. Persistence Confirmation from the Database

Direct inspection of MongoDB Atlas confirmed:
1. `Project.findById(projectId).artifacts`:
   - Contains the exact Markdown text with all headings, bullet points, and acceptance criteria preserved.
   - Assigned a stable `_id: ObjectId`.
   - Updated `fileSize` and `uploadedAt` timestamps.
2. `ProjectMemory`:
   - When saved with `scope: "persistent"`, a companion record was successfully persisted in `ProjectMemory` with `category: "IMPORTANT_ARTIFACT"`, `scope: "persistent"`, and tags indexing the artifact ID.
   - Upon deletion, `ProjectMemory.deleteMany` cleanly pruned the linked memory record.

---

## 6. Confirmation that Refresh Preserves State

1. **Save Refresh Test**:
   Calling `GET /api/projects/:projectId/plan` immediately after `POST /artifacts` returns the newly persisted artifact with its `_id`, name, and content.
2. **Delete Refresh Test**:
   Calling `GET /api/projects/:projectId/plan` immediately after `DELETE /artifacts/:artifactId` confirms the item is completely absent from the array.
3. **Database Survives Server Restarts**:
   Both backend restart and page refresh retrieve canonical records straight from MongoDB Atlas.

---

## 7. Confirmation that Existing PhishShield Artifacts Were Preserved

- Project `6ace4bddae858d8bf82c042c` (`PhishShield — Phishing Detection`) and all existing project data were verified before and after test execution.
- Initial artifact count was recorded and verified equal to the final artifact count after regression testing.
- No existing tasks, requirements, or database collections were wiped or modified.

---

## 8. Regression Test Commands and Actual Results

### 8.1 Dedicated Artifact Persistence Test Suite
**Command:** `node scripts/testArtifactSaveDeletePersistence.js`
```
================================================================================
   NEXUSFLOW ARTIFACT SAVE & DELETE PERSISTENCE TEST SUITE
================================================================================
Connected to MongoDB Atlas

Testing with Project: "PhishShield — Phishing Detection" (6ace4bddae858d8bf82c042c)
Testing with User: "PARIKSHITH" (parikshithbb.cs25@rvce.edu.in)

--- TEST A: Save Artifact Persistence ---
  [PASS] Save returned HTTP 201 Created (got 201)
  [PASS] Response indicated success: true
  [PASS] No error returned in response
  [PASS] No 'project.save is not a function' error occurred
  [PASS] Artifact returned with stable _id: 6ace51c1f7bbf7a5d10014da
  [PASS] Artifact name matches input
  [PASS] Artifact scope is 'persistent'
  [PASS] Multiline Markdown content preserved exactly
  [PASS] Artifact exists in MongoDB project.artifacts collection
  [PASS] MongoDB content matches submitted multiline Markdown
  [PASS] Persistent artifact synced to ProjectMemory with category IMPORTANT_ARTIFACT
  [PASS] Refetch plan returned HTTP 200
  [PASS] Artifact is present in refreshed artifact list from server

--- TEST B: Delete Artifact Persistence ---
  [PASS] Delete returned HTTP 200 OK (got 200)
  [PASS] Delete indicated success: true
  [PASS] Deleted artifact ID matches target
  [PASS] Artifact is completely absent from MongoDB project.artifacts
  [PASS] Linked ProjectMemory record was removed upon artifact deletion
  [PASS] Artifact remains absent after server refresh/refetch
  [PASS] Pre-existing artifact count preserved (initial: 0, current: 0)

--- TEST C: Error Handling & Input Validation ---
  [PASS] Save with missing name correctly rejected with HTTP 400
  [PASS] Error message returned: "Artifact name is required"
  [PASS] Save with missing content correctly rejected with HTTP 400
  [PASS] Error message returned: "Artifact content is required"
  [PASS] Delete with nonexistent artifact ID rejected with HTTP 404
  [PASS] Error message: "Artifact not found"

--- TEST D: Cross-Project Data Isolation & Authorization ---
  [PASS] Unauthorized user blocked from saving artifact (HTTP 403, got 403)
  [PASS] Unauthorized user blocked from deleting artifact (HTTP 403, got 403)

================================================================================
TOTAL TESTS: 28 | PASSED: 28 | FAILED: 0
================================================================================
```

### 8.2 Waterfall Lifecycle & Gating Suite
**Command:** `node scripts/testWaterfallLifecycleAndGating.js`
```
TOTAL TESTS: 23 | PASSED: 23 | FAILED: 0 (100% PASS)
```

### 8.3 Master Integration Test Suite
**Command:** `npm test` (`node scripts/testMasterCorrections.js`)
```
========================================================
MASTER TEST SUITE RESULTS: 52 PASSED, 0 FAILED
========================================================
```

### 8.4 Client TypeScript Check
**Command:** `npx tsc --noEmit`
```
Exit code: 0 (Zero errors)
```

### 8.5 Kanban Full Suite
**Command:** `node scripts/testKanbanV4FullSuite.js`
```
======================================================================
  KANBAN V4 SUITE RESULTS
  Total:  41 | Passed: 41 ✅ | Failed: 0 ❌ | Score: 100%
======================================================================
```

### 8.6 Scrum Full Suite
**Command:** `npm run test:scrum`
```
=======================================================
  RESULTS: 11 / 11 TESTS PASSED (100%)
=======================================================
```

### 8.7 Waterfall Phase Completion Suite
**Command:** `node scripts/testV4WaterfallCompletion.js`
```
========================================================
V4 WATERFALL COMPLETION RESULTS: 39 PASSED, 0 FAILED
========================================================
```

---

## 9. Remaining Failures or Limitations

- **None.** All 28 dedicated persistence tests, 23 Waterfall gating tests, 52 master tests, 41 Kanban tests, 11 Scrum tests, and frontend TypeScript type checks pass with 100% success.
- Zero-cost AI policy is strictly maintained ($0.00).

---

## 10. Git Status and Confirmation

### 10.1 `git status --short`
```text
 M client/app/team/[teamId].tsx
 M client/components/workspace/PlanPanel.tsx
 M client/components/workspace/TasksPanel.tsx
 M client/components/workspace/WaterfallTimelinePanel.tsx
 M server/models/Project.js
 M server/models/Task.js
 M server/routes/projects.js
 M server/services/phaseGateService.js
 M server/services/requirementService.js
?? ARTIFACT_SAVE_DELETE_FIX_REPORT.md
?? WATERFALL_ARTIFACT_PLAN_GATING_IMPLEMENTATION.md
?? client/hooks/useWaterfallPlanLifecycle.ts
?? server/scripts/testArtifactSaveDeletePersistence.js
?? server/scripts/testWaterfallLifecycleAndGating.js
```

### 10.2 `git diff --stat`
```text
 client/app/team/[teamId].tsx                       |    6 +-
 client/components/workspace/PlanPanel.tsx          | 1139 ++++++++++++++++++--
 client/components/workspace/TasksPanel.tsx         |  155 ++-
 .../workspace/WaterfallTimelinePanel.tsx           |  109 +-
 server/models/Project.js                           |  102 ++
 server/models/Task.js                              |    2 +
 server/routes/projects.js                          |  409 ++++++-
 server/services/phaseGateService.js                |  101 +-
 server/services/requirementService.js              |  700 ++++++++++--
 9 files changed, 2546 insertions(+), 177 deletions(-)
```

### 10.3 Confirmation
- Current checked-out branch: `version4.0`
- Starting SHA: `3a95d67247fd22f2d3c4a4d0421e77f7829826a6`
- **Explicit confirmation: No git commit or push to GitHub was performed. All changes remain unstaged/uncommitted in the local working directory.**
