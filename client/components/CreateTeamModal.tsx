/**
 * CreateTeamModal — guided 4-step "New workspace" wizard.
 *   1. Project information   (team name, project title, description)
 *   2. Your role             (Team Leader / Project Manager / Team Member)
 *   3. Team members          (lookup by REGISTERED EMAIL → use real User._id)
 *   4. AI planning           (preview of the auto-generated starter backlog)
 *
 * Skill data feeds the Branch & Bound assignment engine; the description is
 * turned into a starter task plan (refinable later via the AI chat).
 *
 * FIX 4 (Combined Fixes 1–5):
 *   - Step 3 takes a teammate EMAIL and looks it up against the User
 *     collection. No fake users. No name-as-identity.
 *   - The teammate's real `_id` is captured so downstream systems (chat,
 *     tasks, health, risks) all see the same person.
 *   - The creator can pick specific skills from an expanded catalog.
 *   - Existing profile skills are shown but not overwritten.
 */
import React, { useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ModalSheet, useToast } from "@/components/feedback";
import { Field, Button, Avatar, Chip, Badge } from "@/components/ui";
import ImageUploader from "@/components/ImageUploader";
import SkillVerificationModal from "@/components/SkillVerificationModal";
import DatePicker from "@/components/DatePicker";
import { useAuth } from "@/context/AuthContext";
import { getItem } from "@/utils/storage";
import { API_BASE_URL } from "@/utils/api";
import { colors, radius, spacing, font } from "@/theme";
import type { NewTeamInput } from "@/hooks/useTeams";
import { MethodologyType, getMethodologyConfig } from "@/utils/methodologyConfig";

export const DOMAINS = [
  { id: "AI", label: "AI / ML", icon: "sparkles-outline" },
  { id: "Web Application", label: "Web App", icon: "globe-outline" },
  { id: "Mobile App", label: "Mobile", icon: "phone-portrait-outline" },
  { id: "IoT", label: "IoT & Devices", icon: "hardware-chip-outline" },
  { id: "Cloud", label: "Cloud & DevOps", icon: "cloud-outline" },
  { id: "Cybersecurity", label: "Security", icon: "shield-outline" },
];

export const METHODOLOGY_OPTIONS: {
  id: MethodologyType;
  name: string;
  badge: "ACTIVE" | "WIP";
  tagline: string;
  wipNotice?: string;
}[] = [
  {
    id: "WATERFALL",
    name: "Waterfall",
    badge: "ACTIVE",
    tagline: "Sequential phase gates & CPM schedule",
  },
  {
    id: "CLASSIC",
    name: "NexusFlow Classic",
    badge: "ACTIVE",
    tagline: "Original 12-tab V3 project workspace",
  },
  {
    id: "SCRUM",
    name: "Scrum",
    badge: "WIP",
    tagline: "Sprints & burndown velocity",
    wipNotice: "Scrum environment is under development (NexusFlow V4.1). Selecting Scrum will preview the WIP environment. Waterfall is recommended for active projects.",
  },
  {
    id: "KANBAN",
    name: "Kanban",
    badge: "WIP",
    tagline: "Continuous flow & WIP limits",
    wipNotice: "Kanban environment is under development (NexusFlow V4.1). Selecting Kanban will preview the WIP environment. Waterfall is recommended for active projects.",
  },
  {
    id: "HYBRID",
    name: "Hybrid",
    badge: "WIP",
    tagline: "Stage-gates & agile iterations",
    wipNotice: "Hybrid environment is under development (NexusFlow V4.2). Selecting Hybrid will preview the WIP environment. Waterfall is recommended for active projects.",
  },
];

// ── Broad categories consumed by the Branch & Bound assignment engine ────────
const SKILL_CATEGORIES: { key: string; label: string; skills: string[] }[] = [
  {
    key: "frontend",
    label: "Frontend",
    skills: ["JavaScript", "TypeScript", "HTML", "CSS", "React", "React Native", "Angular", "Vue", "Next.js"],
  },
  {
    key: "backend",
    label: "Backend",
    skills: ["Python", "Java", "Node.js", "Spring Boot", "C++", "C#", "Go", "Django", "Express", "FastAPI"],
  },
  {
    key: "devops",
    label: "DevOps",
    skills: ["Docker", "Kubernetes", "AWS", "Azure", "Linux", "CI/CD", "Terraform", "GitHub Actions"],
  },
  {
    key: "design",
    label: "Design",
    skills: ["Figma", "UI Design", "UX", "Prototyping", "Wireframing", "Design Systems"],
  },
  {
    key: "ml",
    label: "AI / ML",
    skills: ["Python", "TensorFlow", "PyTorch", "Scikit-learn", "NLP", "Computer Vision", "LLMs"],
  },
  {
    key: "testing",
    label: "Testing",
    skills: ["Manual Testing", "Automation", "Selenium", "Playwright", "Jest", "Cypress", "JUnit"],
  },
];

const ROLES = [
  { key: "leader", label: "Team Leader", icon: "flag-outline", desc: "Owns delivery, sets priorities and unblocks the team." },
  { key: "manager", label: "Project Manager", icon: "briefcase-outline", desc: "Plans sprints, tracks scope and coordinates stakeholders." },
  { key: "member", label: "Team Member", icon: "person-outline", desc: "Picks up assigned work and ships tasks to done." },
] as const;

export const ROLE_CAPABILITIES: Record<
  string,
  {
    primarySkill: string;
    requiredSkills: string[];
    title: string;
    description: string;
    whyQuiz: string;
  }
> = {
  leader: {
    primarySkill: "DevOps",
    requiredSkills: ["DevOps", "Docker", "JavaScript", "Testing"],
    title: "Delivery & Architecture Capability",
    description: "Team Leaders drive project architecture, delivery velocity, and engineering unblocking.",
    whyQuiz: "NexusFlow connects team leaders to verified DevOps and delivery skills so algorithmic project decomposition and capacity scheduling can trust lead assignments.",
  },
  manager: {
    primarySkill: "Testing",
    requiredSkills: ["Testing", "SQL", "Docker", "JavaScript"],
    title: "Quality & Process Capability",
    description: "Project Managers coordinate sprint schedules, quality metrics, and stakeholder deliverables.",
    whyQuiz: "NexusFlow connects project managers to verified quality and testing skills to ensure reliable sprint scope planning.",
  },
  member: {
    primarySkill: "Frontend",
    requiredSkills: ["Frontend", "JavaScript", "TypeScript", "React", "Node.js", "Python"],
    title: "Core Engineering Capability",
    description: "Team Members implement tasks and ship features across the software stack.",
    whyQuiz: "NexusFlow verifies engineering execution skills so Branch & Bound can assign tasks to members with verified competencies.",
  },
};

const STEPS = ["Project", "Your role", "Members", "AI plan"];

const DESC_MIN = 350;
const DESC_MAX = 1000;

// Sample project descriptions surfaced by the "Generate Example Description"
// button. These are GUIDANCE only — NexusFlow decomposes whatever you write.
const EXAMPLES: { title: string; text: string }[] = [
  {
    title: "AI-Based Student Performance Prediction System",
    text: "Build an AI-based student performance prediction system where academic historical data and continuous assessment metrics train a machine-learning model to forecast student risk levels and recommend personalized interventions. The backend processes student datasets securely with role-based access for teachers and students, while a React web interface displays predicted grade trajectories, automated teacher alerts for at-risk students, and interactive performance charts.",
  },
  { title: "Smart Irrigation System", text: "Build an AI-driven smart irrigation system that uses IoT soil-moisture and temperature sensors with an ESP32 microcontroller to automatically schedule watering. Sensor readings stream over MQTT to a cloud backend that combines weather forecasting and a machine-learning model to predict optimal irrigation windows and control water pumps. Farmers monitor multiple fields, configure per-zone schedules, trigger manual overrides, and receive alerts when moisture drops below crop-specific thresholds, all through a mobile analytics dashboard with water-savings reporting." },
  { title: "E-Commerce Platform", text: "Develop a full-stack e-commerce platform where customers browse a product catalog, manage a shopping cart, and check out securely with online payments. The backend handles product and inventory management, order processing, and a recommendation engine that suggests products based on browsing history. Include user authentication with role-based access for customers and admins, order tracking, email notifications, and an admin dashboard with sales analytics, revenue charts and low-stock alerts. The system must scale to handle seasonal traffic spikes reliably." },
  { title: "Hospital Management System", text: "Create a hospital management system that digitises patient records, appointment scheduling, and billing across departments. Doctors and nurses access electronic health records, prescribe medication, and view lab results; receptionists book appointments and manage queues. The backend manages patients, staff, beds and pharmacy inventory with secure role-based access and full audit logging for compliance. Provide real-time notifications for appointments and critical alerts, plus an analytics dashboard covering occupancy, revenue and patient flow for administrators." },
  { title: "AI Interview Assistant", text: "Build an AI interview assistant that helps candidates practise technical and behavioural interviews. The platform generates role-specific questions, records spoken answers, and uses a machine-learning model with natural-language processing to evaluate responses for clarity, relevance and confidence. Candidates receive instant feedback, scores and improvement tips; recruiters create custom question banks and review session reports. Include user authentication, a progress dashboard with performance trends over time, and real-time notifications for scheduled mock interviews." },
];

// Teammate = real registered user (with `_id`).
// `skills` are the workspace-specific skill picks (separate from profile skills).
type DraftMember = {
  userId: string;
  name: string;
  email: string;
  role: string;
  avatar?: string;
  profileSkills: string[]; // read from the User profile
  skills: string[];        // workspace-specific selection
};

type LookupState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "found"; user: { _id: string; name: string; email: string; avatar?: string; skills: string[] } }
  | { kind: "not_found"; email: string };

export default function CreateTeamModal({ visible, onClose, onCreate }: {
  visible: boolean; onClose: () => void;
  onCreate: (input: NewTeamInput) => Promise<{ error?: string }>;
}) {
  const toast = useToast();
  const { user, token: tokenStr } = useAuth();
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [logo, setLogo] = useState<string | null>(null);
  const [projectTitle, setProjectTitle] = useState("");
  const [domain, setDomain] = useState<string>("AI");
  const [methodology, setMethodology] = useState<MethodologyType>("WATERFALL");
  const [deadline, setDeadline] = useState<string>("");
  const [clientRequirements, setClientRequirements] = useState<string>("");
  const [description, setDescription] = useState("");

  const [creatorImage, setCreatorImage] = useState<string | null>(null);
  useEffect(() => {
    getItem(`nf_profile_${user?.email ?? "anon"}`).then((raw) => {
      if (raw) try { setCreatorImage(JSON.parse(raw).image ?? null); } catch {}
    });
  }, [user?.email]);
  const [role, setRole] = useState<string>("leader");
  const [members, setMembers] = useState<DraftMember[]>([]);
  const [mEmail, setMEmail] = useState("");
  const [lookup, setLookup] = useState<LookupState>({ kind: "idle" });
  const [draftMemberRole, setDraftMemberRole] = useState<string>("member");
  const [userVerifications, setUserVerifications] = useState<string[]>([]);
  const [activeQuizSkill, setActiveQuizSkill] = useState<string | null>(null);
  const [pickedCategory, setPickedCategory] = useState<string>(SKILL_CATEGORIES[0].key);
  const [busy, setBusy] = useState(false);
  const [showExamples, setShowExamples] = useState(false);

  // Load existing verifications for the creator
  useEffect(() => {
    if (tokenStr && visible) {
      fetch(`${API_BASE_URL}/api/skills/verifications`, {
        headers: { Authorization: `Bearer ${tokenStr}` },
      })
        .then((res) => res.json())
        .then((data) => {
          if (Array.isArray(data)) {
            const list = data
              .filter((v: any) => v.verified)
              .map((v: any) => String(v.skill || "").toLowerCase().trim());
            setUserVerifications(list);
          }
        })
        .catch(() => {});
    }
  }, [tokenStr, visible]);

  const descLen = description.trim().length;
  const descTooShort = descLen > 0 && descLen < DESC_MIN;
  const descCounterColor = descLen === 0 ? colors.textFaint
    : descLen < DESC_MIN ? colors.danger
    : descLen > DESC_MAX ? colors.warning : colors.success;

  const reset = () => {
    setStep(0); setName(""); setLogo(null); setProjectTitle(""); setDescription("");
    setDomain("AI"); setMethodology("WATERFALL"); setDeadline(""); setClientRequirements("");
    setRole("leader"); setMembers([]); setMEmail(""); setLookup({ kind: "idle" });
    setDraftMemberRole("member"); setActiveQuizSkill(null);
    setPickedCategory(SKILL_CATEGORIES[0].key); setShowExamples(false);
  };
  const close = () => { reset(); onClose(); };

  // ── Email lookup (calls /api/users/lookup) ─────────────────────────────────
  const lookupEmail = async () => {
    const email = mEmail.trim().toLowerCase();
    if (!email) { toast("Enter a teammate email", "error"); return; }
    const myEmail = (user?.email || "").toLowerCase();
    if (email === myEmail) {
      toast("You can't add yourself as a teammate", "error");
      return;
    }
    if (members.some((m) => m.email.toLowerCase() === email)) {
      toast("That teammate is already added", "error");
      return;
    }
    setLookup({ kind: "loading" });
    try {
      const res = await fetch(`${API_BASE_URL}/api/users/lookup?email=${encodeURIComponent(email)}`, {
        headers: { Authorization: `Bearer ${tokenStr}` },
      });
      const data = await res.json();
      if (res.status === 404 || data.registered === false) {
        setLookup({ kind: "not_found", email });
        toast(data.error || "This email is not registered on NexusFlow.", "error");
        return;
      }
      if (!res.ok || !data.user) {
        setLookup({ kind: "not_found", email });
        toast(data.error || "We couldn't check this email right now. Please try again.", "error");
        return;
      }
      setLookup({ kind: "found", user: data.user });
    } catch {
      setLookup({ kind: "not_found", email });
      toast("We couldn't check this email right now. Please try again.", "error");
    }
  };

  const confirmAddMember = () => {
    if (lookup.kind !== "found") return;
    const u = lookup.user;
    const newMember: DraftMember = {
      userId: u._id,
      name: u.name,
      email: u.email,
      role: draftMemberRole || "member",
      avatar: u.avatar,
      profileSkills: Array.isArray(u.skills) ? u.skills : [],
      skills: [],
    };
    setMembers((prev) => [...prev, newMember]);
    setLookup({ kind: "idle" });
    setMEmail("");
    setDraftMemberRole("member");
  };

  const toggleWorkspaceSkill = (memberIdx: number, skill: string) => {
    setMembers((prev) => prev.map((m, i) => {
      if (i !== memberIdx) return m;
      const has = m.skills.includes(skill);
      return { ...m, skills: has ? m.skills.filter((s) => s !== skill) : [...m.skills, skill] };
    }));
  };

  // Backwards-compatible skills object for the server (broad category → number)
  const skillObjectFromSkills = (specific: string[]): Record<string, number> => {
    const o: Record<string, number> = {};
    for (const cat of SKILL_CATEGORIES) o[cat.key] = 3;
    for (const sk of specific) {
      const cat = SKILL_CATEGORIES.find((c) => c.skills.includes(sk));
      if (cat) o[cat.key] = 9;
    }
    if (Object.values(o).every((v) => v === 3)) {
      // fallback: pick frontend
      o.frontend = 9;
    }
    return o;
  };

  // Phase plan preview — which engineering phases the server-side decomposer will
  const plannedPhases = useMemo(() => {
    const text = `${projectTitle} ${description}`.toLowerCase();
    const phases: string[] = ["Planning"];
    if (/\b(iot|sensor|esp32|esp8266|arduino|raspberry|microcontroller|device|mqtt|hardware|pump|valve|wearable)\b/.test(text)) phases.push("Hardware");
    phases.push("Backend");
    if (/\b(ai|ml|machine learning|model|predict|forecast|recommend|recommendation|dataset|nlp|vision)\b/.test(text)) phases.push("AI / ML");
    if (/\b(realtime|real-time|socket|notification|alert|messaging|chat|live)\b/.test(text)) phases.push("Integration");
    phases.push("Frontend", "Testing", "Deployment");
    return [...new Set(phases)];
  }, [projectTitle, description]);

  const fillExample = () => {
    const ex = EXAMPLES[Math.floor(Math.random() * EXAMPLES.length)];
    if (!projectTitle.trim()) setProjectTitle(ex.title);
    setDescription(ex.text);
    setShowExamples(false);
  };

  const next = () => {
    if (step === 0 && !name.trim()) { toast("Team name is required", "error"); return; }
    if (step === 0 && descLen > 0 && descLen < DESC_MIN) {
      toast(`Description needs at least ${DESC_MIN} characters for a good AI plan`, "error"); return;
    }
    setStep((s) => Math.min(STEPS.length - 1, s + 1));
  };
  const back = () => setStep((s) => Math.max(0, s - 1));

  const submit = async () => {
    if (!name.trim()) { toast("Team name is required", "error"); return; }
    setBusy(true);
    const input: NewTeamInput = {
      name: name.trim(),
      logo: logo ?? "",
      creatorImage: creatorImage ?? "",
      projectTitle: projectTitle.trim(),
      projectDescription: description.trim(),
      domain,
      methodology,
      deadline: deadline || undefined,
      clientRequirements: clientRequirements.trim() || undefined,
      role,
      invitations: members.map((m) => ({
        email: m.email,
        role: m.role || "member",
        skills: m.skills,
      })),
      members: members.map((m) => ({
        name: m.name,
        userId: m.userId,
        email: m.email,
        role: m.role || "member",
        skills: skillObjectFromSkills(m.skills),
        workspaceSkills: m.skills,
      })) as any,
      tasks: [],
    };
    const { error } = await onCreate(input);
    setBusy(false);
    if (error) { toast(error, "error"); return; }
    if (members.length > 0) {
      toast(`Workspace created! Invitations sent to ${members.length} teammate${members.length > 1 ? "s" : ""}.`, "success");
    } else {
      toast("Workspace created", "success");
    }
    close();
  };

  const currentCategory = SKILL_CATEGORIES.find((c) => c.key === pickedCategory) || SKILL_CATEGORIES[0];

  return (
    <ModalSheet visible={visible} onClose={close} title="New workspace">
      {/* Progress */}
      <View style={s.progress}>
        {STEPS.map((label, i) => (
          <View key={label} style={s.progressItem}>
            <View style={[s.dot, i <= step && s.dotActive, i < step && s.dotDone]}>
              {i < step ? <Ionicons name="checkmark" size={13} color="#fff" /> : <Text style={[s.dotTxt, i <= step && { color: "#fff" }]}>{i + 1}</Text>}
            </View>
            <Text style={[s.progressLabel, i === step && { color: colors.text, fontWeight: "800" }]}>{label}</Text>
            {i < STEPS.length - 1 && <View style={[s.bar, i < step && { backgroundColor: colors.primary }]} />}
          </View>
        ))}
      </View>

      {/* Step 1 — Project information */}
      {step === 0 && (
        <View style={{ gap: spacing.md }}>
          <Text style={s.stepHint}>Define your project foundation, engineering methodology, and requirements.</Text>
          <Field label="Project title" placeholder="e.g. AI Student Performance Prediction System" value={projectTitle} onChangeText={setProjectTitle} icon="rocket-outline" />
          <Field label="Team / Workspace name" placeholder="e.g. Engineering Team Alpha" value={name} onChangeText={setName} icon="people-outline" />
          <ImageUploader label="Team logo (optional)" value={logo} onChange={setLogo} shape="square" size={72} />

          {/* Domain Selector */}
          <View style={{ gap: 6 }}>
            <Text style={s.subSectionLabel}>Project Domain</Text>
            <View style={s.domainRow}>
              {DOMAINS.map((d) => {
                const active = domain === d.id;
                return (
                  <Pressable
                    key={d.id}
                    onPress={() => setDomain(d.id)}
                    style={[s.domainPill, active && s.domainPillOn]}
                  >
                    <Ionicons name={d.icon as any} size={14} color={active ? "#fff" : colors.textMuted} />
                    <Text style={[s.domainPillTxt, active && { color: "#fff", fontWeight: "700" }]}>{d.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Methodology Selector */}
          <View style={{ gap: 8 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={s.subSectionLabel}>Methodology</Text>
              <Text style={s.subSectionHint}>Waterfall is fully active in V4.0</Text>
            </View>
            <View style={s.methodologyGrid}>
              {METHODOLOGY_OPTIONS.map((m) => {
                const active = methodology === m.id;
                const isWip = m.badge === "WIP";
                return (
                  <Pressable
                    key={m.id}
                    onPress={() => setMethodology(m.id)}
                    style={[
                      s.methCard,
                      active && s.methCardOn,
                      active && !isWip && { borderColor: colors.primary },
                      active && isWip && { borderColor: "#d97706" },
                    ]}
                  >
                    <View style={s.methCardTop}>
                      <Text style={[s.methCardTitle, active && { color: colors.text }]}>{m.name}</Text>
                      <View style={[s.methBadge, isWip ? s.methBadgeWip : s.methBadgeActive]}>
                        <Text style={[s.methBadgeTxt, isWip ? s.methBadgeWipTxt : s.methBadgeActiveTxt]}>
                          {m.badge}
                        </Text>
                      </View>
                    </View>
                    <Text style={s.methCardTagline} numberOfLines={2}>{m.tagline}</Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Non-Waterfall WIP notice */}
            {methodology !== "WATERFALL" && methodology !== "CLASSIC" && (
              <View style={s.wipCallout}>
                <Ionicons name="construct-outline" size={16} color="#b45309" />
                <View style={{ flex: 1 }}>
                  <Text style={s.wipCalloutTitle}>
                    {METHODOLOGY_OPTIONS.find((m) => m.id === methodology)?.name} Environment (WIP)
                  </Text>
                  <Text style={s.wipCalloutTxt}>
                    {METHODOLOGY_OPTIONS.find((m) => m.id === methodology)?.wipNotice}
                  </Text>
                </View>
              </View>
            )}
          </View>

          {/* Target Deadline */}
          <DatePicker
            label="Target Project Deadline (optional)"
            value={deadline}
            onChange={setDeadline}
          />

          {/* Teacher / Client Requirements */}
          <Field
            label="Teacher / Client Requirements (optional)"
            placeholder="e.g. Student historical dataset, ESP32 telemetry, 85%+ model accuracy, web dashboard, final live demo."
            value={clientRequirements}
            onChangeText={setClientRequirements}
            icon="clipboard-outline"
            multiline
          />

          {/* Description Guide Card */}
          <View style={s.guideCard}>
            <View style={s.guideHead}>
              <Ionicons name="bulb-outline" size={16} color={colors.accentDark} />
              <Text style={s.guideTitle}>Writing a great description</Text>
            </View>
            <Text style={s.guideTxt}>
              Describe the project goal, key features and deliverables — not a task list.
              NexusFlow decomposes it into a grouped backlog. Aim for {DESC_MIN}–{DESC_MAX} characters.
            </Text>
            <View style={s.guideBtnRow}>
              <Pressable style={s.exampleBtn} onPress={() => setShowExamples((v) => !v)}>
                <Ionicons name={showExamples ? "chevron-up" : "document-text-outline"} size={14} color={colors.primary} />
                <Text style={s.exampleBtnTxt}>{showExamples ? "Hide examples" : "See examples"}</Text>
              </Pressable>
              <Pressable style={s.exampleBtn} onPress={fillExample}>
                <Ionicons name="sparkles" size={14} color={colors.accentDark} />
                <Text style={[s.exampleBtnTxt, { color: colors.accentDark }]}>Load Student AI Prediction Example</Text>
              </Pressable>
            </View>
            {showExamples && (
              <View style={{ gap: 6, marginTop: 4 }}>
                {EXAMPLES.map((ex) => (
                  <Pressable key={ex.title} style={s.exampleRow} onPress={() => { if (!projectTitle.trim()) setProjectTitle(ex.title); setDescription(ex.text); setShowExamples(false); }}>
                    <Ionicons name="sparkles-outline" size={13} color={colors.accentDark} />
                    <Text style={s.exampleRowTxt} numberOfLines={1}>{ex.title}</Text>
                    <Ionicons name="add-circle-outline" size={15} color={colors.primary} />
                  </Pressable>
                ))}
              </View>
            )}
          </View>

          <Field
            label="Project description"
            placeholder="Describe the project — goals, scope, key features. NexusFlow turns this into your starter backlog."
            value={description} onChangeText={(v) => setDescription(v.slice(0, DESC_MAX))} multiline maxLength={DESC_MAX}
          />
          <View style={s.counterRow}>
            {descTooShort
              ? <Text style={[s.counterHint, { color: colors.danger }]}>Add a bit more detail for a stronger AI plan.</Text>
              : <Text style={s.counterHint}>Minimum {DESC_MIN} characters recommended.</Text>}
            <Text style={[s.counter, { color: descCounterColor }]}>{descLen}/{DESC_MAX}</Text>
          </View>
        </View>
      )}

      {/* Step 2 — Your role (creator ONLY) */}
      {step === 1 && (
        <View style={{ gap: spacing.md }}>
          <Text style={s.stepHint}>How will you be working in this workspace?</Text>
          {ROLES.map((r) => {
            const on = role === r.key;
            return (
              <Pressable key={r.key} onPress={() => setRole(r.key)} style={[s.roleCard, on && s.roleCardOn]}>
                <View style={[s.roleIcon, on && { backgroundColor: colors.primary }]}>
                  <Ionicons name={r.icon as any} size={18} color={on ? "#fff" : colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.roleLabel}>{r.label}</Text>
                  <Text style={s.roleDesc}>{r.desc}</Text>
                </View>
                <Ionicons name={on ? "radio-button-on" : "radio-button-off"} size={20} color={on ? colors.primary : colors.textFaint} />
              </Pressable>
            );
          })}

          {/* Role Capability Requirement & Skill Verification */}
          {ROLE_CAPABILITIES[role] && (() => {
            const cap = ROLE_CAPABILITIES[role];
            const hasVerified = cap.requiredSkills.some(
              (sk) => userVerifications.includes(sk.toLowerCase().trim()) || (user?.skills || []).some((s) => s.toLowerCase() === sk.toLowerCase())
            );
            return (
              <View style={s.capCard}>
                <View style={s.capHead}>
                  <Ionicons name="shield-checkmark" size={18} color={colors.accentDark} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.capTitle}>{cap.title}</Text>
                    <Text style={s.capSub}>{cap.whyQuiz}</Text>
                  </View>
                </View>

                <View style={s.capSkillsRow}>
                  <Text style={s.capSkillsLabel}>Role-required capabilities:</Text>
                  <View style={s.capChipGrid}>
                    {cap.requiredSkills.map((sk) => {
                      const isVer = userVerifications.includes(sk.toLowerCase().trim()) || (user?.skills || []).some((s) => s.toLowerCase() === sk.toLowerCase());
                      return (
                        <Pressable
                          key={sk}
                          style={[s.capChip, isVer && s.capChipVerified]}
                          onPress={() => setActiveQuizSkill(sk)}
                        >
                          <Ionicons
                            name={isVer ? "checkmark-circle" : "school-outline"}
                            size={14}
                            color={isVer ? colors.success : colors.accentDark}
                          />
                          <Text style={[s.capChipTxt, isVer && s.capChipTxtVerified]}>
                            {sk} {isVer ? "✓ Verified" : "• Verify"}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>

                {hasVerified ? (
                  <View style={s.capStatusOk}>
                    <Ionicons name="checkmark-circle" size={16} color={colors.success} />
                    <Text style={s.capStatusOkTxt}>
                      Verified capability active for {ROLES.find((r) => r.key === role)?.label}.
                    </Text>
                  </View>
                ) : (
                  <View style={s.capPromptBox}>
                    <Text style={s.capPromptTxt}>
                      Take a quick 5-question verification quiz now, or verify later from your profile.
                    </Text>
                    <Button
                      title={`Verify ${cap.primarySkill} (5 Qs)`}
                      icon="school-outline"
                      small
                      onPress={() => setActiveQuizSkill(cap.primarySkill)}
                    />
                  </View>
                )}
              </View>
            );
          })()}
        </View>
      )}

      {/* Step 3 — Team members (by REGISTERED EMAIL) */}
      {step === 2 && (
        <View style={{ gap: spacing.md }}>
          <Text style={s.stepHint}>
            Add teammates by their registered NexusFlow email. They must have an account first.
          </Text>

          <View style={s.memberAdd}>
            <View style={{ flex: 1 }}>
              <Field
                placeholder="teammate@gmail.com"
                value={mEmail}
                onChangeText={setMEmail}
                icon="mail-outline"
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>
            <Pressable
              style={[s.addBtn, (lookup.kind === "loading" || !mEmail.trim()) && { opacity: 0.5 }]}
              onPress={lookupEmail}
              disabled={lookup.kind === "loading" || !mEmail.trim()}
            >
              {lookup.kind === "loading"
                ? <ActivityIndicator size="small" color="#fff" />
                : <Ionicons name="search" size={20} color="#fff" />}
            </Pressable>
          </View>

          {/* Lookup feedback */}
          {lookup.kind === "not_found" && (
            <View style={s.warnCard}>
              <Ionicons name="alert-circle" size={18} color={colors.danger} />
              <Text style={[s.warnTxt, { color: colors.danger }]}>
                {lookup.email} is not registered on NexusFlow. Ask them to create a NexusFlow account first.
              </Text>
            </View>
          )}
          {lookup.kind === "found" && (
            <View style={s.foundCard}>
              <View style={s.foundHead}>
                <Ionicons name="checkmark-circle" size={18} color={colors.success} />
                <Text style={[s.warnTxt, { color: colors.success, flex: 1 }]}>
                  ✓ Registered NexusFlow user
                </Text>
              </View>
              <View style={s.foundRow}>
                <Avatar name={lookup.user.name} size={36} />
                <View style={{ flex: 1 }}>
                  <Text style={s.foundName}>{lookup.user.name}</Text>
                  <Text style={s.foundEmail}>{lookup.user.email}</Text>
                  {lookup.user.skills?.length ? (
                    <Text style={s.foundSkills}>
                      Existing skills: {lookup.user.skills.slice(0, 4).join(" • ")}
                    </Text>
                  ) : null}
                </View>
                <Button title="Add" small onPress={confirmAddMember} />
              </View>
              <View style={s.foundRoleSelector}>
                <Text style={s.foundRoleLabel}>Select Workspace Role:</Text>
                <View style={{ flexDirection: "row", gap: 6 }}>
                  {[
                    { key: "member", label: "Team Member" },
                    { key: "manager", label: "Project Manager" },
                    { key: "leader", label: "Team Leader" },
                  ].map((r) => {
                    const active = draftMemberRole === r.key;
                    return (
                      <Pressable
                        key={r.key}
                        onPress={() => setDraftMemberRole(r.key)}
                        style={[s.miniRoleChip, active && s.miniRoleChipOn]}
                      >
                        <Text style={[s.miniRoleChipTxt, active && { color: "#fff" }]}>
                          {r.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            </View>
          )}

          {/* Added members + per-member skill selection */}
          {members.length > 0 ? (
            <View style={{ gap: 12 }}>
              {members.map((m, i) => (
                <View key={m.userId} style={s.memberRow}>
                  <View style={s.memberTop}>
                    <Avatar name={m.name} size={32} />
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <Text style={s.memberName}>{m.name}</Text>
                        <Badge
                          label={m.role === "leader" ? "Team Leader" : m.role === "manager" ? "Project Manager" : "Team Member"}
                          color={colors.primary}
                          bg={colors.primarySoft}
                        />
                      </View>
                      <Text style={s.memberSkill}>{m.email}</Text>
                    </View>
                    <Pressable onPress={() => setMembers((prev) => prev.filter((_, j) => j !== i))} hitSlop={8}>
                      <Ionicons name="close-circle" size={20} color={colors.textFaint} />
                    </Pressable>
                  </View>

                  {m.profileSkills.length > 0 && (
                    <View style={s.profileSkillRow}>
                      <Text style={s.profileSkillLabel}>Existing profile skills</Text>
                      <View style={s.chipRow}>
                        {m.profileSkills.map((sk) => (
                          <View key={sk} style={s.profileChip}>
                            <Text style={s.profileChipText}>{sk}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  )}

                  <Text style={s.profileSkillLabel}>Pick skills for this workspace</Text>
                  <View style={s.chipRow}>
                    {SKILL_CATEGORIES.map((cat) => (
                      <Chip
                        key={cat.key}
                        label={cat.label}
                        active={pickedCategory === cat.key}
                        color={colors.accentDark}
                        onPress={() => setPickedCategory(cat.key)}
                      />
                    ))}
                  </View>
                  <View style={s.chipRow}>
                    {currentCategory.skills.map((sk) => (
                      <Pressable
                        key={sk}
                        style={[s.skillPick, m.skills.includes(sk) && s.skillPickOn]}
                        onPress={() => toggleWorkspaceSkill(i, sk)}
                      >
                        <Text style={[s.skillPickText, m.skills.includes(sk) && { color: "#fff" }]}>{sk}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <Text style={s.note}>
              You'll be added automatically. Varied skills make the assignment engine more
              effective — but you can add members later too.
            </Text>
          )}
        </View>
      )}

      {/* Step 4 — AI planning */}
      {step === 3 && (
        <View style={{ gap: spacing.md }}>
          <View style={s.aiBanner}>
            <View style={s.aiIcon}><Ionicons name="sparkles" size={18} color={colors.accentDark} /></View>
            <Text style={s.aiTxt}>
              NexusFlow will analyse your project and generate this starter task structure.
              You can refine, re-prioritise and expand it anytime.
            </Text>
          </View>

          <View style={s.summaryRow}>
            <Badge label={`${members.length + 1} member${members.length ? "s" : ""}`} color={colors.primary} bg={colors.primarySoft} />
            <Badge label={description.trim() ? `${plannedPhases.length} phases` : "empty backlog"} color={colors.accentDark} bg={colors.accentSoft} />
            <Badge label={ROLES.find((r) => r.key === role)?.label ?? "Member"} color={colors.merge} />
          </View>

          {!description.trim() ? (
            <Text style={s.note}>
              No description provided — your workspace will start with an empty backlog.
              Add a description in step 1 to auto-generate a structured plan.
            </Text>
          ) : (
            <View style={{ gap: 8 }}>
              <Text style={s.previewLabel}>Generated plan structure</Text>
              {plannedPhases.map((phase, i) => (
                <View key={phase} style={s.previewRow}>
                  <View style={s.previewNum}><Text style={s.previewNumTxt}>{i + 1}</Text></View>
                  <Text style={s.previewTitle} numberOfLines={1}>{phase}</Text>
                  <Ionicons name="layers-outline" size={15} color={colors.accentDark} />
                </View>
              ))}
              <Text style={s.note}>
                NexusFlow decomposes your description into grouped, prioritised tasks under these
                phases — then ranks them with the Greedy scheduler.
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Footer nav */}
      <View style={s.footer}>
        {step > 0 && <Button title="Back" icon="chevron-back" variant="secondary" onPress={back} style={{ flex: 1 }} />}
        {step < STEPS.length - 1 ? (
          <Button title="Continue" icon="chevron-forward" onPress={next} style={{ flex: 1 }} />
        ) : (
          <Button title="Create workspace" icon="rocket" onPress={submit} loading={busy} style={{ flex: 1 }} />
        )}
      </View>
    </ModalSheet>
  );
}

const s = StyleSheet.create({
  progress: { flexDirection: "row", alignItems: "center", marginBottom: spacing.sm },
  progressItem: { flexDirection: "row", alignItems: "center", flex: 1 },
  dot: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  dotActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  dotDone: { backgroundColor: colors.accent, borderColor: colors.accent },
  dotTxt: { fontSize: 12, fontWeight: "800", color: colors.textFaint },
  progressLabel: { fontSize: 11, color: colors.textMuted, fontWeight: "600", marginLeft: 6 },
  bar: { flex: 1, height: 2, backgroundColor: colors.border, marginHorizontal: 6 },

  stepHint: { fontSize: 13, color: colors.textMuted, lineHeight: 19 },

  subSectionLabel: { fontSize: 12, fontWeight: "700", color: colors.text, textTransform: "uppercase", letterSpacing: 0.5 },
  subSectionHint: { fontSize: 11, color: colors.textMuted },
  domainRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  domainPill: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 6, paddingHorizontal: 10, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border },
  domainPillOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  domainPillTxt: { fontSize: 12, color: colors.text, fontWeight: "500" },

  methodologyGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  methCard: { width: "48%", backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 10, gap: 4 },
  methCardOn: { backgroundColor: colors.primarySoft },
  methCardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  methCardTitle: { fontSize: 13, fontWeight: "700", color: colors.text },
  methCardTagline: { fontSize: 11, color: colors.textMuted, lineHeight: 15 },
  methBadge: { paddingHorizontal: 6, paddingVertical: 1.5, borderRadius: radius.pill },
  methBadgeActive: { backgroundColor: colors.successSoft },
  methBadgeWip: { backgroundColor: "#fef3c7" },
  methBadgeTxt: { fontSize: 9, fontWeight: "800" },
  methBadgeActiveTxt: { color: colors.success },
  methBadgeWipTxt: { color: "#b45309" },

  wipCallout: { flexDirection: "row", alignItems: "flex-start", gap: 8, backgroundColor: "#fffbeb", borderWidth: 1, borderColor: "#fde68a", borderRadius: radius.md, padding: 10 },
  wipCalloutTitle: { fontSize: 12, fontWeight: "700", color: "#92400e" },
  wipCalloutTxt: { fontSize: 11.5, color: "#b45309", lineHeight: 16, marginTop: 1 },

  guideCard: { backgroundColor: colors.accentSoft, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.accentBorder, gap: 6 },
  guideHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  guideTitle: { fontSize: 13, fontWeight: "800", color: colors.text },
  guideTxt: { fontSize: 12, color: colors.textMuted, lineHeight: 18 },
  guideBtnRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 14, marginTop: 2 },
  exampleBtn: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 },
  exampleBtnTxt: { fontSize: 12, fontWeight: "700", color: colors.primary },
  exampleRow: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.surface, borderRadius: radius.sm, paddingVertical: 9, paddingHorizontal: 10, borderWidth: 1, borderColor: colors.border },
  exampleRowTxt: { flex: 1, fontSize: 12.5, fontWeight: "700", color: colors.text },
  counterRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  counterHint: { fontSize: 11, color: colors.textFaint, flex: 1 },
  counter: { fontSize: 11, fontWeight: "800" },

  roleCard: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  roleCardOn: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  roleIcon: { width: 38, height: 38, borderRadius: 11, backgroundColor: colors.surfaceAlt, alignItems: "center", justifyContent: "center" },
  roleLabel: { fontSize: 14, fontWeight: "700", color: colors.text },
  roleDesc: { fontSize: 12, color: colors.textMuted, marginTop: 2, lineHeight: 17 },

  capCard: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: 12 },
  capHead: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  capTitle: { fontSize: 14, fontWeight: "700", color: colors.text },
  capSub: { fontSize: 12, color: colors.textMuted, marginTop: 2, lineHeight: 17 },
  capSkillsRow: { gap: 6 },
  capSkillsLabel: { fontSize: 11, fontWeight: "700", color: colors.textFaint, textTransform: "uppercase", letterSpacing: 0.5 },
  capChipGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  capChip: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 6, paddingHorizontal: 10, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border },
  capChipVerified: { backgroundColor: colors.successSoft, borderColor: colors.success },
  capChipTxt: { fontSize: 12, fontWeight: "600", color: colors.text },
  capChipTxtVerified: { color: colors.success, fontWeight: "700" },
  capStatusOk: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.successSoft, padding: 8, borderRadius: radius.sm },
  capStatusOkTxt: { fontSize: 12, color: colors.success, fontWeight: "600" },
  capPromptBox: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.accentSoft, padding: 8, borderRadius: radius.sm },
  capPromptTxt: { fontSize: 12, color: colors.accentDark, fontWeight: "600" },

  memberAdd: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  addBtn: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  warnCard: { flexDirection: "row", alignItems: "center", gap: 8, padding: 10, borderRadius: radius.md, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border },
  warnTxt: { flex: 1, fontSize: 13, fontWeight: "600" },
  foundCard: { padding: 12, borderRadius: radius.md, backgroundColor: colors.primarySoft, borderWidth: 1, borderColor: colors.primary, gap: 8 },
  foundHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  foundRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  foundName: { fontSize: 14, fontWeight: "800", color: colors.text },
  foundEmail: { fontSize: 12, color: colors.textMuted },
  foundSkills: { fontSize: 11, color: colors.accentDark, marginTop: 2 },
  foundRoleSelector: { marginTop: 6, gap: 6, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8 },
  foundRoleLabel: { fontSize: 11, fontWeight: "700", color: colors.textFaint, textTransform: "uppercase", letterSpacing: 0.5 },
  miniRoleChip: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  miniRoleChipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  miniRoleChipTxt: { fontSize: 11, fontWeight: "600", color: colors.text },

  memberRow: { backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: 10, borderWidth: 1, borderColor: colors.border, gap: 8 },
  memberTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  memberName: { fontSize: 14, fontWeight: "700", color: colors.text },
  memberSkill: { fontSize: 11, color: colors.textMuted },
  profileSkillRow: { gap: 4 },
  profileSkillLabel: { fontSize: 11, fontWeight: "700", color: colors.textFaint, textTransform: "uppercase", letterSpacing: 0.5 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  profileChip: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: radius.pill, backgroundColor: colors.successSoft, borderWidth: 1, borderColor: colors.success },
  profileChipText: { fontSize: 11, fontWeight: "700", color: colors.success },
  skillPick: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  skillPickOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  skillPickText: { fontSize: 12, fontWeight: "600", color: colors.text },

  note: { fontSize: 12, color: colors.textMuted, lineHeight: 18 },

  aiBanner: { flexDirection: "row", gap: spacing.sm, backgroundColor: colors.accentSoft, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.accentBorder },
  aiIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  aiTxt: { flex: 1, fontSize: 13, color: colors.text, lineHeight: 19 },
  summaryRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  previewLabel: { fontSize: 11, fontWeight: "700", color: colors.textFaint, textTransform: "uppercase", letterSpacing: 0.6 },
  previewRow: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.surface, borderRadius: radius.md, padding: 10, borderWidth: 1, borderColor: colors.border },
  previewNum: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },
  previewNumTxt: { fontSize: 11, fontWeight: "800", color: colors.primary },
  previewTitle: { flex: 1, fontSize: 13, fontWeight: "600", color: colors.text },

  footer: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
});
