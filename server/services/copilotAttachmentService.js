/**
 * server/services/copilotAttachmentService.js
 * ============================================================================
 * NEXUSFLOW V4 — COPILOT ATTACHMENTS & TEMPORARY CONTEXT SERVICE (Workstream 16)
 *
 * Implements attachment ingestion, temporary context management, token budgeting,
 * and explicit memory promotion.
 *
 * CORE INVARIANT:
 *   Attachments enter TemporaryContext ONLY.
 *   Never automatically written to persistent ProjectMemory.
 * ============================================================================
 */

import mongoose from "mongoose";
import path from "path";
import TemporaryContext from "../models/TemporaryContext.js";
import ProjectMemory from "../models/ProjectMemory.js";
import Project from "../models/Project.js";
import { getProjectContext } from "./projectMemoryContext.js";
import { recordProjectEvent } from "./eventService.js";

const SUPPORTED_EXTENSIONS = {
  ".pdf": "pdf",
  ".docx": "docx",
  ".doc": "doc",
  ".md": "markdown",
  ".markdown": "markdown",
  ".txt": "txt",
  ".csv": "csv",
  ".json": "json",
  ".js": "code",
  ".ts": "code",
  ".tsx": "code",
  ".py": "code",
  ".java": "code",
  ".cpp": "code",
  ".png": "image_png",
  ".jpg": "image_jpeg",
  ".jpeg": "image_jpeg",
  ".webp": "image_webp",
};

/**
 * Ingest an attachment into temporary context.
 */
export async function ingestAttachment({
  projectId,
  userId,
  conversationId = null,
  filename,
  mimeType = "text/plain",
  content = "",
  size = 0,
}) {
  if (!projectId || !userId || !filename) {
    throw new Error("projectId, userId, and filename are required.");
  }

  const ext = path.extname(filename).toLowerCase();
  const fileType = SUPPORTED_EXTENSIONS[ext] || "unsupported";

  if (fileType === "unsupported") {
    const record = await TemporaryContext.create({
      projectId,
      userId,
      conversationId,
      sourceIdentifier: filename,
      fileType: "unsupported",
      fileSize: size || (typeof content === "string" ? Buffer.byteLength(content) : 0),
      mimeType,
      extractedText: "",
      processingState: "unsupported",
      errorMessage: `Unsupported file type "${ext}". Supported types: PDF, DOCX, Markdown, TXT, CSV, JSON, Code, Images (PNG/JPG/WEBP).`,
    });
    return record;
  }

  let extractedText = "";
  let structuredMetadata = {};

  if (typeof content === "string") {
    extractedText = content.trim();
  } else if (Buffer.isBuffer(content)) {
    extractedText = content.toString("utf-8");
  }

  // Basic metadata extraction
  if (fileType === "json") {
    try {
      const parsed = JSON.parse(extractedText);
      structuredMetadata = {
        isJson: true,
        keys: Object.keys(parsed).slice(0, 20),
        itemCount: Array.isArray(parsed) ? parsed.length : undefined,
      };
    } catch {
      structuredMetadata = { isJson: false, parseError: "Malformed JSON" };
    }
  } else if (fileType === "csv") {
    const lines = extractedText.split("\n").filter(Boolean);
    structuredMetadata = {
      lineCount: lines.length,
      headers: lines[0]?.split(",").map(h => h.trim()) || [],
    };
  } else if (fileType.startsWith("image_")) {
    structuredMetadata = {
      isImage: true,
      imageFormat: fileType.replace("image_", ""),
      hasVisualArtifact: true,
    };
  } else {
    structuredMetadata = {
      charCount: extractedText.length,
      lineCount: extractedText.split("\n").length,
    };
  }

  const tempContext = await TemporaryContext.create({
    projectId,
    userId,
    conversationId,
    sourceIdentifier: filename,
    fileType,
    fileSize: size || Buffer.byteLength(extractedText, "utf-8"),
    mimeType,
    extractedText,
    structuredMetadata,
    processingState: "ready",
  });

  return tempContext;
}

/**
 * Get all active temporary contexts for a project/user.
 */
export async function getProjectTemporaryContexts(projectId, userId, conversationId = null) {
  if (!mongoose.isValidObjectId(projectId) || !mongoose.isValidObjectId(userId)) {
    throw new Error("Valid projectId and userId are required.");
  }

  const filter = {
    projectId,
    userId,
    processingState: "ready",
    expiresAt: { $gt: new Date() },
  };
  if (conversationId) {
    filter.conversationId = conversationId;
  }

  return TemporaryContext.find(filter).sort({ createdAt: -1 }).lean();
}

/**
 * Explicit user action: promote temporary attachment context to persistent ProjectMemory.
 */
export async function promoteAttachmentToMemory(
  contextId,
  userId,
  { category = "IMPORTANT_ARTIFACT", title = "" } = {},
  actorName = "Team Member"
) {
  const tempContext = await TemporaryContext.findById(contextId);
  if (!tempContext) throw new Error("Temporary context record not found.");

  if (tempContext.userId.toString() !== userId.toString()) {
    throw new Error("Unauthorized: Only the creator can promote this temporary context.");
  }

  const project = await Project.findById(tempContext.projectId);
  if (!project) throw new Error("Project not found.");

  const memoryTitle = title || `Artifact: ${tempContext.sourceIdentifier}`;
  const memoryContent = tempContext.extractedText || `Attached file ${tempContext.sourceIdentifier} (${tempContext.fileType})`;

  const memory = await ProjectMemory.create({
    projectId: tempContext.projectId,
    category,
    title: memoryTitle,
    content: memoryContent,
    scope: "persistent",
    status: "active",
    source: "manual",
    createdBy: userId,
    tags: [tempContext.fileType, "attachment_promoted"],
    evidence: [tempContext.sourceIdentifier],
  });

  tempContext.isPromotedToMemory = true;
  tempContext.promotedMemoryId = memory._id;
  await tempContext.save();

  await recordProjectEvent({
    projectId: tempContext.projectId,
    teamId: project.teamId,
    actorId: userId,
    actorName,
    eventType: "DECISION_SAVED",
    entityType: "decision",
    entityId: memory._id.toString(),
    title: "Temporary attachment saved to Project Memory",
    description: `Promoted ${tempContext.sourceIdentifier} to persistent memory (${category})`,
    source: "user",
  });

  return memory;
}

/**
 * Delete a temporary attachment context.
 */
export async function deleteTemporaryContext(contextId, userId) {
  const tempContext = await TemporaryContext.findById(contextId);
  if (!tempContext) return null;

  if (tempContext.userId.toString() !== userId.toString()) {
    throw new Error("Unauthorized: cannot delete another user's attachment context.");
  }

  await TemporaryContext.findByIdAndDelete(contextId);
  return { success: true, contextId };
}

/**
 * Build augmented Copilot prompt context with token budget limits.
 */
export async function buildAugmentedCopilotContext({
  projectId,
  userId,
  conversationId = null,
  maxTokens = 4000,
}) {
  const [baseContext, temporaryContexts] = await Promise.all([
    getProjectContext(projectId),
    getProjectTemporaryContexts(projectId, userId, conversationId),
  ]);

  if (!baseContext) return null;

  // Assemble temporary context summaries
  let tempContextSection = "";
  if (temporaryContexts && temporaryContexts.length > 0) {
    tempContextSection = "### Ephemeral Session Attachments (Temporary Context):\n";
    for (const ctx of temporaryContexts) {
      const snippet = (ctx.extractedText || "").slice(0, 1000);
      tempContextSection += `- **${ctx.sourceIdentifier}** (${ctx.fileType}, ${ctx.fileSize} bytes):\n  ${snippet}\n`;
    }
  }

  // Budget calculation (approx 4 chars per token)
  const maxChars = maxTokens * 4;
  let fullContextText = `
=== NEXUSFLOW PROJECT CONTEXT ===
Project: ${baseContext.project?.title || "Untitled"}
Methodology: ${baseContext.project?.methodology || "CLASSIC"}
Domain: ${baseContext.project?.domain || "General"}
Status: ${baseContext.project?.status || "active"}

${tempContextSection}

=== PERSISTENT MEMORY ===
${(baseContext.persistentMemory || []).slice(0, 10).map(m => `- [${m.category}] ${m.title}: ${m.content}`).join("\n")}
`.trim();

  if (fullContextText.length > maxChars) {
    fullContextText = fullContextText.slice(0, maxChars) + "\n...[Context truncated to fit token budget]";
  }

  return {
    projectId: projectId.toString(),
    userId: userId.toString(),
    tokenBudget: maxTokens,
    contextLength: fullContextText.length,
    temporaryAttachmentCount: temporaryContexts.length,
    persistentMemoryCount: (baseContext.persistentMemory || []).length,
    formattedContext: fullContextText,
  };
}
