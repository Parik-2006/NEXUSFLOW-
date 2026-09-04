/**
 * client/components/chat/SafeMarkdownMessage.tsx
 * ============================================================================
 * Safe, professional Markdown message renderer for NEXUSFLOW.
 * 
 * Features:
 * - Controlled markdown subset: bold, italic, bold-italic, inline code,
 *   code blocks, bullet lists, numbered lists, headings, quotes, safe links.
 * - Raw formatting markers (*, **, `, ```) are cleanly parsed into formatted UI.
 * - Horizontal scrolling code blocks with monospace font and copy button.
 * - Zero XSS vulnerability: native React Native Text & View primitives.
 * - Contrast-aware: seamlessly adjusts for sender bubble (isMe) vs receiver bubble.
 * - Responsive: desktop, tablet, and mobile layouts without horizontal overflow.
 * ============================================================================
 */

import React, { useMemo, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Linking,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  parseMarkdownBlocks,
  type BlockToken,
  type InlineToken,
} from "@/utils/markdownParser";
import { colors, radius, spacing } from "@/theme";

interface SafeMarkdownMessageProps {
  content: string;
  isMe?: boolean;
  theme?: "primary" | "surface";
}

export default function SafeMarkdownMessage({
  content,
  isMe = false,
  theme,
}: SafeMarkdownMessageProps) {
  const blocks = useMemo(() => parseMarkdownBlocks(content), [content]);

  // Render inline tokens inside a Text container
  const renderInlines = useCallback(
    (inlines: InlineToken[], parentKey: string | number) => {
      return inlines.map((token, idx) => {
        const key = `${parentKey}_inl_${idx}`;

        switch (token.type) {
          case "bold":
            return (
              <Text key={key} style={styles.bold}>
                {token.text}
              </Text>
            );

          case "italic":
            return (
              <Text key={key} style={styles.italic}>
                {token.text}
              </Text>
            );

          case "bold_italic":
            return (
              <Text key={key} style={[styles.bold, styles.italic]}>
                {token.text}
              </Text>
            );

          case "inline_code":
            return (
              <Text
                key={key}
                style={[
                  styles.inlineCode,
                  isMe ? styles.inlineCodeMe : styles.inlineCodeOther,
                ]}
              >
                {` ${token.text} `}
              </Text>
            );

          case "link":
            return (
              <Text
                key={key}
                style={[
                  styles.link,
                  isMe ? styles.linkMe : styles.linkOther,
                ]}
                onPress={() => {
                  if (token.isSafe && token.url) {
                    if (Platform.OS === "web" && typeof window !== "undefined") {
                      window.open(token.url, "_blank", "noopener,noreferrer");
                    } else {
                      Linking.openURL(token.url).catch(() => {});
                    }
                  }
                }}
              >
                {token.text}
              </Text>
            );

          case "text":
          default:
            return <Text key={key}>{token.text}</Text>;
        }
      });
    },
    [isMe]
  );

  if (!blocks.length) {
    return null;
  }

  return (
    <View style={styles.container}>
      {blocks.map((block, blockIdx) => {
        const blockKey = `blk_${blockIdx}`;

        switch (block.type) {
          case "paragraph":
            return (
              <View key={blockKey} style={styles.paragraphWrap}>
                <Text style={[styles.paragraphText, isMe ? styles.textMe : styles.textOther]}>
                  {renderInlines(block.inlines, blockKey)}
                </Text>
              </View>
            );

          case "heading": {
            const headingStyle =
              block.level === 1
                ? styles.h1
                : block.level === 2
                ? styles.h2
                : styles.h3;
            return (
              <View key={blockKey} style={styles.headingWrap}>
                <Text style={[headingStyle, isMe ? styles.textMe : styles.textOther]}>
                  {renderInlines(block.inlines, blockKey)}
                </Text>
              </View>
            );
          }

          case "bullet_list":
            return (
              <View key={blockKey} style={styles.listContainer}>
                {block.items.map((itemInlines, itemIdx) => (
                  <View key={`${blockKey}_b_${itemIdx}`} style={styles.listItemRow}>
                    <Text style={[styles.bulletMarker, isMe ? styles.textMe : styles.bulletOther]}>
                      •
                    </Text>
                    <Text style={[styles.listContentText, isMe ? styles.textMe : styles.textOther]}>
                      {renderInlines(itemInlines, `${blockKey}_b_${itemIdx}`)}
                    </Text>
                  </View>
                ))}
              </View>
            );

          case "numbered_list":
            return (
              <View key={blockKey} style={styles.listContainer}>
                {block.items.map((item, itemIdx) => (
                  <View key={`${blockKey}_n_${itemIdx}`} style={styles.listItemRow}>
                    <Text style={[styles.numberedMarker, isMe ? styles.textMe : styles.numberedOther]}>
                      {item.number}.
                    </Text>
                    <Text style={[styles.listContentText, isMe ? styles.textMe : styles.textOther]}>
                      {renderInlines(item.inlines, `${blockKey}_n_${itemIdx}`)}
                    </Text>
                  </View>
                ))}
              </View>
            );

          case "blockquote":
            return (
              <View
                key={blockKey}
                style={[
                  styles.blockquoteWrap,
                  isMe ? styles.blockquoteMe : styles.blockquoteOther,
                ]}
              >
                <Text style={[styles.blockquoteText, isMe ? styles.textMe : styles.textOther]}>
                  {renderInlines(block.inlines, blockKey)}
                </Text>
              </View>
            );

          case "code_block":
            return (
              <CodeBlockCard
                key={blockKey}
                language={block.language}
                code={block.code}
                isMe={isMe}
              />
            );

          default:
            return null;
        }
      })}
    </View>
  );
}

/**
 * Code Block subcomponent with language header, horizontal scrolling, and copy button.
 */
function CodeBlockCard({
  language,
  code,
  isMe,
}: {
  language: string;
  code: string;
  isMe: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        navigator.clipboard.writeText(code);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      // non-fatal
    }
  }, [code]);

  const displayLang = (language || "code").toUpperCase();

  return (
    <View style={[styles.codeBlockContainer, isMe ? styles.codeBlockMe : styles.codeBlockOther]}>
      {/* Code Header Bar */}
      <View style={styles.codeHeaderBar}>
        <View style={styles.codeLangTag}>
          <Ionicons name="code-slash" size={12} color="#94a3b8" />
          <Text style={styles.codeLangText}>{displayLang}</Text>
        </View>
        <Pressable onPress={handleCopy} style={styles.copyButton} hitSlop={6}>
          <Ionicons
            name={copied ? "checkmark" : "copy-outline"}
            size={12}
            color={copied ? colors.success : "#94a3b8"}
          />
          <Text style={[styles.copyButtonText, copied && { color: colors.success }]}>
            {copied ? "Copied" : "Copy"}
          </Text>
        </Pressable>
      </View>

      {/* Code Scrollable Area */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={true}
        style={styles.codeScrollView}
        contentContainerStyle={styles.codeScrollContent}
      >
        <Text style={styles.codeText} selectable>
          {code}
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
  },
  paragraphWrap: {
    marginVertical: 2,
  },
  paragraphText: {
    fontSize: 14,
    lineHeight: 20,
  },
  textMe: {
    color: "#ffffff",
  },
  textOther: {
    color: colors.text,
  },
  bold: {
    fontWeight: "700",
  },
  italic: {
    fontStyle: "italic",
  },
  inlineCode: {
    fontFamily: Platform.select({
      ios: "Courier",
      android: "monospace",
      default: "monospace",
    }),
    fontSize: 12.5,
    borderRadius: radius.sm,
  },
  inlineCodeMe: {
    backgroundColor: "rgba(255, 255, 255, 0.22)",
    color: "#ffffff",
  },
  inlineCodeOther: {
    backgroundColor: "rgba(100, 116, 139, 0.12)",
    color: colors.primaryDark || "#4338ca",
  },
  link: {
    textDecorationLine: "underline",
    fontWeight: "600",
  },
  linkMe: {
    color: "#a5f3fc",
  },
  linkOther: {
    color: colors.primary,
  },
  headingWrap: {
    marginTop: 6,
    marginBottom: 3,
  },
  h1: {
    fontSize: 17,
    fontWeight: "800",
    letterSpacing: -0.2,
  },
  h2: {
    fontSize: 15.5,
    fontWeight: "700",
    letterSpacing: -0.1,
  },
  h3: {
    fontSize: 14,
    fontWeight: "700",
  },
  listContainer: {
    marginVertical: 3,
    paddingLeft: 2,
  },
  listItemRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginVertical: 1.5,
  },
  bulletMarker: {
    width: 14,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
  bulletOther: {
    color: colors.primary,
  },
  numberedMarker: {
    minWidth: 18,
    fontSize: 13,
    lineHeight: 20,
    fontWeight: "700",
  },
  numberedOther: {
    color: colors.primary,
  },
  listContentText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  blockquoteWrap: {
    marginVertical: 4,
    paddingLeft: spacing.sm,
    paddingVertical: 2,
    borderLeftWidth: 3,
  },
  blockquoteMe: {
    borderLeftColor: "rgba(255, 255, 255, 0.5)",
  },
  blockquoteOther: {
    borderLeftColor: colors.primary,
  },
  blockquoteText: {
    fontSize: 13.5,
    lineHeight: 19,
    fontStyle: "italic",
    opacity: 0.92,
  },
  codeBlockContainer: {
    marginVertical: 6,
    borderRadius: radius.md,
    overflow: "hidden",
    borderWidth: 1,
    maxWidth: "100%",
  },
  codeBlockMe: {
    backgroundColor: "#0f172a",
    borderColor: "rgba(255, 255, 255, 0.15)",
  },
  codeBlockOther: {
    backgroundColor: "#1e293b",
    borderColor: colors.border,
  },
  codeHeaderBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    backgroundColor: "rgba(15, 23, 42, 0.6)",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.08)",
  },
  codeLangTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  codeLangText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#94a3b8",
    letterSpacing: 0.5,
  },
  copyButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.sm,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
  },
  copyButtonText: {
    fontSize: 10,
    fontWeight: "600",
    color: "#94a3b8",
  },
  codeScrollView: {
    maxHeight: 280,
  },
  codeScrollContent: {
    padding: spacing.sm,
  },
  codeText: {
    fontFamily: Platform.select({
      ios: "Menlo",
      android: "monospace",
      default: "Consolas, Monaco, monospace",
    }),
    fontSize: 12,
    lineHeight: 18,
    color: "#f8fafc",
  },
});
