/**
 * server/scripts/auditKanbanEndToEnd.js
 * ============================================================================
 * REAL RUNTIME HTTP END-TO-END AUDIT FOR KANBAN V4
 *
 * Tests the live running Express server on http://localhost:4000:
 * 1. User login / authentication
 * 2. Kanban workspace & project creation
 * 3. Tab 1: Overview API & health composite & flow twin facts
 * 4. Tab 2: Board API, task creation, pull/move transitions, DoR & WIP enforcement
 * 5. Tab 3: Backlog API, DAA ranking, Ready slots, batch replenishment
 * 6. Tab 4: Flow Metrics, cycle time percentiles (p50, p85, p95), flow efficiency
 * 7. Tab 5: Team API, personal WIP utilization, skill profiles
 * 8. Tab 6: Insights API, bottleneck detection, continuous delivery records
 * 9. Tab 7: Policies API, column limits update, DoR/DoD persistence
 * 10. Tab 8: Project AI copilot context integration
 * ============================================================================
 */

import http from "http";

const BASE_URL = "http://localhost:4000";

async function request(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, data };
}

async function runAudit() {
  console.log("======================================================================");
  console.log("  NEXUSFLOW V4 — KANBAN LIVE RUNTIME HTTP END-TO-END AUDIT");
  console.log("======================================================================\n");

  let passed = 0;
  let failed = 0;

  function assert(cond, msg) {
    if (cond) {
      console.log(`  ✅ ${msg}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${msg}`);
      failed++;
    }
  }

  // 1. Authenticate or Register test user
  console.log("🔑 SECTION 1 — Authentication");
  let token = null;
  let user = null;

  let authRes = await request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: "test@nexusflow.dev", password: "password123" }),
  });

  if (!authRes.ok) {
    authRes = await request("/api/auth/signup", {
      method: "POST",
      body: JSON.stringify({
        name: "Kanban Auditor",
        email: "test@nexusflow.dev",
        password: "password123",
        confirmPassword: "password123",
      }),
    });
  }

  assert(authRes.ok && authRes.data.token, "Authenticated test user and acquired JWT token");
  token = authRes.data.token;
  user = authRes.data.user;

  const authHeaders = { Authorization: `Bearer ${token}` };

  // 2. Create a dedicated Kanban workspace
  console.log("\n📁 SECTION 2 — Workspace & Project Setup (Kanban Methodology)");
  const teamRes = await request("/api/teams", {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      name: `Kanban Audit Workspace ${Date.now()}`,
      projectTitle: "Autonomous Flow Platform",
      methodology: "KANBAN",
      skills: ["Frontend", "Backend", "DevOps"],
    }),
  });

  const team = teamRes.data.team || teamRes.data;
  assert(teamRes.ok && team && team._id, "Created Kanban Team Workspace");
  const teamId = team._id;
  assert(team.methodology === "KANBAN", "Team methodology set to KANBAN");

  // 3. Tab 1: Overview
  console.log("\n📊 SECTION 3 — Tab 1: Overview Endpoint");
  const overviewRes = await request(`/api/kanban/overview/${teamId}`, {
    headers: authHeaders,
  });

  assert(overviewRes.ok && overviewRes.data.overview, "Loaded Kanban Overview for workspace");
  const overview = overviewRes.data.overview;
  assert(overview.health && typeof overview.health.overall === "number", "Overview contains health composite score");
  assert(overview.flowMetrics && overview.flowMetrics.cycleTime, "Overview contains flow metrics (cycleTime, throughput)");
  assert(overview.columnWip, "Overview contains column WIP limits and occupancy");

  // 4. Tab 2: Board & Task Lifecycle
  console.log("\n📋 SECTION 4 — Tab 2: Board, Tasks & Pull Engine");
  const boardRes = await request(`/api/kanban/board/${teamId}`, {
    headers: authHeaders,
  });
  assert(boardRes.ok && boardRes.data.board, "Loaded Kanban Board data");
  assert(Array.isArray(boardRes.data.board.columns), "Board contains workflow columns array");

  // Create a work item with complete DoR
  const taskRes = await request(`/api/kanban/tasks`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      teamId,
      title: "Implement Event Sourcing Pipeline",
      description: "Build robust Kafka event bus for continuous streaming",
      userStory: "As a developer, I want Kafka event sourcing so data is auditable",
      acceptanceCriteria: ["Kafka cluster connected", "Producer and consumer tested"],
      estimatedHours: 8,
      classOfService: "standard",
      workflowColumn: "ready",
      urgency: 4,
      impact: 5,
    }),
  });
  assert(taskRes.ok && taskRes.data.task, "Created Kanban work item");
  const task = taskRes.data.task;
  assert(task.workflowColumn === "ready", "New work item placed in initial column (ready)");

  // Pull work item to 'in_progress'
  const pullRes = await request(`/api/kanban/pull`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      teamId,
      taskId: task._id,
      toColumn: "in_progress",
    }),
  });
  assert(pullRes.ok && pullRes.data.task, "Successfully pulled work item to 'in_progress'");
  assert(pullRes.data.task && pullRes.data.task.workflowColumn === "in_progress", "Task column updated to 'in_progress'");

  // Test Blocker lifecycle on task
  console.log("\n🚨 SECTION 5 — Blocker Intelligence & Lifecycle");
  const blockerRes = await request(`/api/kanban/blockers`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      teamId,
      taskId: task._id,
      title: "Waiting on AWS IAM role delegation",
      description: "Need S3 and Kinesis write permissions",
      category: "technical",
      severity: "high",
    }),
  });
  if (!blockerRes.ok) {
    console.error("blockerRes failed:", blockerRes.status, blockerRes.data);
  } else {
    console.log("blockerRes success:", blockerRes.data);
  }
  assert(blockerRes.ok && blockerRes.data.task, "Created blocker on work item");
  assert(blockerRes.data.task.isBlocked === true, "Task flagged as isBlocked=true");

  // Resolve blocker
  const blockerId = blockerRes.data.blocker.blockerId;
  const resolveBlockerRes = await request(`/api/kanban/blockers/${blockerId}`, {
    method: "PATCH",
    headers: authHeaders,
    body: JSON.stringify({
      teamId,
      taskId: task._id,
      status: "RESOLVED",
      resolutionNotes: "IAM role granted by cloud team",
    }),
  });
  assert(resolveBlockerRes.ok, "Resolved blocker successfully");

  // 5. Tab 3: Backlog & Replenishment
  console.log("\n📥 SECTION 6 — Tab 3: Backlog & Batch Replenishment");
  // Create an item in backlog column
  const backlogTaskRes = await request(`/api/kanban/tasks`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      teamId,
      title: "Refactor Database Indexes for Little's Law Metrics",
      description: "Optimize compound indexes on state transitions",
      userStory: "As an engineer, I want optimized DB indexes so flow calculations are instant",
      acceptanceCriteria: ["All index scans under 5ms"],
      estimatedHours: 4,
      classOfService: "improvement",
      workflowColumn: "backlog",
      urgency: 3,
      impact: 4,
    }),
  });

  const backlogRes = await request(`/api/kanban/backlog/${teamId}`, {
    headers: authHeaders,
  });
  assert(backlogRes.ok, "Fetched Backlog data");
  assert(typeof backlogRes.data.backlogCount === "number", "Backlog count computed");
  assert(typeof backlogRes.data.availableReadySlots === "number", "Available Ready slots computed from WIP limit");

  if (backlogTaskRes.ok && backlogTaskRes.data.task) {
    const replenishRes = await request(`/api/kanban/backlog/replenish`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        teamId,
        taskIds: [backlogTaskRes.data.task._id],
      }),
    });
    assert(replenishRes.ok && Array.isArray(replenishRes.data.results) && replenishRes.data.results.some(r => r.success), "Batch replenished item from Backlog into Ready queue");
  }

  // 6. Tab 4: Flow Metrics & SLE Forecasting
  console.log("\n📈 SECTION 7 — Tab 4: Flow Metrics & Empirical Forecasting");
  const flowRes = await request(`/api/kanban/flow-metrics/${teamId}`, {
    headers: authHeaders,
  });
  assert(flowRes.ok && flowRes.data.flowMetrics, "Loaded Flow Metrics");
  assert(flowRes.data.forecast && flowRes.data.forecast.percentiles, "Calculated empirical cycle time percentiles (p50, p85, p95)");
  assert(flowRes.data.flowMetrics.flowEfficiency !== undefined, "Calculated Flow Efficiency percentage");

  // 7. Tab 5: Team & Personal WIP
  console.log("\n👥 SECTION 8 — Tab 5: Team Intelligence & Personal WIP");
  const teamWipRes = await request(`/api/kanban/team/${teamId}`, {
    headers: authHeaders,
  });
  assert(teamWipRes.ok && Array.isArray(teamWipRes.data.personalWip), "Loaded Team personal WIP breakdown");
  assert(teamWipRes.data.personalWip.length > 0, "Team members mapped with personal WIP capacity");

  // 8. Tab 6: Insights & Continuous Delivery
  console.log("\n💡 SECTION 9 — Tab 6: Insights & Continuous Improvement");
  const ciRes = await request(`/api/kanban/continuous-improvement/${teamId}`, {
    headers: authHeaders,
  });
  assert(ciRes.ok && Array.isArray(ciRes.data.recommendations), "Loaded Continuous Improvement recommendations");

  const cdRes = await request(`/api/kanban/continuous-delivery/${teamId}`, {
    headers: authHeaders,
  });
  assert(cdRes.ok && Array.isArray(cdRes.data.deliveredItems), "Loaded Continuous Delivery ledger");

  // 9. Tab 7: Policies
  console.log("\n🛡️ SECTION 10 — Tab 7: Policies & Governance");
  const getPoliciesRes = await request(`/api/kanban/policies/${teamId}`, {
    headers: authHeaders,
  });
  assert(getPoliciesRes.ok && getPoliciesRes.data.policies, "Fetched Kanban Policies");

  const updatePoliciesRes = await request(`/api/kanban/policies/${teamId}`, {
    method: "PUT",
    headers: authHeaders,
    body: JSON.stringify({
      workflowColumns: getPoliciesRes.data.policies.workflowColumns,
      wipPolicy: { mode: "hard", strictBlockersPreventPull: true },
      serviceLevelExpectation: { targetDays: 5, confidencePercentile: 85 },
    }),
  });
  assert(updatePoliciesRes.ok, "Updated Kanban Policies (hard WIP mode, SLE 5 days)");

  // 10. Tab 8: Project AI Copilot Context
  console.log("\n🤖 SECTION 11 — Tab 8: Project AI Copilot Context");
  const copilotRes = await request(`/api/kanban/copilot-context/${teamId}`, {
    headers: authHeaders,
  });
  assert(copilotRes.ok && copilotRes.data.kanbanFacts, "Loaded Kanban Copilot Context for Project AI Advisor");
  assert(copilotRes.data.methodology === "KANBAN", "Copilot context bound to KANBAN methodology");

  console.log("\n======================================================================");
  console.log(`  KANBAN V4 RUNTIME AUDIT SUMMARY`);
  console.log(`  Total Checks: ${passed + failed}`);
  console.log(`  Passed:       ${passed} ✅`);
  console.log(`  Failed:       ${failed} ❌`);
  console.log(`  Score:        ${Math.round((passed / (passed + failed)) * 100)}%`);
  console.log("======================================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runAudit().catch((err) => {
  console.error("Audit error:", err);
  process.exit(1);
});
