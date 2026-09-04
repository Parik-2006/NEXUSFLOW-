/**
 * server/scripts/testChatMarkdownAndPresentation.js
 * ============================================================================
 * Fix 5 Test Suite: Safe Markdown Rendering in Chat, Message Presentation,
 * XSS Neutralization, Code Blocks, Realtime Socket.IO, Persistence & Isolation.
 * ============================================================================
 */

import http from "http";
import express from "express";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import { Server as SocketIOServer } from "socket.io";

const require = createRequire(import.meta.url);
const { io: ClientIO } = require("../../client/node_modules/socket.io-client");

import User from "../models/User.js";
import Team from "../models/Team.js";
import ChatMessage from "../models/ChatMessage.js";
import chatRoutes from "../routes/chat.js";
import { registerChatHandlers } from "../socket/chatHandlers.js";
import { sign, verify } from "../auth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const JWT_SECRET = process.env.JWT_SECRET || "dev-jwt-secret-key-nexusflow-2025";
const MONGODB_URI =
  process.env.MONGODB_URI ||
  "mongodb+srv://raptorparik2006_db_user:viratkohli18@cluster0.s7mrv32.mongodb.net/nexusflow?retryWrites=true&w=majority&appName=Cluster0";

// ── Deterministic Markdown Parser Implementation (mirrors client/utils/markdownParser.ts) ──

function isSafeUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== "string") return false;
  const trimmed = rawUrl.trim();
  const lower = trimmed.toLowerCase();
  if (
    lower.startsWith("javascript:") ||
    lower.startsWith("data:") ||
    lower.startsWith("vbscript:") ||
    lower.startsWith("file:") ||
    lower.startsWith("blob:")
  ) {
    return false;
  }
  return /^https?:\/\/[^\s]+$/i.test(trimmed) || /^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(trimmed);
}

function sanitizeText(input) {
  if (!input) return "";
  return input
    .replace(/<\s*script\b[^>]*>[\s\S]*?<\s*\/\s*script\s*>/gi, "")
    .replace(/<\s*iframe\b[^>]*>[\s\S]*?<\s*\/\s*iframe\s*>/gi, "")
    .replace(/<\s*object\b[^>]*>[\s\S]*?<\s*\/\s*object\s*>/gi, "")
    .replace(/<\s*embed\b[^>]*>[\s\S]*?<\s*\/\s*embed\s*>/gi, "")
    .replace(/<\s*style\b[^>]*>[\s\S]*?<\s*\/\s*style\s*>/gi, "")
    .replace(/on\w+\s*=\s*["'][^"']*["']/gi, "");
}

function parseInlineTokens(text) {
  if (!text) return [];
  const tokens = [];
  let remaining = text;
  const inlineRegex = /(`([^`]+)`|\*\*\*([^*]+)\*\*\*|___([^_]+)___|\*\*([^*]+)\*\*|__([^_]+)__|(?<!\*)\*([^*\s][^*]*[^*\s]|[^*\s])\*(?!\*)|(?<!_)_([^_]+)_(?!_)|\[([^\]]+)\]\(([^)]+)\))/;

  while (remaining.length > 0) {
    const match = remaining.match(inlineRegex);
    if (!match || match.index === undefined) {
      tokens.push({ type: "text", text: remaining });
      break;
    }
    if (match.index > 0) {
      tokens.push({ type: "text", text: remaining.slice(0, match.index) });
    }
    const matchedStr = match[0];
    if (matchedStr.startsWith("`") && matchedStr.endsWith("`")) {
      tokens.push({ type: "inline_code", text: match[2] });
    } else if (
      (matchedStr.startsWith("***") && matchedStr.endsWith("***")) ||
      (matchedStr.startsWith("___") && matchedStr.endsWith("___"))
    ) {
      tokens.push({ type: "bold_italic", text: match[3] || match[4] });
    } else if (
      (matchedStr.startsWith("**") && matchedStr.endsWith("**")) ||
      (matchedStr.startsWith("__") && matchedStr.endsWith("__"))
    ) {
      tokens.push({ type: "bold", text: match[5] || match[6] });
    } else if (
      (matchedStr.startsWith("*") && matchedStr.endsWith("*")) ||
      (matchedStr.startsWith("_") && matchedStr.endsWith("_"))
    ) {
      tokens.push({ type: "italic", text: match[7] || match[8] });
    } else if (matchedStr.startsWith("[") && matchedStr.includes("](")) {
      const linkText = match[9];
      const linkUrl = (match[10] || "").trim();
      if (isSafeUrl(linkUrl)) {
        tokens.push({ type: "link", text: linkText, url: linkUrl, isSafe: true });
      } else {
        tokens.push({ type: "text", text: `${linkText}` });
      }
    } else {
      tokens.push({ type: "text", text: matchedStr });
    }
    remaining = remaining.slice(match.index + matchedStr.length);
  }
  return tokens;
}

function parseMarkdownBlocks(rawText) {
  if (!rawText || !rawText.trim()) return [];
  const sanitized = sanitizeText(rawText);
  const lines = sanitized.replace(/\r\n/g, "\n").split("\n");
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced Code Block
    const codeBlockMatch = line.match(/^```(\w+)?\s*$/);
    if (codeBlockMatch) {
      const language = (codeBlockMatch[1] || "text").toLowerCase();
      const codeLines = [];
      i++;
      while (i < lines.length) {
        if (lines[i].match(/^```\s*$/)) {
          i++;
          break;
        }
        codeLines.push(lines[i]);
        i++;
      }
      blocks.push({
        type: "code_block",
        language,
        code: codeLines.join("\n"),
      });
      continue;
    }

    // Heading (#, ##, ###)
    const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      blocks.push({
        type: "heading",
        level,
        inlines: parseInlineTokens(headingMatch[2].trim()),
      });
      i++;
      continue;
    }

    // Blockquote
    const quoteMatch = line.match(/^>\s?(.*)$/);
    if (quoteMatch) {
      const quoteLines = [quoteMatch[1]];
      i++;
      while (i < lines.length) {
        const nextQuote = lines[i].match(/^>\s?(.*)$/);
        if (nextQuote) {
          quoteLines.push(nextQuote[1]);
          i++;
        } else {
          break;
        }
      }
      blocks.push({
        type: "blockquote",
        inlines: parseInlineTokens(quoteLines.join(" ")),
      });
      continue;
    }

    // Bullet List (- or *)
    const bulletMatch = line.match(/^[\*\-]\s+(.+)$/);
    if (bulletMatch) {
      const items = [];
      while (i < lines.length) {
        const currentBullet = lines[i].match(/^[\*\-]\s+(.+)$/);
        if (currentBullet) {
          items.push(parseInlineTokens(currentBullet[1].trim()));
          i++;
        } else {
          break;
        }
      }
      blocks.push({
        type: "bullet_list",
        items,
      });
      continue;
    }

    // Numbered List (1., 2.)
    const numberedMatch = line.match(/^(\d+)\.\s+(.+)$/);
    if (numberedMatch) {
      const items = [];
      while (i < lines.length) {
        const currentNum = lines[i].match(/^(\d+)\.\s+(.+)$/);
        if (currentNum) {
          items.push({
            number: parseInt(currentNum[1], 10),
            inlines: parseInlineTokens(currentNum[2].trim()),
          });
          i++;
        } else {
          break;
        }
      }
      blocks.push({
        type: "numbered_list",
        items,
      });
      continue;
    }

    // Empty line
    if (!line.trim()) {
      i++;
      continue;
    }

    // Paragraph
    const paragraphLines = [line];
    i++;
    while (i < lines.length) {
      const nextLine = lines[i];
      if (
        !nextLine.trim() ||
        nextLine.match(/^```/) ||
        nextLine.match(/^#{1,3}\s+/) ||
        nextLine.match(/^>\s?/) ||
        nextLine.match(/^[\*\-]\s+/) ||
        nextLine.match(/^\d+\.\s+/)
      ) {
        break;
      }
      paragraphLines.push(nextLine);
      i++;
    }

    blocks.push({
      type: "paragraph",
      inlines: parseInlineTokens(paragraphLines.join("\n")),
    });
  }

  return blocks;
}

// ── Test Runner ─────────────────────────────────────────────────────────────

let totalPassed = 0;
let totalFailed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    totalPassed++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    totalFailed++;
  }
}

async function request(baseUrl, path, options = {}) {
  const url = `${baseUrl}${path}`;
  const fetchRes = await fetch(url, {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  let data;
  try {
    data = await fetchRes.json();
  } catch {
    data = null;
  }
  return { status: fetchRes.status, ok: fetchRes.ok, data };
}

async function main() {
  console.log("===============================================================");
  console.log("NEXUSFLOW FIX 5 TEST SUITE: Safe Markdown & Presentation Layer");
  console.log("===============================================================");

  // ──────────────────────────────────────────────────────────────────────────
  // PART 1: DETERMINISTIC MARKDOWN PARSER UNIT TESTS
  // ──────────────────────────────────────────────────────────────────────────
  console.log("\n--- PART 1: Markdown AST Parser Unit Tests ---");

  // Test 1: Bold
  {
    const blocks1 = parseMarkdownBlocks("This is **critical** information.");
    assert(blocks1.length === 1, "Bold message parsed into 1 paragraph block");
    const inlines = blocks1[0].inlines;
    assert(inlines.some((t) => t.type === "bold" && t.text === "critical"), "Double-asterisk bold parsed as bold token");
    assert(!inlines.some((t) => t.text.includes("**")), "Raw ** markers stripped");

    const blocks2 = parseMarkdownBlocks("Also __strongly recommended__ here.");
    const inlines2 = blocks2[0].inlines;
    assert(inlines2.some((t) => t.type === "bold" && t.text === "strongly recommended"), "Double-underscore bold parsed as bold token");
  }

  // Test 2: Italic
  {
    const blocks1 = parseMarkdownBlocks("Please note the *details* carefully.");
    const inlines1 = blocks1[0].inlines;
    assert(inlines1.some((t) => t.type === "italic" && t.text === "details"), "Single-asterisk italic parsed as italic token");
    assert(!inlines1.some((t) => t.text.includes("*")), "Raw * markers stripped");

    const blocks2 = parseMarkdownBlocks("Review the _specification_ file.");
    const inlines2 = blocks2[0].inlines;
    assert(inlines2.some((t) => t.type === "italic" && t.text === "specification"), "Single-underscore italic parsed as italic token");
  }

  // Test 3: Bold Italic
  {
    const blocks = parseMarkdownBlocks("This is ***absolutely essential*** for release.");
    const inlines = blocks[0].inlines;
    assert(inlines.some((t) => t.type === "bold_italic" && t.text === "absolutely essential"), "Triple-asterisk parsed as bold_italic token");
    assert(!inlines.some((t) => t.text.includes("***")), "Raw *** markers stripped");
  }

  // Test 4: Inline Code
  {
    const blocks = parseMarkdownBlocks("Run `npm run build` before pushing to main.");
    const inlines = blocks[0].inlines;
    assert(inlines.some((t) => t.type === "inline_code" && t.text === "npm run build"), "Backticks parsed as inline_code token");
    assert(!inlines.some((t) => t.text.includes("`")), "Raw backtick markers stripped");
  }

  // Test 5: Fenced Code Block with Language & Indentation
  {
    const raw = "Here is the implementation:\n```typescript\nfunction optimize(tasks: Task[]): Plan {\n  return greedySchedule(tasks);\n}\n```\nAll done.";
    const blocks = parseMarkdownBlocks(raw);
    assert(blocks.length === 3, "Fenced code block separated into paragraph, code_block, and trailing paragraph");
    const codeBlock = blocks.find((b) => b.type === "code_block");
    assert(codeBlock !== undefined, "code_block token exists");
    assert(codeBlock.language === "typescript", "Language tag preserved as 'typescript'");
    assert(codeBlock.code.includes("  return greedySchedule(tasks);"), "Indentation with 2 leading spaces preserved verbatim");
    assert(codeBlock.code.includes("\n"), "Newlines within code block preserved");
  }

  // Test 6: Fenced Code Block Without Language
  {
    const raw = "```\nplain text code without lang\n```";
    const blocks = parseMarkdownBlocks(raw);
    const codeBlock = blocks[0];
    assert(codeBlock.type === "code_block", "Fenced block without language parsed as code_block");
    assert(codeBlock.language === "text", "Defaults to 'text' language");
    assert(codeBlock.code === "plain text code without lang", "Code content preserved");
  }

  // Test 7: Bullet Lists
  {
    const raw = "- First task: greedy scheduler\n- Second task: topological sort\n* Third task: dynamic programming";
    const blocks = parseMarkdownBlocks(raw);
    assert(blocks.length === 1 && blocks[0].type === "bullet_list", "Continuous bullet items grouped into 1 bullet_list block");
    assert(blocks[0].items.length === 3, "Contains exactly 3 list items");
    assert(blocks[0].items[0][0].text === "First task: greedy scheduler", "Item 1 content parsed without '- ' prefix");
    assert(blocks[0].items[2][0].text === "Third task: dynamic programming", "Item 3 content parsed with '* ' prefix");
  }

  // Test 8: Numbered Lists
  {
    const raw = "1. Clone repository\n2. Run npm install\n3. Start dev server";
    const blocks = parseMarkdownBlocks(raw);
    assert(blocks.length === 1 && blocks[0].type === "numbered_list", "Continuous numbered items grouped into 1 numbered_list block");
    assert(blocks[0].items.length === 3, "Contains exactly 3 numbered items");
    assert(blocks[0].items[0].number === 1, "Number 1 assigned correctly");
    assert(blocks[0].items[1].number === 2, "Number 2 assigned correctly");
    assert(blocks[0].items[2].number === 3, "Number 3 assigned correctly");
    assert(blocks[0].items[1].inlines[0].text === "Run npm install", "Number prefix stripped from content");
  }

  // Test 9: Headings (H1, H2, H3)
  {
    const raw = "# Architecture Overview\n## Microservices Layer\n### Database Schema";
    const blocks = parseMarkdownBlocks(raw);
    assert(blocks.length === 3, "Parsed 3 distinct heading blocks");
    assert(blocks[0].type === "heading" && blocks[0].level === 1, "H1 heading identified with level 1");
    assert(blocks[0].inlines[0].text === "Architecture Overview", "H1 text extracted cleanly");
    assert(blocks[1].type === "heading" && blocks[1].level === 2, "H2 heading identified with level 2");
    assert(blocks[2].type === "heading" && blocks[2].level === 3, "H3 heading identified with level 3");
  }

  // Test 10: Safe Links (http, https, mailto)
  {
    const raw = "Check [NexusFlow](https://nexusflow.io) or [Local Docs](http://localhost:3000) or [Contact](mailto:team@nexusflow.io)";
    const blocks = parseMarkdownBlocks(raw);
    const inlines = blocks[0].inlines;
    const links = inlines.filter((t) => t.type === "link");
    assert(links.length === 3, "All 3 safe links parsed as link tokens");
    assert(links[0].url === "https://nexusflow.io" && links[0].isSafe === true, "HTTPS link marked safe");
    assert(links[1].url === "http://localhost:3000" && links[1].isSafe === true, "HTTP link marked safe");
    assert(links[2].url === "mailto:team@nexusflow.io" && links[2].isSafe === true, "Mailto link marked safe");
  }

  // Test 11: Dangerous URL Neutralization (XSS prevention)
  {
    const raw = "Click [Exploit](javascript:alert('pwned')) or [Data Link](data:text/html,<script>bad()</script>)";
    const blocks = parseMarkdownBlocks(raw);
    const inlines = blocks[0].inlines;
    const links = inlines.filter((t) => t.type === "link");
    assert(links.length === 0, "Zero dangerous link tokens created");
    assert(inlines.some((t) => t.text.includes("Exploit")), "Link label rendered as plain harmless text");
    assert(!inlines.some((t) => t.url && t.url.startsWith("javascript:")), "No javascript: URL present");
  }

  // Test 12: HTML Tag & Script Sanitization
  {
    const raw = "Hello <script>alert(document.cookie)</script><iframe src='evil.com'></iframe>World!";
    const blocks = parseMarkdownBlocks(raw);
    const textContent = blocks[0].inlines.map((t) => t.text).join("");
    assert(!textContent.includes("<script>"), "<script> tags stripped by sanitizer");
    assert(!textContent.includes("alert(document.cookie)"), "Script body stripped");
    assert(!textContent.includes("<iframe>"), "<iframe> tags stripped");
    assert(textContent.includes("Hello") && textContent.includes("World!"), "Legitimate text preserved");
  }

  // Test 13: Plain Text Preservation
  {
    const raw = "Just a standard chat message with no special symbols or formatting.";
    const blocks = parseMarkdownBlocks(raw);
    assert(blocks.length === 1, "Plain text parsed into 1 block");
    assert(blocks[0].type === "paragraph", "Block type is paragraph");
    assert(blocks[0].inlines[0].text === raw, "Content preserved 100% identical");
  }

  // Test 14: Multiline Paragraphs
  {
    const raw = "Line 1 of discussion\nLine 2 with additional context\nLine 3 conclusion";
    const blocks = parseMarkdownBlocks(raw);
    assert(blocks.length === 1, "Continuous lines grouped into single paragraph");
    assert(blocks[0].inlines[0].text.includes("\n"), "Line breaks preserved in inline text");
  }

  // ──────────────────────────────────────────────────────────────────────────
  // PART 2: INTEGRATION WITH MONGODB, REST API, SOCKET.IO & ISOLATION
  // ──────────────────────────────────────────────────────────────────────────
  console.log("\n--- PART 2: Database, REST API, Socket.IO & Chat Isolation Tests ---");

  await mongoose.connect(MONGODB_URI);
  console.log("MongoDB connected.");

  // Express + Socket.IO test server
  const app = express();
  app.use(express.json());

  const server = http.createServer(app);
  const io = new SocketIOServer(server, { cors: { origin: "*" } });
  app.set("io", io);

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error("Authentication error"));
    try {
      const decoded = verify(token);
      if (!decoded) return next(new Error("Authentication error"));
      socket.data.user = decoded;
      next();
    } catch {
      next(new Error("Authentication error"));
    }
  });

  io.on("connection", (socket) => {
    registerChatHandlers(io, socket);
  });

  app.use("/api", chatRoutes);

  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;
  console.log(`Test Express + Socket.IO server running on ${baseUrl}`);

  const testSuffix = Date.now();

  // Create User 1 (Leader)
  const user1 = await User.create({
    name: `Chat Leader ${testSuffix}`,
    email: `chat_leader_${testSuffix}@nexusflow.test`,
    password: "hashedpassword123",
  });
  const token1 = sign(user1);

  // Create User 2 (Member)
  const user2 = await User.create({
    name: `Chat Member ${testSuffix}`,
    email: `chat_member_${testSuffix}@nexusflow.test`,
    password: "hashedpassword123",
  });
  const token2 = sign(user2);

  // Create User 3 (Non-member)
  const user3 = await User.create({
    name: `Outsider ${testSuffix}`,
    email: `outsider_${testSuffix}@nexusflow.test`,
    password: "hashedpassword123",
  });
  const token3 = sign(user3);

  // Create Team
  const team = await Team.create({
    name: `Chat Test Team ${testSuffix}`,
    ownerId: user1._id,
    members: [
      { userId: user1._id, role: "Leader", joinedAt: new Date() },
      { userId: user2._id, role: "Frontend Engineer", joinedAt: new Date() },
    ],
  });

  // Test 15: Global Chat POST & MongoDB Persistence
  const globalMarkdown = "Welcome to **Global Chat**!\nCheck `documentation` at [Nexus](https://nexusflow.io).\n```javascript\nconsole.log('hi');\n```";
  const postGlobalRes = await request(baseUrl, "/api/chat/global", {
    method: "POST",
    headers: { Authorization: `Bearer ${token1}` },
    body: { message: globalMarkdown },
  });
  assert(postGlobalRes.status === 201, "POST /api/chat/global returns HTTP 201 Created");
  assert(postGlobalRes.data.message === globalMarkdown, "Global chat persisted raw markdown message intact");
  assert(postGlobalRes.data.type === "global", "Message marked as type 'global'");

  // Test 16: Global Chat GET & Reload Fidelity
  const getGlobalRes = await request(baseUrl, "/api/chat/global", {
    headers: { Authorization: `Bearer ${token2}` },
  });
  assert(getGlobalRes.status === 200, "GET /api/chat/global returns HTTP 200 OK");
  const fetchedMsg = getGlobalRes.data.find((m) => m._id === postGlobalRes.data._id);
  assert(fetchedMsg !== undefined, "Persisted message retrieved on reload");
  assert(fetchedMsg.message === globalMarkdown, "Message on reload preserves raw markdown string for client parsing");

  // Client parsing of retrieved message
  const clientParsed = parseMarkdownBlocks(fetchedMsg.message);
  assert(clientParsed.some((b) => b.type === "code_block"), "Client parser generates code_block from fetched message");
  assert(clientParsed[0].inlines.some((t) => t.type === "bold"), "Client parser generates bold token from fetched message");

  // Test 17: Team Chat POST & Isolation
  const teamMarkdown = "Team Update:\n- Task 1: Complete\n- Task 2: In Review\n**Next Sprint:** *Tomorrow*";
  const postTeamRes = await request(baseUrl, `/api/chat/team/${team._id}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token1}` },
    body: { message: teamMarkdown },
  });
  assert(postTeamRes.status === 201, "POST /api/chat/team/:teamId returns HTTP 201 Created");
  assert(postTeamRes.data.type === "team", "Team message marked as type 'team'");
  assert(postTeamRes.data.teamId === team._id.toString(), "teamId correctly associated");

  // Test 18: Chat Isolation (Outsider Forbidden)
  const outsiderGetTeam = await request(baseUrl, `/api/chat/team/${team._id}`, {
    headers: { Authorization: `Bearer ${token3}` },
  });
  assert(outsiderGetTeam.status === 403, "Outsider blocked with HTTP 403 Forbidden from reading team chat");

  const outsiderPostTeam = await request(baseUrl, `/api/chat/team/${team._id}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token3}` },
    body: { message: "Unauthorized injection attempt" },
  });
  assert(outsiderPostTeam.status === 403, "Outsider blocked with HTTP 403 Forbidden from posting to team chat");

  // Test 19: Unread Counters & Mark-as-Read Isolation
  const unreadRes = await request(baseUrl, "/api/chat/unread", {
    headers: { Authorization: `Bearer ${token2}` },
  });
  assert(unreadRes.status === 200, "GET /api/chat/unread returns HTTP 200 OK");
  assert(unreadRes.data.global >= 1, "User 2 has at least 1 unread message in global chat");
  assert(unreadRes.data.teams[team._id.toString()] >= 1, "User 2 has at least 1 unread message in team chat");

  // Mark team chat as read
  const markTeamRead = await request(baseUrl, "/api/chat/read", {
    method: "POST",
    headers: { Authorization: `Bearer ${token2}` },
    body: { scope: team._id.toString() },
  });
  assert(markTeamRead.status === 200, "POST /api/chat/read for team returns HTTP 200 OK");

  // Check that team unread is now 0 for User 2
  const unreadAfter = await request(baseUrl, "/api/chat/unread", {
    headers: { Authorization: `Bearer ${token2}` },
  });
  assert(unreadAfter.data.teams[team._id.toString()] === 0, "Team unread count successfully zeroed out");
  assert(unreadAfter.data.global >= 1, "Global unread count unaffected by team mark-as-read (isolated)");

  // Test 20: Realtime Socket.IO Delivery
  const clientSocket = ClientIO(baseUrl, {
    auth: { token: token2 },
    transports: ["websocket"],
  });

  const socketMsgPromise = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Socket.IO message timeout")), 4000);
    clientSocket.on("chat:global:new", (msg) => {
      clearTimeout(timer);
      resolve(msg);
    });
  });

  await new Promise((resolve) => clientSocket.on("connect", resolve));
  assert(clientSocket.connected === true, "Socket.IO client connected with JWT authentication");

  // Send via Socket.IO
  const realtimeMsg = "Real-time message with `inline code` and **bold notification**!";
  clientSocket.emit("chat:global:send", { message: realtimeMsg }, (ack) => {
    assert(ack && ack.success === true, "Socket.IO ack returns success");
  });

  const receivedSocketMsg = await socketMsgPromise;
  assert(receivedSocketMsg.message === realtimeMsg, "Socket.IO broadcast delivers identical markdown text");

  const parsedSocketMsg = parseMarkdownBlocks(receivedSocketMsg.message);
  assert(parsedSocketMsg[0].inlines.some((t) => t.type === "inline_code"), "Client parser handles realtime message inline code");
  assert(parsedSocketMsg[0].inlines.some((t) => t.type === "bold"), "Client parser handles realtime message bold formatting");

  clientSocket.disconnect();
  server.close();
  await mongoose.disconnect();

  console.log("\n===============================================================");
  console.log(`SUMMARY: ${totalPassed} passed, ${totalFailed} failed`);
  console.log("===============================================================");

  if (totalFailed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

main().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
