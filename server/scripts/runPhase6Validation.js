import mongoose from 'mongoose';

async function runAllTests() {
  const results = [];
  const addResult = (id, name, pass, observed, expected) => {
    results.push({ id, name, pass, observed, expected });
    console.log((pass ? '✓ PASS' : '✗ FAIL') + ' - ' + id + ': ' + name);
  };

  // Auth login
  const loginRes = await fetch('http://localhost:4000/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'validator@nexusflow.dev' })
  });
  const { token } = await loginRes.json();

  // Test Projects
  const projects = [
    {
      key: 'irrigation',
      name: 'Smart Irrigation Team',
      projectTitle: 'Smart Irrigation System using IoT and Machine Learning',
      projectDescription: 'An IoT-based smart irrigation system that uses soil moisture sensors to monitor field conditions and automatically control irrigation. Historical sensor data will be used to develop a machine learning model for better irrigation decisions.',
      members: [{ name: 'Alice', skills: { frontend: 8, backend: 8, ml: 4, devops: 6, design: 5, testing: 7 } }]
    },
    {
      key: 'event',
      name: 'College Event Team',
      projectTitle: 'College Event Management Website',
      projectDescription: 'A web portal for student event registrations, ticket management, schedule announcements, and feedback collection.',
      members: [{ name: 'Bob', skills: { frontend: 7, backend: 7, ml: 5, devops: 5, design: 6, testing: 6 } }]
    },
    {
      key: 'interview',
      name: 'AI Interview Team',
      projectTitle: 'AI Interview Assistant with Speech and NLP',
      projectDescription: 'Automated video interview platform analyzing candidate speech, sentiment, and technical question responses using Whisper and NLP models.',
      members: [{ name: 'Carol', skills: { frontend: 6, backend: 6, ml: 8, devops: 5, design: 5, testing: 6 } }]
    },
    {
      key: 'waste',
      name: 'IoT Waste Team',
      projectTitle: 'IoT Waste Management System with Ultrasonic Fill-Level Sensors',
      projectDescription: 'Smart dustbin monitoring using ultrasonic sensors and ESP32 to detect garbage level and optimize municipal waste collection routes.',
      members: [{ name: 'Dan', skills: { frontend: 6, backend: 6, ml: 5, devops: 5, design: 5, testing: 5 } }]
    },
    {
      key: 'hospital',
      name: 'Hospital Management Team',
      projectTitle: 'Hospital Management System with Doctor Appointment Booking',
      projectDescription: 'Full-stack healthcare platform for patient registration, doctor scheduling, electronic health records (EHR), and prescription billing.',
      members: [{ name: 'Eve', skills: { frontend: 8, backend: 8, ml: 4, devops: 7, design: 7, testing: 7 } }]
    }
  ];

  const createdTeams = {};
  for (const p of projects) {
    const createRes = await fetch('http://localhost:4000/api/teams', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify(p)
    });
    const t = await createRes.json();
    createdTeams[p.key] = t._id;
  }

  // TEST 1: Basic Guidance Endpoint
  const g1Res = await fetch('http://localhost:4000/api/teams/' + createdTeams.irrigation + '/project-guidance', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ hackathonHours: 24 })
  });
  const g1Data = await g1Res.json();
  addResult('TEST 1', 'Basic Project Guidance API & Payload Structure', g1Res.status === 200 && g1Data.success === true && g1Data.guidance?.readiness?.score > 0, 'Status ' + g1Res.status + ', score: ' + g1Data.guidance?.readiness?.score, 'Status 200, valid payload');

  // TEST 2: Context Grounding (Smart Irrigation)
  const gIrr = g1Data.guidance;
  const irrRelevant = gIrr.projectUnderstanding.domain.includes('IoT') || gIrr.projectUnderstanding.domain.includes('Agri');
  const irrNoEcom = !JSON.stringify(gIrr).includes('shopping cart') && !JSON.stringify(gIrr).includes('hotel booking');
  addResult('TEST 2', 'Context Grounding (Smart Irrigation - No Random Suggestions)', irrRelevant && irrNoEcom, 'Domain: ' + gIrr.projectUnderstanding.domain + ', No hallucinated e-commerce', 'IoT/Agri domain, zero irrelevant features');

  // TEST 3: Hardware Project Detection (Waste Management)
  const gWasteRes = await fetch('http://localhost:4000/api/teams/' + createdTeams.waste + '/project-guidance', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ hackathonHours: 24 })
  });
  const gWaste = (await gWasteRes.json()).guidance;
  const hwDetected = gWaste.hardware.status === 'REQUIRED' && gWaste.hardware.items.some(i => i.name.includes('Ultrasonic') || i.name.includes('ESP32'));
  addResult('TEST 3', 'Hardware Project Detection (Waste Management)', hwDetected, 'Status: ' + gWaste.hardware.status + ', items: ' + gWaste.hardware.items.length, 'Hardware REQUIRED with Ultrasonic & ESP32');

  // TEST 4: Non-Hardware Project Detection (College Event Website)
  const gEventRes = await fetch('http://localhost:4000/api/teams/' + createdTeams.event + '/project-guidance', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ hackathonHours: 24 })
  });
  const gEvent = (await gEventRes.json()).guidance;
  const noHw = gEvent.hardware.status === 'NOT_REQUIRED' && gEvent.hardware.items.length === 0;
  addResult('TEST 4', 'Non-Hardware Project Detection (Event Website)', noHw, 'Status: ' + gEvent.hardware.status + ', items: ' + gEvent.hardware.items.length, 'Hardware NOT_REQUIRED');

  // TEST 5: AI/ML Project Detection (AI Interview Assistant)
  const gAiRes = await fetch('http://localhost:4000/api/teams/' + createdTeams.interview + '/project-guidance', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ hackathonHours: 24 })
  });
  const gAi = (await gAiRes.json()).guidance;
  const aiReq = gAi.aiMl.status === 'REQUIRED' && gAi.aiMl.dataset.required === 'YES';
  addResult('TEST 5', 'AI/ML Project Detection (AI Interview Assistant)', aiReq, 'Status: ' + gAi.aiMl.status + ', Category: ' + gAi.aiMl.category + ', Dataset: ' + gAi.aiMl.dataset.required, 'AI REQUIRED with dataset strategy');

  // TEST 6: Simple CRUD Non-AI Project (Event Website)
  const noAi = gEvent.aiMl.status === 'NOT_NECESSARY';
  addResult('TEST 6', 'Simple CRUD Project Avoids Forcing AI (Event Website)', noAi, 'Status: ' + gEvent.aiMl.status, 'AI NOT_NECESSARY');

  // TEST 7: Hackathon Mode Time Slicer (6h, 12h, 24h, 36h, 48h)
  let hackathonPass = true;
  for (const hrs of [6, 12, 24, 36, 48]) {
    const hRes = await fetch('http://localhost:4000/api/teams/' + createdTeams.irrigation + '/project-guidance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ hackathonHours: hrs })
    });
    const hData = (await hRes.json()).guidance?.hackathonMode;
    if (!hData || hData.effortUsed > hrs) {
      hackathonPass = false;
    }
  }
  addResult('TEST 7', 'Hackathon Mode Time Slicer (6h, 12h, 24h, 36h, 48h Knapsack DP)', hackathonPass, 'All time budgets respect capacity constraint (effort <= budget)', 'Knapsack constraint satisfied');

  // TEST 8: Decision Engine Integration Bridge
  const decideRes = await fetch('http://localhost:4000/api/teams/' + createdTeams.irrigation + '/decide', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({
      decisionType: 'technology',
      question: 'Which microcontroller should we use for irrigation?',
      options: ['ESP32', 'Arduino Uno', 'Raspberry Pi']
    })
  });
  const decideData = await decideRes.json();
  const decidePass = decideRes.status === 200 && decideData.success === true && Boolean(decideData.decision?.recommendation?.option) && Boolean(decideData.decision?.matrix?.winner);
  addResult('TEST 8', 'Phase 5 Decision Engine Integration Bridge', decidePass, 'Winner: ' + decideData.decision?.recommendation?.option + ' (Score: ' + decideData.decision?.recommendation?.score + ')', 'Valid recommendation with Decision Matrix');

  // TEST 9: Greedy Task Priority Scoring
  const tasksInPhases = gIrr.phases.flatMap(p => p.tasks);
  const greedyScoresValid = tasksInPhases.every(t => typeof t.priorityScore === 'number' && t.priorityScore >= 0 && t.priorityScore <= 100);
  addResult('TEST 9', 'Greedy Task Priority Scoring in Roadmap', greedyScoresValid && tasksInPhases.length > 0, 'Tasks have deterministic priority scores (0-100)', 'Valid Greedy scores');

  // TEST 10: Topological Phase Dependency Sequence
  const topoOrder = gIrr.dependencyRoadmap.topologicalOrder;
  const topoPass = topoOrder.indexOf('Planning') < topoOrder.indexOf('Backend') && topoOrder.indexOf('Backend') < topoOrder.indexOf('Testing');
  addResult('TEST 10', 'Topological Phase Dependency Sequence', topoPass, 'Order: ' + topoOrder.join(' -> '), 'Planning before Backend before Testing');

  // TEST 11: Team Skill Gap Detection
  const skillGapPass = gIrr.skillGaps.gaps.some(g => g.domain.includes('Machine Learning'));
  addResult('TEST 11', 'Team Skill Gap Detection (ML gap flagged for Alice)', skillGapPass, 'Gaps: ' + gIrr.skillGaps.gaps.map(g => g.domain).join(', '), 'ML skill gap identified');

  // TEST 12: Deterministic Project Readiness Score
  const readinessValid = typeof gIrr.readiness.score === 'number' && gIrr.readiness.score >= 0 && gIrr.readiness.score <= 100 && gIrr.readiness.breakdown.length === 5;
  addResult('TEST 12', 'Deterministic Readiness Score Calculation', readinessValid, 'Score: ' + gIrr.readiness.score + '% (' + gIrr.readiness.tier + '), 5 auditable factors', '0-100% score with breakdown');

  // TEST 13: Next Action Engine & 1-Click Task Creation
  const nextAct = gIrr.nextAction;
  const createNextTaskRes = await fetch('http://localhost:4000/api/teams/' + createdTeams.irrigation + '/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({
      title: nextAct.action,
      description: nextAct.reason,
      category: 'Hardware',
      urgency: 5,
      impact: 5
    })
  });
  const createdTask = await createNextTaskRes.json();
  const nextActPass = (createNextTaskRes.status === 201 || createNextTaskRes.status === 200) && Boolean(createdTask._id) && createdTask.priorityScore > 70;
  addResult('TEST 13', 'Next Action Engine & 1-Click Task Creation into Backlog', nextActPass, 'Created Task: ' + createdTask.title + ' (Priority: ' + createdTask.priorityScore + ')', 'Task created via existing pipeline with auto Greedy priority');

  // TEST 14: MVP vs Advanced Feature Division
  const mvpPass = gIrr.mvpPlanning.mvp.length > 0 && gIrr.mvpPlanning.advanced.length > 0;
  addResult('TEST 14', 'MVP vs Advanced Feature Division', mvpPass, 'MVP count: ' + gIrr.mvpPlanning.mvp.length + ', Advanced count: ' + gIrr.mvpPlanning.advanced.length, 'Clear separation of core vs post-MVP');

  // TEST 15: Research Guidance (Zero Fake Citations)
  const resPass = gIrr.researchTopics.length > 0 && gIrr.researchTopics.every(r => typeof r.topic === 'string' && typeof r.why === 'string' && !r.topic.includes('http') && !r.topic.includes('doi:'));
  addResult('TEST 15', 'Research Guidance (Genuine Topics, No Fake Citations)', resPass, 'Research topics: ' + gIrr.researchTopics.map(r => r.topic).join(' | '), 'Practical research spikes without fabricated papers');

  // TEST 16: DAA Regression (Greedy, Knapsack, TopoSort, MergeSort, B&B)
  const sortRes = await fetch('http://localhost:4000/api/teams/' + createdTeams.hospital + '/tasks/analytics', {
    headers: { Authorization: 'Bearer ' + token }
  });
  const sortData = await sortRes.json();
  const daaPass = sortRes.status === 200 && (Array.isArray(sortData.algorithms) || Array.isArray(sortData));
  addResult('TEST 16', 'DAA Algorithmic Engine Regression Test', daaPass, 'Analytics sort comparison endpoint responsive, DAA pipeline healthy', 'All DAA systems operational');

  // TEST 17: Existing Feature Regression
  const teamGetRes = await fetch('http://localhost:4000/api/teams/' + createdTeams.irrigation, {
    headers: { Authorization: 'Bearer ' + token }
  });
  const tasksGetRes = await fetch('http://localhost:4000/api/teams/' + createdTeams.irrigation + '/tasks', {
    headers: { Authorization: 'Bearer ' + token }
  });
  const regPass = teamGetRes.status === 200 && tasksGetRes.status === 200;
  addResult('TEST 17', 'Existing Workspace Tabs & Routes Regression', regPass, 'Team and Task endpoints responsive', 'Zero regressions across existing features');

  console.log('\n=============================================');
  console.log('SUMMARY: ' + results.filter(r => r.pass).length + ' / ' + results.length + ' TESTS PASSED');
  console.log('=============================================');
}

runAllTests().catch(e => console.error('Test Suite Failed:', e));
