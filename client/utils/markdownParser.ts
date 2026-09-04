/**
 * client/utils/markdownParser.ts
 * ============================================================================
 * Safe, deterministic Markdown AST parser for NEXUSFLOW chat & message presentation.
 * 
 * Supports a controlled, safe subset:
 * - Bold (`**text**`, `__text__`)
 * - Italic (`*text*`, `_text_`)
 * - Bold Italic (`***text***`, `___text___`)
 * - Inline Code (`` `code` ``)
 * - Fenced Code Blocks (```lang\ncode\n```) with preserved whitespace & language
 * - Bullet lists (`- item`, `* item`)
 * - Numbered lists (`1. item`, `2. item`)
 * - Headings (`# H1`, `## H2`, `### H3`)
 * - Blockquotes (`> quote`)
 * - Safe links (`[label](url)`) with strict protocol whitelisting (http, https, mailto)
 * 
 * Security:
 * - Dangerous URL schemes (javascript:, data:, vbscript:, file:) are neutralized.
 * - Dangerous script tags are stripped/neutralized.
 * - Zero external DOM injection. Zero extra LLM cost.
 * ============================================================================
 */

export type InlineToken =
  | { type: "text"; text: string }
  | { type: "bold"; text: string }
  | { type: "italic"; text: string }
  | { type: "bold_italic"; text: string }
  | { type: "inline_code"; text: string }
  | { type: "link"; text: string; url: string; isSafe: boolean };

export type BlockToken =
  | { type: "paragraph"; inlines: InlineToken[] }
  | { type: "heading"; level: 1 | 2 | 3; inlines: InlineToken[] }
  | { type: "bullet_list"; items: InlineToken[][] }
  | { type: "numbered_list"; items: { number: number; inlines: InlineToken[] }[] }
  | { type: "code_block"; language: string; code: string }
  | { type: "blockquote"; inlines: InlineToken[] };

/**
 * Validates whether a URL is safe to open.
 * Only http, https, and mailto schemes are allowed.
 */
export function isSafeUrl(rawUrl: string): boolean {
  if (!rawUrl || typeof rawUrl !== "string") return false;
  const trimmed = rawUrl.trim();
  // Reject dangerous protocols
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
  // Allow http://, https://, and mailto:
  return /^https?:\/\/[^\s]+$/i.test(trimmed) || /^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(trimmed);
}

/**
 * Sanitizes untrusted text by removing dangerous executable HTML tags.
 */
export function sanitizeText(input: string): string {
  if (!input) return "";
  return input
    .replace(/<\s*script\b[^>]*>[\s\S]*?<\s*\/\s*script\s*>/gi, "")
    .replace(/<\s*iframe\b[^>]*>[\s\S]*?<\s*\/\s*iframe\s*>/gi, "")
    .replace(/<\s*object\b[^>]*>[\s\S]*?<\s*\/\s*object\s*>/gi, "")
    .replace(/<\s*embed\b[^>]*>[\s\S]*?<\s*\/\s*embed\s*>/gi, "")
    .replace(/<\s*style\b[^>]*>[\s\S]*?<\s*\/\s*style\s*>/gi, "")
    .replace(/on\w+\s*=\s*["'][^"']*["']/gi, "");
}

/**
 * Tokenizes an inline line of markdown into styled inline tokens.
 */
export function parseInlineTokens(text: string): InlineToken[] {
  if (!text) return [];

  const tokens: InlineToken[] = [];
  let remaining = text;

  // Regex patterns for inline elements
  // 1. Inline code: `code`
  // 2. Bold Italic: ***text*** or ___text___
  // 3. Bold: **text** or __text__
  // 4. Italic: *text* or _text_
  // 5. Link: [text](url)
  const inlineRegex = /(`([^`]+)`|\*\*\*([^*]+)\*\*\*|___([^_]+)___|\*\*([^*]+)\*\*|__([^_]+)__|(?<!\*)\*([^*\s][^*]*[^*\s]|[^*\s])\*(?!\*)|(?<!_)_([^_]+)_(?!_)|\[([^\]]+)\]\(([^)]+)\))/;

  while (remaining.length > 0) {
    const match = remaining.match(inlineRegex);
    if (!match || match.index === undefined) {
      tokens.push({ type: "text", text: remaining });
      break;
    }

    // Text before the match
    if (match.index > 0) {
      tokens.push({ type: "text", text: remaining.slice(0, match.index) });
    }

    const matchedStr = match[0];

    if (matchedStr.startsWith("`") && matchedStr.endsWith("`")) {
      // Inline code
      const codeContent = match[2];
      tokens.push({ type: "inline_code", text: codeContent });
    } else if (
      (matchedStr.startsWith("***") && matchedStr.endsWith("***")) ||
      (matchedStr.startsWith("___") && matchedStr.endsWith("___"))
    ) {
      // Bold italic
      const content = match[3] || match[4];
      tokens.push({ type: "bold_italic", text: content });
    } else if (
      (matchedStr.startsWith("**") && matchedStr.endsWith("**")) ||
      (matchedStr.startsWith("__") && matchedStr.endsWith("__"))
    ) {
      // Bold
      const content = match[5] || match[6];
      tokens.push({ type: "bold", text: content });
    } else if (
      (matchedStr.startsWith("*") && matchedStr.endsWith("*")) ||
      (matchedStr.startsWith("_") && matchedStr.endsWith("_"))
    ) {
      // Italic
      const content = match[7] || match[8];
      tokens.push({ type: "italic", text: content });
    } else if (matchedStr.startsWith("[") && matchedStr.includes("](")) {
      // Link [text](url)
      const linkText = match[9];
      const linkUrl = (match[10] || "").trim();
      const safe = isSafeUrl(linkUrl);
      if (safe) {
        tokens.push({ type: "link", text: linkText, url: linkUrl, isSafe: true });
      } else {
        // Neutralize unsafe links: render text safely without active navigation
        tokens.push({ type: "text", text: `${linkText}` });
      }
    } else {
      tokens.push({ type: "text", text: matchedStr });
    }

    remaining = remaining.slice(match.index + matchedStr.length);
  }

  return tokens;
}

/**
 * Parses a full multiline message string into BlockTokens.
 */
export function parseMarkdownBlocks(rawText: string): BlockToken[] {
  if (!rawText || !rawText.trim()) {
    return [];
  }

  // Pre-sanitize dangerous scripts
  const sanitized = sanitizeText(rawText);
  const lines = sanitized.replace(/\r\n/g, "\n").split("\n");
  const blocks: BlockToken[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // ── 1. Fenced Code Block (```lang) ─────────────────────────
    const codeBlockMatch = line.match(/^```(\w+)?\s*$/);
    if (codeBlockMatch) {
      const language = (codeBlockMatch[1] || "text").toLowerCase();
      const codeLines: string[] = [];
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

    // ── 2. Headings (#, ##, ###) ──────────────────────────────
    const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length as 1 | 2 | 3;
      const headingText = headingMatch[2].trim();
      blocks.push({
        type: "heading",
        level,
        inlines: parseInlineTokens(headingText),
      });
      i++;
      continue;
    }

    // ── 3. Blockquotes (> text) ───────────────────────────────
    const quoteMatch = line.match(/^>\s?(.*)$/);
    if (quoteMatch) {
      const quoteLines: string[] = [quoteMatch[1]];
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

    // ── 4. Bullet List (- item, * item) ────────────────────────
    const bulletMatch = line.match(/^[\*\-]\s+(.+)$/);
    if (bulletMatch) {
      const items: InlineToken[][] = [];
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

    // ── 5. Numbered List (1. item, 2. item) ───────────────────
    const numberedMatch = line.match(/^(\d+)\.\s+(.+)$/);
    if (numberedMatch) {
      const items: { number: number; inlines: InlineToken[] }[] = [];
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

    // ── 6. Empty Line ──────────────────────────────────────────
    if (!line.trim()) {
      i++;
      continue;
    }

    // ── 7. Standard Paragraph (gather consecutive text lines) ──
    const paragraphLines: string[] = [line];
    i++;
    while (i < lines.length) {
      const nextLine = lines[i];
      // Break paragraph if next line is a block boundary
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
