# NexusFlow V4.0 — Workstreams 16–20
## Implementation Prompts + Master Execution Prompt

### Overview

Workstreams 16–20 extend NexusFlow from process/academic intelligence into
project context, multimodal AI, domain intelligence, domain×methodology
intelligence, and a research-ready local AI provider layer.

16. Copilot Attachments + Temporary Context
17. Multimodal Copilot
18. Domain Intelligence
19. Domain × Methodology Intelligence
20. Local AI Core — Research + Integration Foundation

Global rules:
- Preserve Classic, Waterfall, Scrum, Kanban, and Hybrid.
- DAA remains deterministic and independent of AI.
- AI is advisory/explanatory; it must not silently mutate project state.
- Temporary context must not become persistent memory without explicit user action.
- No paid AI dependency. Preserve Gemini → Groq → OpenRouter → graceful failure.
- Do not select or deploy a local model merely to claim completion.
- Do not fabricate domain expertise, evidence, academic results, or metrics.
- Backend authorization and project isolation are mandatory.

---

# 16 — COPILOT ATTACHMENTS + TEMPORARY CONTEXT

## Description

Allow Project AI/Copilot to use files and other project artifacts as
conversation-scoped context without automatically storing everything in
persistent Project Memory.

## Implement

Support, where the existing file infrastructure permits:
- PDF
- DOC/DOCX
- Markdown
- TXT
- CSV
- images
- architecture/workflow/ER diagrams
- specifications, requirements, plans, and code/text snippets

Create a clear distinction between:
- Persistent Project Memory
- Temporary Copilot Context

Temporary context should track project/session ownership, source metadata,
extracted content, lifecycle/expiry, and processing state.

Provide an explicit “Save to Project Memory” action. Nothing temporary may
become persistent implicitly.

Integrate the context builder with:
project context + methodology context + persistent memory + temporary
attachments + current conversation context.

Add attachment UI with upload, processing, remove, error, and save-to-memory
states.

Enforce project/user isolation and authorization.

## Tests

Test upload, extraction, lifecycle, isolation, expiry, explicit memory save,
malformed/empty files, unauthorized access, and AI-unavailable behavior.

---

# 17 — MULTIMODAL COPILOT

## Description

Extend Project AI to reason over supported visual and document artifacts when
the selected provider supports the modality.

## Implement

Support useful analysis of:
- requirements/specifications
- documentation
- architecture diagrams
- workflow diagrams
- ER diagrams
- screenshots
- UI designs
- charts
- whiteboards/project diagrams

Potential structured extraction:
- requirements
- entities
- constraints
- risks
- milestones
- dependencies
- terminology
- assumptions

AI output must be schema-validated before application use.

Architecture:
AI → structured response → validation → human review → optional action.

Do not automatically mutate tasks, requirements, dependencies, methodology,
memory, or other project state.

Preserve:
Gemini → Groq → OpenRouter → graceful failure.

If a provider cannot handle a modality, detect that capability and fail or
route appropriately rather than pretending it supports it.

## Tests

Text, image, document, unsupported format, schema validation, provider
fallback, AI failure, isolation, and prompt/context-injection resistance
where applicable.

---

# 18 — DOMAIN INTELLIGENCE

## Description

Introduce a reusable domain layer so project intelligence can adapt to the
nature of the project without contaminating the common project-management
core.

Initial taxonomy may include:
- Software Engineering
- Cybersecurity
- AI / Machine Learning
- IoT / Embedded
- Cloud Computing
- Data Science
- Electronics
- Civil / Structural
- Research
- Academic General

## Implement

Create a canonical domain profile containing, as appropriate:
- domain/subdomain
- terminology
- artifact types
- requirement types
- risk types
- quality dimensions
- metrics
- expected deliverables
- recommended evidence
- domain rules

Create a safe rule registry rather than hard-coding domain behavior across
services.

Examples of advisory domain artifacts:
Cybersecurity → threat model, attack surface, security testing
IoT → hardware, firmware, sensor validation, physical testing
Civil/Structural → structural parameters, sensor evidence, anomaly analysis

Do not claim scientific authority unless a rule is explicitly configured or
supported by evidence.

Domain intelligence may recommend missing artifacts, risks, evidence,
metrics, and requirements. Recommendations remain advisory.

Add domain selection/profile UI.

## Tests

Domain selection, profiles, rules, recommendations, unknown domains,
project switching, methodology compatibility, isolation, and AI failure.

---

# 19 — DOMAIN × METHODOLOGY INTELLIGENCE

## Description

Combine the Domain Engine with the existing Methodology Engine.

Examples:
- Software × Scrum
- Cybersecurity × Kanban
- IoT × Waterfall
- Structural × Waterfall
- Research × Hybrid

Do NOT build separate applications for combinations.

Architecture:
Common Core + Domain Adapter + Methodology Adapter + Shared UI.

## Implement

Create a deterministic environment resolver.

Input:
project domain + methodology

Output:
- active domain profile
- methodology configuration
- applicable domain rules
- applicable workflow rules
- recommended artifacts
- relevant metrics
- enabled intelligence modules

Support:
Classic, Waterfall, Scrum, Kanban, Hybrid.

If domain and methodology rules conflict, expose a structured conflict rather
than silently overriding either side.

Allow domain-aware recommendations, process intelligence, and academic
criteria to consume the resolved environment without duplicating existing
engines.

UI should clearly show the active environment, e.g.
“Cybersecurity × Kanban”.

## Tests

Test multiple domains across all five methodologies, conflict handling,
resolver determinism, project isolation, and regression of existing
methodology engines.

---

# 20 — LOCAL AI CORE
## Research + Integration Foundation

## Description

Prepare NexusFlow for future local/pretrained AI without prematurely selecting
or hosting a model.

The exact local model is intentionally undecided.

Do NOT download a huge model just to claim implementation.

## Implement

Create/use a provider abstraction supporting:
- Gemini
- Groq
- OpenRouter
- future Local Model provider

Conceptually:
AIProvider
├── GeminiProvider
├── GroqProvider
├── OpenRouterProvider
└── LocalModelProvider

Production routing remains:
Gemini → Groq → OpenRouter → graceful failure.

Local AI remains optional/research-ready until explicitly configured.

Create local-model configuration capable of representing:
- model
- source
- endpoint
- runtime
- context length
- modalities
- quantization
- memory estimate
- device
- availability

Create a model metadata/registry abstraction with fields such as:
name, version, provider, runtime, parameter count, quantization,
context length, modalities, memory estimate, license, source, status.

Define a LocalModelProvider interface such as:
loadModel()
healthCheck()
generate()
generateStructured()
supportsModality()
getMetadata()

Implement capability detection so unsupported modalities are rejected
cleanly.

Add non-sensitive AI observability:
provider, model, latency, success/failure, fallback, token usage if available,
error category. Never store secrets.

Create/update research documentation covering model classes, runtimes,
quantization, CPU/GPU requirements, context length, multimodal capability,
licensing, and benchmark criteria.

Do not declare a final local model.

## Tests

Provider interface, provider selection, fallback, local provider unavailable,
capability detection, model registry, structured output, AI failure, DAA
independence, and secrets protection.

---

# MASTER EXECUTION PROMPT

You are the senior architect, implementation engineer, database engineer,
backend/frontend engineer, QA engineer, security engineer, and integration
engineer for NexusFlow V4.0.

Execute Workstreams 16–20 completely in ONE continuous run.

Do not stop at planning.
Do not create placeholder-only implementations.
Do not ask for approval between workstreams.

First inspect the entire repository and determine what already exists.
Reuse existing Project Memory, Project Context, OmniRoute, AI orchestration,
methodology engines, traceability, process mining, conformance, academic
intelligence, file infrastructure, authentication, authorization, MongoDB,
Socket.IO, Three.js, and existing UI components.

Then execute:

INSPECT
→ DESIGN
→ IMPLEMENT
→ FOCUSED TEST
→ FIX
→ RETEST
→ INTEGRATE
→ REGRESSION
→ SECURITY
→ DATABASE
→ API
→ SOCKET.IO
→ BUILD
→ BROWSER VERIFY
→ FINAL AUDIT

## Mandatory integration

Verify:

Attachment
→ Temporary Context
→ Project Context
→ Domain Context
→ Methodology Context
→ Copilot
→ Multimodal AI

and:

Domain + Methodology
→ Environment Resolver
→ Process Intelligence
→ Academic Intelligence
→ Project AI

## Mandatory DAA/AI isolation

Prove that with AI disabled:
- DAA still works
- Process Mining still works
- Conformance still works
- Traceability still works
- Academic evidence calculations still work
- Contribution calculations still work

AI must never become the deterministic source of truth.

## Security

Explicitly test:
- user A cannot access user B attachments
- project A cannot access project B temporary context
- project A cannot access project B domain data
- teacher permissions remain restricted
- private memory remains private
- provider keys remain server-side
- temporary context cannot silently become persistent memory

## Test suites

Create/update:
scripts/testCopilotAttachments.js
scripts/testMultimodalCopilot.js
scripts/testDomainIntelligence.js
scripts/testDomainMethodology.js
scripts/testLocalAICore.js
scripts/testWorkstreams16to20Integration.js

Run focused tests and fix failures.

## Full regression

Run all relevant existing suites for:
Classic/V3
Waterfall
Scrum
Kanban
Hybrid
Task Intelligence
Reactive Planning
Traceability
Memory
Team Capability
Dynamic Assignment
Learning Loop
Decision Intelligence
Project Health
Risk
Methodology Advisor
Adaptive Methodology
What-If Simulation
Digital Twin
Process Mining
Conformance
Teacher Review
Academic Evaluation
Fair Contribution

Then run Workstreams 16–20 and the cross-feature integration suite.

## Build and live verification

Run:
backend syntax checks
npx tsc --noEmit
npm run build
MongoDB connectivity
API checks
Socket.IO checks

Start the real application where possible and verify actual HTTP behavior for:
attachments, temporary context, multimodal capability, domain,
domain×methodology, and local-AI configuration.

If graphical browser access exists, verify desktop 1440×900 and 1280×800,
tablet 768×1024, and mobile 390×844.

Check navigation, Project AI, attachments, temporary context,
save-to-memory, domain selector, domain×methodology environment,
AI capability state, responsiveness, console errors, network errors,
404/CORS, authorization, and refresh persistence.

If browser verification is impossible, report:
BROWSER VERIFICATION: BLOCKED
with the actual reason. Never call blocked testing PASS.

## Bug fixing

For every genuine failure:
1. identify root cause
2. fix production code where required
3. rerun focused test
4. rerun affected regression
5. continue until stable

Do not weaken assertions just to obtain PASS.
Do not suppress failures.

## Final report

Create:

NexusFlow_V4_Workstreams_16-20_Execution_Report.md

Include:

1. Executive summary
2. Per-workstream PASS/FAIL/BLOCKED status
3. Focused test counts
4. Integration test counts
5. Regression counts
6. Actual files created/modified/deleted
7. Database changes
8. API changes
9. Socket.IO changes
10. Security results
11. AI/DAA separation results
12. Build results
13. Browser results
14. Bugs fixed
15. Limitations
16. Deferred work
17. Final architecture status

Use actual numbers only.

Never fabricate:
- test counts
- PASS counts
- browser results
- AI capabilities
- model availability
- domain expertise
- academic results
- performance numbers
- database records

If it passes: PASS.
If it fails: FAIL.
If it cannot be verified: BLOCKED.
If intentionally postponed: DEFERRED.

Continue through Workstream 20 and the complete verification cycle before
producing the final report.
