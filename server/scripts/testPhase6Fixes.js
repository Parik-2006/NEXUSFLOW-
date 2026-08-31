/**
 * server/scripts/testPhase6Fixes.js
 * Verification of Copilot Intent Classification, Project Context Injection,
 * Deterministic Fallbacks, and Multi-turn Memory.
 */

import {
  classifyQuestionIntent,
  generateDeterministicCopilotAnswer,
} from "../services/projectIntelligence.js";

function runTests() {
  console.log("==================================================");
  console.log("TESTING COPILOT INTENT CLASSIFICATION & ANSWERS");
  console.log("==================================================");

  const smartIrrigationContext = {
    title: "Smart Irrigation System using IoT and Machine Learning",
    domain: "IoT & Embedded Systems",
    projectType: "Smart IoT Monitoring & Automation",
    description: "An automated irrigation system that reads soil moisture, temperature and controls water pumps using ESP32 and ML predictions.",
    context: {
      problemStatement: "Overwatering and inefficient water usage in agriculture.",
      hardwareRequirements: ["Capacitive Soil Moisture Sensor", "DHT22 Sensor", "ESP32 DevKit V1", "5V Relay Module & Water Pump"],
      softwareRequirements: ["Node.js + Express", "React Native", "MongoDB"],
      aiMlRequirements: ["Random Forest Regressor for moisture prediction"],
      preferredStack: ["ESP32", "Node.js", "React Native", "MongoDB"],
    },
    taskStats: { total: 8, done: 2, inProgress: 1, sampleTitles: ["Setup ESP32 Circuit", "Build Ingestion API", "Design Mobile UI"] },
    acceptedDecisions: [
      { category: "hardware", title: "Microcontroller Selection", decision: "Use ESP32 DevKit V1 for Wi-Fi and low power", reasoning: "Built-in Wi-Fi and ADC" },
    ],
    architectureComponents: [
      { type: "hardware", name: "IoT Sensor Node", technology: "ESP32 + C++" },
      { type: "backend", name: "Core API", technology: "Node.js + Express" },
      { type: "database", name: "Telemetry Store", technology: "MongoDB" },
    ],
  };

  const testQuestions = [
    { q: "What hardware do I need?", expectedIntent: "hardware" },
    { q: "Do I need AI or ML?", expectedIntent: "ai_ml" },
    { q: "What dataset should I collect?", expectedIntent: "dataset" },
    { q: "What should I build first?", expectedIntent: "roadmap" },
    { q: "What can I finish in 24 hours?", expectedIntent: "hackathon" },
    { q: "Suggest my next decision.", expectedIntent: "next_decision" },
    { q: "What research should I do?", expectedIntent: "research" },
    { q: "How should I deploy this?", expectedIntent: "deployment" },
  ];

  let passed = 0;
  const answers = [];

  for (let i = 0; i < testQuestions.length; i++) {
    const { q, expectedIntent } = testQuestions[i];
    const detected = classifyQuestionIntent(q);
    const intentOk = detected === expectedIntent;
    if (intentOk) passed++;

    const answer = generateDeterministicCopilotAnswer(detected, q, smartIrrigationContext);
    answers.push({ q, detected, answer });

    console.log(`\n--- TEST ${i + 1}: "${q}" ---`);
    console.log(`Detected Intent: [${detected}] (Expected: [${expectedIntent}]) -> ${intentOk ? "✓ PASS" : "✗ FAIL"}`);
    console.log(`Answer Preview:\n${answer.slice(0, 200)}...\n`);
  }

  // Verify all 8 answers are UNIQUE and not identical
  const uniqueAnswers = new Set(answers.map((a) => a.answer));
  console.log(`Unique answers generated: ${uniqueAnswers.size} / ${testQuestions.length}`);
  const uniquenessOk = uniqueAnswers.size === testQuestions.length;

  // Verify Hardware answer specifically mentions ESP32 / Moisture sensor
  const hwAnswer = answers.find((a) => a.detected === "hardware")?.answer || "";
  const hwRelevant = hwAnswer.includes("ESP32") && hwAnswer.includes("Moisture");

  // Verify non-hardware project (Hospital Management)
  const hospitalContext = {
    title: "Hospital Management System",
    domain: "Healthcare / MedTech",
    description: "Doctor appointment booking and EHR management platform.",
    context: {
      problemStatement: "Managing patient queues and medical records.",
      hardwareRequirements: [],
      softwareRequirements: ["React.js", "Express", "PostgreSQL"],
      aiMlRequirements: [],
      preferredStack: ["React.js", "Express", "PostgreSQL"],
    },
    taskStats: { total: 6, done: 0, sampleTitles: ["Setup Auth", "Doctor Schedule API"] },
  };

  const hospHwAnswer = generateDeterministicCopilotAnswer("hardware", "What hardware do I need?", hospitalContext);
  const hospNoHwOk = hospHwAnswer.includes("not required") || hospHwAnswer.includes("Not Required");

  console.log("\n==================================================");
  console.log("VALIDATION SUMMARY:");
  console.log(`• Intent Classification: ${passed}/${testQuestions.length} passed`);
  console.log(`• Answer Uniqueness: ${uniquenessOk ? "✓ PASS" : "✗ FAIL"}`);
  console.log(`• Smart Irrigation Hardware Grounding: ${hwRelevant ? "✓ PASS" : "✗ FAIL"}`);
  console.log(`• Hospital System Non-Hardware Detection: ${hospNoHwOk ? "✓ PASS" : "✗ FAIL"}`);
  console.log("==================================================");

  if (passed === testQuestions.length && uniquenessOk && hwRelevant && hospNoHwOk) {
    console.log("ALL TESTS PASSED SUCCESSFULLY! ✓");
    process.exit(0);
  } else {
    console.error("SOME TESTS FAILED ✗");
    process.exit(1);
  }
}

runTests();
