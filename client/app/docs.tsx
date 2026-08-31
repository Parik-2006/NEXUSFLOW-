import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Platform } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Card, Badge, Chip } from "@/components/ui";
import FloatingBackground from "@/components/FloatingBackground";
import { colors, spacing, radius, font, layout, shadow } from "@/theme";

type SectionKey =
  | "getting-started"
  | "project-management"
  | "project-ai"
  | "ai-system"
  | "daa"
  | "auth"
  | "security"
  | "architecture"
  | "lld"
  | "jwt";

interface DocSection {
  key: SectionKey;
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  badge?: string;
}

const SECTIONS: DocSection[] = [
  { key: "getting-started", title: "Getting Started", subtitle: "Core concepts, signup, login & workspace setup", icon: "rocket-outline", badge: "Start Here" },
  { key: "project-management", title: "Project Management", subtitle: "Teams, projects, backlogs, sprints & roles", icon: "grid-outline" },
  { key: "project-ai", title: "Project AI Hub", subtitle: "Briefs, AI guidance, Copilot, research, APIs & tools", icon: "sparkles-outline", badge: "AI 2.0" },
  { key: "ai-system", title: "Free AI Policy & Fallback", subtitle: "Gemini Free → OpenRouter Free → Local Deterministic Engine ($0.00)", icon: "git-merge-outline" },
  { key: "daa", title: "DAA Algorithms", subtitle: "Boyer-Moore, Greedy, 0/1 Knapsack, Merge Sort, Topo Sort, B&B", icon: "school-outline", badge: "Core Algorithms" },
];

export default function Documentation() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [activeSection, setActiveSection] = useState<SectionKey>("getting-started");

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <FloatingBackground />

      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={s.back}>
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </Pressable>
        <View style={s.logoIcon}>
          <Ionicons name="book" size={20} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={font.h3}>NEXUSFLOW Documentation</Text>
          <Text style={s.headerSub}>Production Architecture, AI Systems, DAA & Security</Text>
        </View>
        <Badge label="v2.0" color={colors.primary} bg={colors.primarySoft} />
      </View>

      {/* Navigation Pills */}
      <View style={s.navWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.navBar}>
          {SECTIONS.map((sec) => {
            const on = activeSection === sec.key;
            return (
              <Pressable
                key={sec.key}
                onPress={() => setActiveSection(sec.key)}
                style={[s.navPill, on && s.navPillActive]}
              >
                <Ionicons name={sec.icon} size={15} color={on ? "#fff" : colors.textMuted} />
                <Text style={[s.navPillTxt, on && s.navPillTxtActive]}>{sec.title}</Text>
                {sec.badge && (
                  <View style={[s.miniBadge, on ? { backgroundColor: "rgba(255,255,255,0.25)" } : { backgroundColor: colors.surfaceAlt }]}>
                    <Text style={[s.miniBadgeTxt, on && { color: "#fff" }]}>{sec.badge}</Text>
                  </View>
                )}
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* Content Area */}
      <ScrollView contentContainerStyle={[s.contentScroll, { paddingBottom: 80 }]}>
        <View style={s.container}>
          {activeSection === "getting-started" && <GettingStartedSection />}
          {activeSection === "project-management" && <ProjectManagementSection />}
          {activeSection === "project-ai" && <ProjectAISection />}
          {activeSection === "ai-system" && <AIFallbackSection />}
          {activeSection === "daa" && <DAASection />}
          {activeSection === "auth" && <AuthenticationSection />}
          {activeSection === "jwt" && <JWTStudentSection />}
          {activeSection === "security" && <SecuritySection />}
          {activeSection === "architecture" && <ArchitectureSection />}
          {activeSection === "lld" && <LLDSection />}
        </View>
      </ScrollView>
    </View>
  );
}

// ── 1. GETTING STARTED ────────────────────────────────────────────────────────
function GettingStartedSection() {
  return (
    <View style={{ gap: spacing.lg }}>
      <Card style={{ gap: spacing.md }}>
        <Text style={font.h2}>1. What is NEXUSFLOW?</Text>
        <Text style={s.paragraph}>
          <Text style={s.bold}>NEXUSFLOW 2.0</Text> is an enterprise-grade AI project workspace and algorithmic orchestration platform designed for engineering teams, university capstones, and hackathons.
        </Text>
        <Text style={s.paragraph}>
          Instead of treating project management as a dumb to-do list, NEXUSFLOW combines <Text style={s.bold}>Design and Analysis of Algorithms (DAA)</Text> with a multi-tiered <Text style={s.bold}>Project AI Intelligence Engine</Text> to automatically decompose ideas into phased engineering backlogs, plan optimal sprints, calculate dependency critical paths, and match team member skills.
        </Text>
      </Card>

      <Card style={{ gap: spacing.md }}>
        <Text style={font.h3}>Step-by-Step Onboarding</Text>
        <View style={s.stepRow}>
          <View style={s.stepBadge}><Text style={s.stepBadgeTxt}>1</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={s.stepTitle}>Create an Account</Text>
            <Text style={s.stepDesc}>Register with your name, email, and a secure password. Passwords are salted with bcrypt (cost factor 10) and stored in MongoDB.</Text>
          </View>
        </View>
        <View style={s.stepRow}>
          <View style={s.stepBadge}><Text style={s.stepBadgeTxt}>2</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={s.stepTitle}>Log In</Text>
            <Text style={s.stepDesc}>Sign in to receive a cryptographically signed JWT access token stored in client memory/storage and verified by the backend on every API call.</Text>
          </View>
        </View>
        <View style={s.stepRow}>
          <View style={s.stepBadge}><Text style={s.stepBadgeTxt}>3</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={s.stepTitle}>Create a Team Workspace</Text>
            <Text style={s.stepDesc}>Use the guided 4-step wizard to name your workspace, choose your role, add teammates with skill profiles, and provide a project brief.</Text>
          </View>
        </View>
        <View style={s.stepRow}>
          <View style={s.stepBadge}><Text style={s.stepBadgeTxt}>4</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={s.stepTitle}>Let AI Decompose the Backlog</Text>
            <Text style={s.stepDesc}>NexusFlow analyzes your brief and extracts structured phases (Hardware, Backend, AI/ML, Frontend, Testing, Deployment) with priority scores and dependency links.</Text>
          </View>
        </View>
      </Card>
    </View>
  );
}

// ── 2. PROJECT MANAGEMENT ────────────────────────────────────────────────────
function ProjectManagementSection() {
  return (
    <View style={{ gap: spacing.lg }}>
      <Card style={{ gap: spacing.md }}>
        <Text style={font.h2}>Project Management & Workspaces</Text>
        <Text style={s.paragraph}>
          NEXUSFLOW manages engineering deliverables through hierarchical scopes:
        </Text>
        <View style={s.codeBox}>
          <Text style={s.codeTxt}>User → Team (Workspace) → Project → Tasks → Sprints & AI Artifacts</Text>
        </View>
      </Card>

      <Card style={{ gap: spacing.md }}>
        <Text style={font.h3}>Core Capabilities</Text>
        <View style={s.bulletItem}>
          <Ionicons name="list" size={18} color={colors.greedy} />
          <View style={{ flex: 1 }}>
            <Text style={s.bold}>Tasks & Greedy Priority</Text>
            <Text style={s.subText}>Tasks contain estimated hours, business value, urgency (1–5), impact (1–5), and dependency counts. The Greedy Scheduler scores each task from 0 to 100.</Text>
          </View>
        </View>
        <View style={s.bulletItem}>
          <Ionicons name="git-network" size={18} color={colors.topo} />
          <View style={{ flex: 1 }}>
            <Text style={s.bold}>Dependency Directed Acyclic Graph (DAG)</Text>
            <Text style={s.subText}>Tasks declare prerequisite blockers. Kahn’s algorithm detects cycles and derives the valid topological execution sequence.</Text>
          </View>
        </View>
        <View style={s.bulletItem}>
          <Ionicons name="rocket" size={18} color={colors.knapsack} />
          <View style={{ flex: 1 }}>
            <Text style={s.bold}>Sprint Optimization (0/1 Knapsack)</Text>
            <Text style={s.subText}>Given team sprint capacity (e.g. 40 hours), dynamic programming selects the exact subset of tasks that maximizes total business value.</Text>
          </View>
        </View>
        <View style={s.bulletItem}>
          <Ionicons name="people" size={18} color={colors.branch} />
          <View style={{ flex: 1 }}>
            <Text style={s.bold}>Member Assignment (Branch & Bound)</Text>
            <Text style={s.subText}>Builds a cost matrix matching task skill demands (Frontend, Backend, ML, Hardware, DevOps) with member competencies to optimize workload balance.</Text>
          </View>
        </View>
      </Card>
    </View>
  );
}

// ── 3. PROJECT AI HUB ────────────────────────────────────────────────────────
function ProjectAISection() {
  return (
    <View style={{ gap: spacing.lg }}>
      <Card style={{ gap: spacing.md }}>
        <Text style={font.h2}>Project AI Hub (NEXUSFLOW 2.0)</Text>
        <Text style={s.paragraph}>
          The Project AI Hub is the central intelligence command center for your workspace. It bridges the gap between high-level natural language ideas and actionable engineering artifacts.
        </Text>
      </Card>

      <Card style={{ gap: spacing.md }}>
        <Text style={font.h3}>7 Specialized Intelligence Tabs</Text>
        
        <View style={s.tabExplain}>
          <Badge label="Brief" color={colors.primary} bg={colors.primarySoft} />
          <Text style={s.bold}>1. Project Brief & Context</Text>
          <Text style={s.subText}>Captures problem statements, target users, goals, hardware/software constraints, budget, and deployment environment.</Text>
        </View>

        <View style={s.tabExplain}>
          <Badge label="Guidance" color={colors.accentDark} bg={colors.accentSoft} />
          <Text style={s.bold}>2. Project Guidance & Readiness</Text>
          <Text style={s.subText}>Phase 6 guidance engine calculates a 0–100 Readiness Score, highlights skill gaps, generates a 4-phase engineering roadmap, and recommends 24-hour hackathon time slices.</Text>
        </View>

        <View style={s.tabExplain}>
          <Badge label="Copilot" color={colors.accent} bg={colors.accentSoft} />
          <Text style={s.bold}>3. Project Copilot</Text>
          <Text style={s.subText}>Multi-turn conversational advisor aware of your specific project facts, team skills, accepted decisions, and backlog state.</Text>
        </View>

        <View style={s.tabExplain}>
          <Badge label="Decisions" color={colors.greedy} bg={colors.greedy + "1A"} />
          <Text style={s.bold}>4. Decisions & AI Recommendations</Text>
          <Text style={s.subText}>Review AI technology suggestions with rationale and trade-offs. Accepted decisions are permanently recorded in project memory.</Text>
        </View>

        <View style={s.tabExplain}>
          <Badge label="Architecture" color={colors.topo} bg={colors.topo + "1A"} />
          <Text style={s.bold}>5. System Architecture Components</Text>
          <Text style={s.subText}>Architectural layers (Frontend, API, DB, AI/ML, IoT Gateway) with dependency links.</Text>
        </View>

        <View style={s.tabExplain}>
          <Badge label="Research" color={colors.branch} bg={colors.branch + "1A"} />
          <Text style={s.bold}>6. Research Topics</Text>
          <Text style={s.subText}>Technical feasibility investigations with relevant benchmarks (strictly zero fabricated citations).</Text>
        </View>

        <View style={s.tabExplain}>
          <Badge label="Decide" color={colors.merge} bg={colors.merge + "1A"} />
          <Text style={s.bold}>7. Decision Engine</Text>
          <Text style={s.subText}>Interactive multi-criteria decision analyzer evaluating trade-offs for databases, frameworks, auth, and hosting.</Text>
        </View>
      </Card>
    </View>
  );
}

// ── 4. AI SYSTEM & FALLBACK ──────────────────────────────────────────────────
function AIFallbackSection() {
  return (
    <View style={{ gap: spacing.lg }}>
      <Card style={{ gap: spacing.md }}>
        <Text style={font.h2}>OmniRoute — Hard $0 LLM Cost Policy</Text>
        <Text style={s.paragraph}>
          NEXUSFLOW enforces a strict financial safety policy: <Text style={s.bold}>$0.00 Total API Spending</Text>.
          All external intelligence routes through <Text style={s.bold}>OmniRoute</Text> with fail-closed validation,
          guaranteeing zero accidental selection of paid models, paid routes, or paid fallbacks.
        </Text>
        <View style={s.cascadeWrap}>
          <View style={s.cascadeStep}>
            <Text style={s.cascadeStepNum}>Tier 1 ($0 Free Tier)</Text>
            <Text style={s.cascadeStepTitle}>Google Gemini Free Tier (gemini-2.0-flash / gemini-1.5-flash)</Text>
            <Text style={s.cascadeStepDesc}>$0 input / $0 output via Google AI Studio Free Tier. High-speed reasoning with project context injection.</Text>
          </View>
          <Ionicons name="arrow-down" size={20} color={colors.textMuted} style={{ alignSelf: "center" }} />
          <View style={s.cascadeStep}>
            <Text style={s.cascadeStepNum}>Tier 2 ($0 Free Fallback)</Text>
            <Text style={s.cascadeStepTitle}>OpenRouter Free Models (openrouter/free & :free models)</Text>
            <Text style={s.cascadeStepDesc}>Strictly filtered to official $0 models (openrouter/free, meta-llama/llama-3.3-70b-instruct:free, deepseek/deepseek-r1:free). Zero paid fallback allowed.</Text>
          </View>
          <Ionicons name="arrow-down" size={20} color={colors.textMuted} style={{ alignSelf: "center" }} />
          <View style={[s.cascadeStep, { borderColor: colors.primary }]}>
            <Text style={[s.cascadeStepNum, { color: colors.primary }]}>Tier 3 (Local Heuristic Engine — $0 Local CPU)</Text>
            <Text style={s.cascadeStepTitle}>Deterministic Project Guidance Engine</Text>
            <Text style={s.cascadeStepDesc}>Rule-based heuristic engine delivering a 4-part grounded response: Direct Answer, Project Reasoning, Recommended Action, and Next Step. Operates 100% offline with zero external API calls.</Text>
          </View>
        </View>
      </Card>

      <Card style={{ gap: spacing.md }}>
        <Text style={font.h3}>Fail-Closed Safety Guarantee</Text>
        <Text style={s.paragraph}>
          If all free provider quotas are exhausted (e.g. HTTP 429), OmniRoute safely falls closed to the deterministic local engine. It will <Text style={s.bold}>NEVER</Text> switch to a paid model or incur any billing charges.
        </Text>
      </Card>

      <Card style={{ gap: spacing.md }}>
        <Text style={font.h3}>Private Conversation Memory</Text>
        <Text style={s.paragraph}>
          Copilot conversations are strictly private per user and project (<Text style={s.bold}>[projectId + user.id]</Text>). When User A asks a question, their conversation history and thumbs up/down feedback are persisted in <Text style={s.bold}>AIConversation</Text> and <Text style={s.bold}>AIMessage</Text> without leaking to User B.
        </Text>
      </Card>
    </View>
  );
}

// ── 5. DAA ALGORITHMS ────────────────────────────────────────────────────────
function DAASection() {
  const algos = [
    {
      name: "Boyer-Moore Pattern Matching",
      complexity: "Best: O(n/m) | Worst: O(n·m)",
      desc: "Fast substring search for task titles and descriptions. Uses Bad Character Rule and Good Suffix Rule to skip character comparisons right-to-left.",
      file: "server/algorithms/taskOptimiser.js",
    },
    {
      name: "Greedy Scheduler Scoring",
      complexity: "O(n log n)",
      desc: "Scores each task based on Urgency (w=0.4), Impact (w=0.4), and Dependency Blocker Factor (w=0.2) into a normalised 0–100 priority score.",
      file: "server/algorithms/greedyScheduler.js",
    },
    {
      name: "0/1 Knapsack Dynamic Programming",
      complexity: "O(n · W) where W is sprint hours",
      desc: "Selects the optimal subset of tasks fitting within total sprint capacity W to maximise aggregate business value without exceeding capacity.",
      file: "server/routes/teams.js",
    },
    {
      name: "Merge Sort (Stable Multi-Key)",
      complexity: "O(n log n) Guaranteed",
      desc: "Sorts backlog tasks across multi-column criteria (Earliest Deadline First, Progress %, Story Points) preserving original relative order for ties.",
      file: "server/utils/sortAlgorithms.js",
    },
    {
      name: "Topological Sort (Kahn's Algorithm)",
      complexity: "O(V + E)",
      desc: "Traverses the task dependency Directed Acyclic Graph (DAG) using in-degrees and BFS to compute the exact sequence tasks must be completed.",
      file: "server/algorithms/graphTraversal.js",
    },
    {
      name: "Branch & Bound Member Assignment",
      complexity: "State Space Tree Pruning",
      desc: "Matches task skill demand vectors against member competency vectors. Evaluates cost bounds and prunes subtrees to find the optimal assignment.",
      file: "server/algorithms/branchAndBound.js",
    },
  ];

  return (
    <View style={{ gap: spacing.lg }}>
      <Card style={{ gap: spacing.md }}>
        <Text style={font.h2}>Design & Analysis of Algorithms (DAA)</Text>
        <Text style={s.paragraph}>
          Every core operation in NEXUSFLOW is powered by formal DAA algorithmic implementations rather than naive heuristics:
        </Text>
      </Card>

      {algos.map((a) => (
        <Card key={a.name} style={{ gap: spacing.xs }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={font.h3}>{a.name}</Text>
            <Badge label={a.complexity} color={colors.primary} bg={colors.primarySoft} />
          </View>
          <Text style={s.paragraph}>{a.desc}</Text>
          <Text style={s.fileLink}>Module: {a.file}</Text>
        </Card>
      ))}
    </View>
  );
}

// ── 6. AUTHENTICATION ────────────────────────────────────────────────────────
function AuthenticationSection() {
  return (
    <View style={{ gap: spacing.lg }}>
      <Card style={{ gap: spacing.md }}>
        <Text style={font.h2}>Production User Authentication</Text>
        <Text style={s.paragraph}>
          NEXUSFLOW 2.0 features full user lifecycle authentication, bcrypt password security, and global profile synchronization:
        </Text>
      </Card>

      <Card style={{ gap: spacing.md }}>
        <Text style={font.h3}>Authentication Endpoints</Text>
        
        <View style={s.apiRow}>
          <Badge label="POST" color="#fff" bg={colors.primary} />
          <Text style={s.endpoint}>/api/auth/signup</Text>
        </View>
        <Text style={s.subText}>Validates required fields, email format, password strength (min 6 chars), and checks email uniqueness. Hashes password with bcrypt before creating MongoDB User.</Text>

        <View style={s.apiRow}>
          <Badge label="POST" color="#fff" bg={colors.accentDark} />
          <Text style={s.endpoint}>/api/auth/login</Text>
        </View>
        <Text style={s.subText}>Validates credentials using bcrypt compare. Returns 7-day signed JWT access token and user profile.</Text>

        <View style={s.apiRow}>
          <Badge label="GET" color="#fff" bg={colors.greedy} />
          <Text style={s.endpoint}>/api/me</Text>
        </View>
        <Text style={s.subText}>Requires JWT Bearer header. Returns fresh user profile for session restoration on browser refresh.</Text>

        <View style={s.apiRow}>
          <Badge label="PATCH" color="#fff" bg={colors.knapsack} />
          <Text style={s.endpoint}>/api/me</Text>
        </View>
        <Text style={s.subText}>Updates display name, avatar photo, bio, role, and skills. Automatically cascades updated name and avatar to all team rosters where the user is a member.</Text>
      </Card>
    </View>
  );
}

// ── 7. JWT EXPLAINED FOR STUDENTS ────────────────────────────────────────────
function JWTStudentSection() {
  return (
    <View style={{ gap: spacing.lg }}>
      <Card style={{ gap: spacing.md }}>
        <Text style={font.h2}>JSON Web Tokens (JWT) Explained</Text>
        <Text style={s.paragraph}>
          A JSON Web Token (JWT) is a compact, URL-safe means of representing claims to be transferred between two parties (your browser and the NexusFlow Express server).
        </Text>
      </Card>

      <Card style={{ gap: spacing.md }}>
        <Text style={font.h3}>The 3 Parts of a JWT</Text>
        <View style={s.jwtBox}>
          <Text style={[s.jwtPart, { color: colors.danger }]}>eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9</Text>
          <Text style={s.jwtDot}>.</Text>
          <Text style={[s.jwtPart, { color: colors.primary }]}>eyJpZCI6IjY2ZDI...IiwiZW1haWwiOiJhbGV4QGV4YW1wbGUuY29tIn0</Text>
          <Text style={s.jwtDot}>.</Text>
          <Text style={[s.jwtPart, { color: colors.accentDark }]}>TJVA95OrM7E2cBab30RMHrHDcEfxjoYZgeFONFh7HgQ</Text>
        </View>
        <View style={{ gap: 6, marginTop: 4 }}>
          <Text style={s.paragraph}><Text style={[s.bold, { color: colors.danger }]}>1. Header (Red):</Text> Algorithm & Token Type (HMAC-SHA256)</Text>
          <Text style={s.paragraph}><Text style={[s.bold, { color: colors.primary }]}>2. Payload (Green):</Text> The Claims (User ID, Email, Name, Expiration)</Text>
          <Text style={s.paragraph}><Text style={[s.bold, { color: colors.accentDark }]}>3. Signature (Teal):</Text> Cryptographic seal created using `JWT_SECRET`. Prevents tampering!</Text>
        </View>
      </Card>

      <Card style={{ gap: spacing.md }}>
        <Text style={font.h3}>Authentication vs. Authorization</Text>
        <View style={s.diffGrid}>
          <View style={s.diffCard}>
            <Text style={s.diffTitle}>Authentication (AuthN)</Text>
            <Text style={s.diffSub}>"Who are you?"</Text>
            <Text style={s.diffTxt}>Verifying identity via email & password. The backend issues a JWT to prove who you are.</Text>
          </View>
          <View style={s.diffCard}>
            <Text style={s.diffTitle}>Authorization (AuthZ)</Text>
            <Text style={s.diffSub}>"What are you allowed to do?"</Text>
            <Text style={s.diffTxt}>Checking permissions. Example: User A has a valid JWT (AuthN), but is NOT allowed to view Team Beta (AuthZ → 403 Forbidden).</Text>
          </View>
        </View>
      </Card>
    </View>
  );
}

// ── 8. SECURITY & ISOLATION ──────────────────────────────────────────────────
function SecuritySection() {
  return (
    <View style={{ gap: spacing.lg }}>
      <Card style={{ gap: spacing.md }}>
        <Text style={font.h2}>Security & Strict Multi-Tenant Isolation</Text>
        <Text style={s.paragraph}>
          In NEXUSFLOW 2.0, multi-tenant isolation is enforced at the database query layer on every request:
        </Text>
      </Card>

      <Card style={{ gap: spacing.md }}>
        <Text style={font.h3}>Security Guarantees</Text>
        
        <View style={s.secItem}>
          <Ionicons name="shield-checkmark" size={20} color={colors.success} />
          <View style={{ flex: 1 }}>
            <Text style={s.bold}>No Team Leakage (`GET /api/teams`)</Text>
            <Text style={s.subText}>Query is strictly scoped to `ownerId == user.id || members.userId == user.id`. Users never receive another team's data.</Text>
          </View>
        </View>

        <View style={s.secItem}>
          <Ionicons name="shield-checkmark" size={20} color={colors.success} />
          <View style={{ flex: 1 }}>
            <Text style={s.bold}>Server-Side Project Access Control</Text>
            <Text style={s.subText}>All project queries check team membership. Changing URL parameters or IDs returns `403 Forbidden`.</Text>
          </View>
        </View>

        <View style={s.secItem}>
          <Ionicons name="shield-checkmark" size={20} color={colors.success} />
          <View style={{ flex: 1 }}>
            <Text style={s.bold}>Private Copilot Chat Sessions</Text>
            <Text style={s.subText}>Conversations are indexed by `[projectId + user.id]`. User A cannot read or mutate User B's Copilot conversation turns.</Text>
          </View>
        </View>

        <View style={s.secItem}>
          <Ionicons name="shield-checkmark" size={20} color={colors.success} />
          <View style={{ flex: 1 }}>
            <Text style={s.bold}>Bcrypt Password Salting</Text>
            <Text style={s.subText}>Passwords are never stored in plaintext. Mongoose `select: false` prevents accidental leakage in database dumps.</Text>
          </View>
        </View>
      </Card>
    </View>
  );
}

// ── 9. SYSTEM ARCHITECTURE ───────────────────────────────────────────────────
function ArchitectureSection() {
  return (
    <View style={{ gap: spacing.lg }}>
      <Card style={{ gap: spacing.md }}>
        <Text style={font.h2}>System Architecture & Data Flow</Text>
        <Text style={s.paragraph}>
          The complete end-to-end architecture connects the client, Express REST API, algorithmic workers, and MongoDB:
        </Text>
        <View style={s.diagramBox}>
          <Text style={s.diagramTxt}>{`
+-------------------------------------------------------------------+
|                        REACT FRONTEND                             |
|  (Expo / React Native Web - AuthProvider, Workspace, Project AI)  |
+-------------------------------------------------------------------+
                                  │
                   HTTPS / JSON + Bearer JWT Header
                                  │
                                  ▼
+-------------------------------------------------------------------+
|                        EXPRESS REST API                           |
|       requireAuth Middleware (JWT Signature & Token Verification) |
|       verifyTeamAccess (Server-Side Authorization & Isolation)    |
+-------------------------------------------------------------------+
                                  │
         ┌────────────────────────┴────────────────────────┐
         ▼                                                 ▼
+-----------------------+                         +-----------------------+
|  REST ROUTE HANDLERS  |                         |    AI ORCHESTRATOR    |
|  • /api/teams         |                         |  (via OmniRoute $0)   |
|  • /api/projects      |                         |  • Tier 1: Gemini Free|
|  • /api/tasks         |                         |  • Tier 2: OpenRouter |
+-----------------------+                         |  • Tier 3: Guidance   |
         │                                        +-----------------------+
         │                                                 │
         └────────────────────────┬────────────────────────┘
                                  │
                                  ▼
+-------------------------------------------------------------------+
|                     MONGOOSE ORM & MONGODB                        |
|  Users · Teams · Projects · Tasks · Decisions · AIConversations   |
+-------------------------------------------------------------------+
`}</Text>
        </View>
      </Card>
    </View>
  );
}

// ── 10. LOW LEVEL DESIGN (LLD) ───────────────────────────────────────────────
function LLDSection() {
  return (
    <View style={{ gap: spacing.lg }}>
      <Card style={{ gap: spacing.md }}>
        <Text style={font.h2}>Low-Level Design (LLD) Reference</Text>
        <Text style={s.paragraph}>
          Summary of primary modules across the NEXUSFLOW codebase:
        </Text>
      </Card>

      <Card style={{ gap: spacing.md }}>
        <Text style={font.h3}>Backend Modules</Text>
        <View style={s.lldRow}>
          <Text style={s.bold}>server/services/omniRoute.js</Text>
          <Text style={s.subText}>Strict $0 LLM routing engine, fail-closed route validation guard (`validateZeroCostRoute`), Gemini Free Tier & OpenRouter Free invocations.</Text>
        </View>
        <View style={s.lldRow}>
          <Text style={s.bold}>server/services/aiOrchestrator.js</Text>
          <Text style={s.subText}>Central Copilot and Project Analysis orchestrator delegating exclusively through OmniRoute with zero paid fallback.</Text>
        </View>
        <View style={s.lldRow}>
          <Text style={s.bold}>server/auth.js</Text>
          <Text style={s.subText}>JWT signing, token verification, `requireAuth` middleware, and User formatting.</Text>
        </View>
        <View style={s.lldRow}>
          <Text style={s.bold}>server/index.js</Text>
          <Text style={s.subText}>Express bootstrap, auth routes (`/api/auth/signup`, `/api/auth/login`, `/api/me`), Socket.io server.</Text>
        </View>
        <View style={s.lldRow}>
          <Text style={s.bold}>server/routes/teams.js</Text>
          <Text style={s.subText}>Team CRUD, user isolation, member roster management, DAA analytics, and Knapsack sprint optimizer.</Text>
        </View>
        <View style={s.lldRow}>
          <Text style={s.bold}>server/routes/projects.js</Text>
          <Text style={s.subText}>Project CRUD, Project Intelligence, Copilot chat, Decisions, Recommendations, Architecture components.</Text>
        </View>
        <View style={s.lldRow}>
          <Text style={s.bold}>server/services/projectIntelligence.js</Text>
          <Text style={s.subText}>Aggregates context, runs AI analysis, manages private Copilot sessions, and extracts memory updates.</Text>
        </View>
      </Card>

      <Card style={{ gap: spacing.md }}>
        <Text style={font.h3}>Frontend Modules</Text>
        <View style={s.lldRow}>
          <Text style={s.bold}>client/context/AuthContext.tsx</Text>
          <Text style={s.subText}>Global central user state, session restoration, signup, login, and instant profile update dispatch.</Text>
        </View>
        <View style={s.lldRow}>
          <Text style={s.bold}>client/components/workspace/ProjectAdvisorPanel.tsx</Text>
          <Text style={s.subText}>Project AI Hub UI with 7 tabs (Brief, Guidance, Copilot, Decisions, Architecture, Research, Decide).</Text>
        </View>
        <View style={s.lldRow}>
          <Text style={s.bold}>client/components/workspace/SprintPanel.tsx</Text>
          <Text style={s.subText}>0/1 Knapsack DP Sprint Optimizer UI with capacity dial, value-density ranking, and commit actions.</Text>
        </View>
        <View style={s.lldRow}>
          <Text style={s.bold}>client/components/workspace/GraphPanel.tsx</Text>
          <Text style={s.subText}>Topological sort DAG dependency graph visualization with node statuses and blocker highlights.</Text>
        </View>
        <View style={s.lldRow}>
          <Text style={s.bold}>client/components/workspace/AssignmentBoard.tsx</Text>
          <Text style={s.subText}>Branch & Bound member assignment roster with skill demand matrix and workload distribution.</Text>
        </View>
      </Card>
    </View>
  );
}

// ── Stylesheet ───────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  back: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceAlt,
  },
  logoIcon: {
    width: 32,
    height: 32,
    borderRadius: 9,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  headerSub: { fontSize: 12, color: colors.textMuted, marginTop: 1 },

  navWrap: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  navBar: {
    gap: 8,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  navPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  navPillActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  navPillTxt: {
    fontSize: 12.5,
    fontWeight: "700",
    color: colors.textMuted,
  },
  navPillTxtActive: {
    color: "#fff",
  },
  miniBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  miniBadgeTxt: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.textFaint,
  },

  contentScroll: {
    padding: spacing.lg,
    alignItems: "center",
  },
  container: {
    width: "100%",
    maxWidth: layout.maxWidth,
    gap: spacing.lg,
  },

  paragraph: {
    fontSize: 14,
    color: colors.text,
    lineHeight: 22,
  },
  bold: {
    fontWeight: "700",
    color: colors.text,
  },
  subText: {
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 19,
    marginTop: 2,
  },
  fileLink: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: "600",
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
    marginTop: 4,
  },

  codeBox: {
    backgroundColor: colors.surfaceAlt,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  codeTxt: {
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
    fontSize: 13,
    color: colors.primary,
    fontWeight: "700",
  },

  stepRow: {
    flexDirection: "row",
    gap: spacing.md,
    alignItems: "flex-start",
    paddingVertical: 4,
  },
  stepBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  stepBadgeTxt: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.primary,
  },
  stepTitle: {
    fontSize: 14.5,
    fontWeight: "700",
    color: colors.text,
  },
  stepDesc: {
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 19,
    marginTop: 2,
  },

  bulletItem: {
    flexDirection: "row",
    gap: spacing.md,
    alignItems: "flex-start",
    paddingVertical: 4,
  },

  tabExplain: {
    gap: 3,
    padding: spacing.sm,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },

  cascadeWrap: {
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  cascadeStep: {
    padding: spacing.md,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    gap: 3,
  },
  cascadeStepNum: {
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    color: colors.textFaint,
    letterSpacing: 0.5,
  },
  cascadeStepTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.text,
  },
  cascadeStepDesc: {
    fontSize: 12.5,
    color: colors.textMuted,
    lineHeight: 18,
  },

  apiRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 6,
  },
  endpoint: {
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
    fontSize: 13.5,
    fontWeight: "700",
    color: colors.text,
  },

  jwtBox: {
    backgroundColor: colors.surfaceAlt,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
  },
  jwtPart: {
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
    fontSize: 11.5,
    fontWeight: "700",
  },
  jwtDot: {
    fontSize: 14,
    fontWeight: "900",
    color: colors.textFaint,
    marginHorizontal: 2,
  },

  diffGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
    marginTop: 4,
  },
  diffCard: {
    flex: 1,
    minWidth: 240,
    backgroundColor: colors.surfaceAlt,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 4,
  },
  diffTitle: {
    fontSize: 14.5,
    fontWeight: "700",
    color: colors.text,
  },
  diffSub: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.primary,
    fontStyle: "italic",
  },
  diffTxt: {
    fontSize: 12.5,
    color: colors.textMuted,
    lineHeight: 18,
    marginTop: 2,
  },

  secItem: {
    flexDirection: "row",
    gap: spacing.md,
    alignItems: "flex-start",
    paddingVertical: 4,
  },

  diagramBox: {
    backgroundColor: "#111827",
    borderRadius: radius.lg,
    padding: spacing.md,
    marginTop: spacing.sm,
    overflow: "hidden",
  },
  diagramTxt: {
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
    fontSize: 11,
    color: "#E5E7EB",
    lineHeight: 16,
  },

  lldRow: {
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 2,
  },
});
