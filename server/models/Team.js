import mongoose from "mongoose";

const SkillProfileSchema = new mongoose.Schema(
  {
    frontend: { type: Number, default: 5, min: 0, max: 10 },
    backend:  { type: Number, default: 5, min: 0, max: 10 },
    devops:   { type: Number, default: 5, min: 0, max: 10 },
    design:   { type: Number, default: 5, min: 0, max: 10 },
    ml:       { type: Number, default: 5, min: 0, max: 10 },
    testing:  { type: Number, default: 5, min: 0, max: 10 },
  },
  { _id: false }
);

const TeamMemberSchema = new mongoose.Schema(
  {
    userId:       { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    name:         { type: String, default: "" },   // human-readable label for assignment board / chips
    avatar:       { type: String, default: "" },    // base64 data URL profile image (fallback: initials)
    role:         { type: String, default: "member" }, // member role label (leader / manager / member)
    skills:       { type: SkillProfileSchema, default: () => ({}) },
    capacity:     { type: Number, default: 40, min: 1 },
    assignedLoad: { type: Number, default: 0, min: 0 },
  },
  { _id: false }
);

// Snapshot of the original AI/starter backlog so "Restore AI Backlog" can
// rebuild it after manual edits. Stores plain task seed objects (not refs).
const AiTaskSeedSchema = new mongoose.Schema(
  {
    title:          { type: String, required: true },
    description:    { type: String, default: "" },
    category:       { type: String, default: "General" },
    urgency:        { type: Number, default: 2 },
    impact:         { type: Number, default: 2 },
    estimatedHours: { type: Number, default: null },
    businessValue:  { type: Number, default: null },
    priorityLabel:  { type: String, default: null },
    phaseIndex:     { type: Number, default: 0 }, // for inter-phase dependency wiring
  },
  { _id: false }
);

// Team-level settings (Phase 11). All optional / additive.
const TeamSettingsSchema = new mongoose.Schema(
  {
    sprintCapacity:  { type: Number, default: 40 },
    defaultReminder: { type: String, default: "" },     // e.g. "1d" before due (future use)
    aiPreferences:   { type: String, default: "" },     // free-text AI generation guidance
    defaultPriority: { type: String, default: "medium" },
    themeColor:      { type: String, default: "" },
  },
  { _id: false }
);

const TeamSchema = new mongoose.Schema(
  {
    name:      { type: String, required: true },
    logo:      { type: String, default: "" },        // base64 data URL team logo (fallback: initials badge)
    settings:  { type: TeamSettingsSchema, default: () => ({}) },
    projectTitle:       { type: String, default: "" },
    projectDescription: { type: String, default: "" },
    members:   { type: [TeamMemberSchema], default: [] },
    taskCount: { type: Number, default: 0 },
    doneCount: { type: Number, default: 0 },

    // Original AI-generated backlog snapshot (for Restore AI Backlog).
    aiGeneratedTasks: { type: [AiTaskSeedSchema], default: [] },
  },
  { timestamps: true }
);

export default mongoose.model("Team", TeamSchema);
