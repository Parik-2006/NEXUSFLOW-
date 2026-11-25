/**
 * server/scripts/fixtures/phishShieldFixture.js
 * NEXUSFLOW Phase 2 (Task 11) — deterministic replacement for the production
 * "TEAM OP3 / PhishShield" workspace that three legacy Scrum suites asserted
 * against by hard-coded id. It recreates the documented preconditions in the
 * ISOLATED test database only (the scripts' _testDbGuard forces MONGO_URI_TEST):
 *
 *   - SCRUM team with two registered members (leader + developer, non-default skills)
 *   - SCRUM project linked as activeProjectId
 *   - ACTIVE "Sprint 01" committing exactly 9 stories / 37 points:
 *       6 TODO (22 pts), 2 IN_PROGRESS (10 pts), 1 IN_REVIEW (5 pts)
 *   - 3 backlog stories outside the sprint (sprint/backlog isolation)
 *
 * No production data is copied; every value is synthetic.
 */
import mongoose from "mongoose";
import User from "../../models/User.js";
import Team from "../../models/Team.js";
import Project from "../../models/Project.js";
import Sprint from "../../models/Sprint.js";
import Task from "../../models/Task.js";

export async function seedPhishShieldFixture() {
  const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const leader = await User.create({ name: "Op3 Leader", email: `op3.leader.${stamp}@test.local`, password: "Fixture1234" });
  const dev = await User.create({ name: "Op3 Developer", email: `op3.dev.${stamp}@test.local`, password: "Fixture1234" });

  const team = await Team.create({
    name: "TEAM OP3 (fixture)",
    ownerId: leader._id,
    methodology: "SCRUM",
    members: [
      { userId: leader._id, name: leader.name, role: "leader", skills: { frontend: 8, backend: 6, devops: 4, design: 7, ml: 3, testing: 5 }, capacity: 40 },
      { userId: dev._id, name: dev.name, role: "Developer", skills: { frontend: 4, backend: 9, devops: 7, design: 3, ml: 6, testing: 8 }, capacity: 40 },
    ],
  });
  const project = await Project.create({ teamId: team._id, title: "PhishShield (fixture)", methodology: "SCRUM" });
  await Team.updateOne({ _id: team._id }, { $set: { activeProjectId: project._id } });

  const start = new Date(Date.now() - 2 * 86400000);
  const sprint = await Sprint.create({
    projectId: project._id,
    teamId: team._id,
    name: "Sprint 01",
    sprintNumber: 1,
    status: "ACTIVE",
    startDate: start,
    endDate: new Date(start.getTime() + 14 * 86400000),
    totalCapacityHours: 80,
  });

  const story = (title, points, scrumStatus, inSprint = true) => ({
    teamId: team._id,
    projectId: project._id,
    title,
    userStory: `As a user, I want ${title.toLowerCase()}`,
    storyPoints: points,
    estimatedHours: points * 2,
    scrumStatus,
    status: scrumStatus === "IN_PROGRESS" || scrumStatus === "IN_REVIEW" ? "in_progress" : "todo",
    source: "manual", // Task.source enum is ai|manual; scrumStatus marks Scrum eligibility
    sprintId: inSprint ? sprint._id : null,
  });
  await Task.create([
    story("Phishing URL scanner", 5, "TODO"),
    story("Email header parser", 5, "TODO"),
    story("Domain reputation lookup", 3, "TODO"),
    story("Alert dashboard", 3, "TODO"),
    story("User report button", 3, "TODO"),
    story("Quarantine workflow", 3, "TODO"),
    story("ML classifier integration", 5, "IN_PROGRESS"),
    story("Threat feed sync", 5, "IN_PROGRESS"),
    story("Audit logging", 5, "IN_REVIEW"),
    story("Browser extension", 8, "BACKLOG", false),
    story("SIEM export", 5, "BACKLOG", false),
    story("Admin reporting", 3, "BACKLOG", false),
  ]);

  return {
    teamId: team._id.toString(),
    projectId: project._id.toString(),
    sprintId: sprint._id.toString(),
    leader,
    dev,
    isFixture: mongoose.connection.name,
  };
}
