/**
 * Phase 1 — Tasks 5 & 6: identity normalization and the role/permission model
 * (pure functions; no database).
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { toIdString, idEquals, getAuthUserId, isValidId } from "../../utils/identity.js";
import {
  getMembership,
  hasPermission,
  classifyRoleLabel,
  isTeamLeader,
  isTeamMember,
  PERMISSIONS,
} from "../../services/accessControlService.js";

const oid = () => new mongoose.Types.ObjectId();

describe("identity normalization", () => {
  test("handles ObjectId, string, and populated references", () => {
    const id = oid();
    assert.equal(toIdString(id), id.toHexString());
    assert.equal(toIdString(id.toHexString()), id.toHexString());
    assert.equal(toIdString({ _id: id, name: "populated" }), id.toHexString());
    assert.ok(idEquals(id, { _id: id }));
    assert.ok(idEquals(id.toHexString().toUpperCase(), id));
  });
  test("rejects names, emails and garbage as identity", () => {
    assert.equal(toIdString("Alice"), "");
    assert.equal(toIdString("alice@test.local"), "");
    assert.equal(getAuthUserId({ id: "alice@test.local", email: "alice@test.local" }), null);
    assert.equal(isValidId("Alice"), false);
    assert.equal(idEquals("", ""), false);
  });
  test("reads id from verified payloads (id or _id)", () => {
    const id = oid().toHexString();
    assert.equal(getAuthUserId({ id }), id);
    assert.equal(getAuthUserId({ _id: id }), id);
  });
});

describe("membership is decided by immutable user id only", () => {
  const owner = oid(), alice = oid(), aliceTwin = oid(), placeholder = oid();
  const team = {
    ownerId: owner,
    members: [
      { userId: owner, name: "Owner", role: "leader" },
      { userId: alice, name: "Alice", role: "Frontend Developer" },
      { userId: placeholder, name: "Ghost", role: "member", placeholder: true },
    ],
  };
  test("valid member id is a member", () => assert.ok(isTeamMember(team, alice)));
  test("a different user with the SAME display name is not a member", () => {
    assert.equal(isTeamMember(team, aliceTwin), false);
  });
  test("display name or email strings never match", () => {
    assert.equal(isTeamMember(team, "Alice"), false);
    assert.equal(isTeamMember(team, "alice@test.local"), false);
  });
  test("populated and unpopulated member references both work", () => {
    const populated = { ownerId: { _id: owner }, members: [{ userId: { _id: alice, name: "Alice" } }] };
    assert.ok(isTeamMember(populated, alice));
    assert.ok(getMembership(populated, owner).isOwner);
  });
  test("owner-less, member-less legacy team grants nothing", () => {
    assert.equal(isTeamMember({ members: [] }, alice), false);
    assert.equal(isTeamMember(null, alice), false);
  });
  test("owner derives from ownerId even without a leader label", () => {
    const t = { ownerId: owner, members: [{ userId: owner, role: "Designer" }] };
    assert.equal(getMembership(t, owner).accessRole, "owner");
    assert.ok(isTeamLeader(t, owner));
  });
});

describe("role / permission matrix", () => {
  const owner = oid(), leader = oid(), manager = oid(), dev = oid();
  const team = {
    ownerId: owner,
    members: [
      { userId: owner, role: "leader" },
      { userId: leader, role: "Scrum Master" },
      { userId: manager, role: "Project Manager" },
      { userId: dev, role: "Backend Developer" },
    ],
  };
  test("functional labels map to member; privileged labels map to leader/manager", () => {
    assert.equal(classifyRoleLabel("Backend Developer"), "member");
    assert.equal(classifyRoleLabel("scrum master"), "leader");
    assert.equal(classifyRoleLabel("Project Manager"), "manager");
    assert.equal(classifyRoleLabel("owner"), "leader"); // a label can never confer ownership
  });
  const cases = [
    ["team:delete", { owner: true, leader: false, manager: false, dev: false }],
    ["ownership:transfer", { owner: true, leader: false, manager: false, dev: false }],
    ["project:delete", { owner: true, leader: true, manager: false, dev: false }],
    ["phase:approve", { owner: true, leader: true, manager: false, dev: false }],
    ["sprint:complete", { owner: true, leader: true, manager: false, dev: false }],
    ["member:invite", { owner: true, leader: true, manager: true, dev: false }],
    ["member:remove", { owner: true, leader: true, manager: true, dev: false }],
    ["task:write", { owner: true, leader: true, manager: true, dev: true }],
  ];
  for (const [perm, expected] of cases) {
    test(`${perm}`, () => {
      assert.equal(hasPermission(team, owner, perm), expected.owner);
      assert.equal(hasPermission(team, leader, perm), expected.leader);
      assert.equal(hasPermission(team, manager, perm), expected.manager);
      assert.equal(hasPermission(team, dev, perm), expected.dev);
    });
  }
  test("non-members and unknown permissions are denied", () => {
    assert.equal(hasPermission(team, oid(), "team:read"), false);
    assert.equal(hasPermission(team, owner, "does:not:exist"), false);
  });
  test("every permission maps to a known role", () => {
    for (const r of Object.values(PERMISSIONS)) assert.ok(["owner", "leader", "manager", "member"].includes(r));
  });
});
