/**
 * client/components/workspace/DomainIntelligencePanel.tsx
 * ============================================================================
 * NEXUSFLOW V4 — DOMAIN INTELLIGENCE & RESOLVED ENVIRONMENT PANEL (WS 18 & 19)
 *
 * Visualizes the intersection of Domain Intelligence and Methodology:
 *   - Canonical Domain & Subdomain Profile
 *   - Resolved Environment (`Domain × Methodology`)
 *   - Tailored Domain Rules & Expected Deliverables
 *   - Structural Conflict Warnings & Remediation Advice
 *   - Specialized Domain × Methodology Metrics
 * ============================================================================
 */

import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";

interface DomainRule {
  id: string;
  name: string;
  description: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
}

interface ConflictWarning {
  conflictId: string;
  severity: "LOW" | "MEDIUM" | "HIGH";
  ruleA: string;
  ruleB: string;
  guidance: string;
}

interface ResolvedEnvironmentData {
  environmentKey: string;
  domain: string;
  subdomain: string;
  methodology: string;
  recommendedMetrics: string[];
  conflicts: ConflictWarning[];
  hasConflicts: boolean;
  domainProfile: {
    domain: string;
    subdomains: string[];
    terminology: string[];
    expectedDeliverables: string[];
    qualityDimensions: string[];
    riskTypes: string[];
    domainRules: DomainRule[];
  };
}

interface DomainIntelligencePanelProps {
  projectId: string;
  token: string;
  apiBase: string;
}

export default function DomainIntelligencePanel({
  projectId,
  token,
  apiBase,
}: DomainIntelligencePanelProps) {
  const [data, setData] = useState<ResolvedEnvironmentData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!projectId || !token) return;
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`${apiBase}/api/projects/${projectId}/resolved-environment`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to load domain intelligence.");
      const json = await res.json();
      setData(json);
    } catch (err: any) {
      setError(err.message || "Error loading environment.");
    } finally {
      setLoading(false);
    }
  }, [projectId, token, apiBase]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#38bdf8" />
        <Text style={styles.loadingText}>Resolving Domain × Methodology Environment...</Text>
      </View>
    );
  }

  if (error || !data) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error || "No domain data available."}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={fetchData}>
          <Text style={styles.retryBtnText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const { domainProfile, conflicts, recommendedMetrics, environmentKey } = data;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
      {/* Header Banner */}
      <View style={styles.banner}>
        <View style={styles.bannerBadge}>
          <Text style={styles.bannerBadgeText}>RESOLVED ENVIRONMENT</Text>
        </View>
        <Text style={styles.environmentTitle}>{environmentKey}</Text>
        <Text style={styles.subdomainText}>
          Domain: {data.domain} • Subdomain: {data.subdomain || "Core"} • Methodology: {data.methodology}
        </Text>
      </View>

      {/* Structural Conflict Warnings (if any) */}
      {conflicts.length > 0 && (
        <View style={styles.conflictCard}>
          <View style={styles.conflictHeader}>
            <Text style={styles.conflictIcon}>⚠️</Text>
            <Text style={styles.conflictTitle}>
              Domain × Methodology Conflict Detected ({conflicts.length})
            </Text>
          </View>
          {conflicts.map((c) => (
            <View key={c.conflictId} style={styles.conflictItem}>
              <Text style={styles.conflictRule}>• Domain Constraint: {c.ruleA}</Text>
              <Text style={styles.conflictRule}>• Workflow Friction: {c.ruleB}</Text>
              <View style={styles.guidanceBox}>
                <Text style={styles.guidanceTitle}>Actionable Remediation:</Text>
                <Text style={styles.guidanceText}>{c.guidance}</Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Specialized Metrics */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Tailored Metrics for {environmentKey}</Text>
        <View style={styles.tagsContainer}>
          {recommendedMetrics.map((metric, i) => (
            <View key={i} style={styles.metricChip}>
              <Text style={styles.metricChipText}>{metric}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Expected Deliverables */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Expected Domain Deliverables</Text>
        <View style={styles.deliverablesList}>
          {domainProfile.expectedDeliverables.map((deliv, i) => (
            <View key={i} style={styles.deliverableRow}>
              <Text style={styles.deliverableBullet}>◈</Text>
              <Text style={styles.deliverableName}>{deliv}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Domain Rules Registry */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Active Domain Rules</Text>
        {domainProfile.domainRules.map((rule) => (
          <View key={rule.id} style={styles.ruleCard}>
            <View style={styles.ruleHeader}>
              <Text style={styles.ruleName}>{rule.name}</Text>
              <View
                style={[
                  styles.severityBadge,
                  rule.severity === "CRITICAL"
                    ? styles.sevCritical
                    : rule.severity === "HIGH"
                    ? styles.sevHigh
                    : styles.sevMedium,
                ]}
              >
                <Text style={styles.severityText}>{rule.severity}</Text>
              </View>
            </View>
            <Text style={styles.ruleDesc}>{rule.description}</Text>
          </View>
        ))}
      </View>

      {/* Terminology & Quality Dimensions */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Domain Terminology</Text>
        <View style={styles.tagsContainer}>
          {domainProfile.terminology.map((term, i) => (
            <View key={i} style={styles.termChip}>
              <Text style={styles.termChipText}>{term}</Text>
            </View>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#030712",
    padding: 16,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  loadingText: {
    color: "#94a3b8",
    fontSize: 13,
    marginTop: 12,
  },
  errorText: {
    color: "#f87171",
    fontSize: 14,
    marginBottom: 12,
  },
  retryBtn: {
    backgroundColor: "#0ea5e9",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  retryBtnText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 13,
  },
  banner: {
    backgroundColor: "#0f172a",
    borderWidth: 1,
    borderColor: "#1e293b",
    borderRadius: 10,
    padding: 16,
    marginBottom: 16,
  },
  bannerBadge: {
    alignSelf: "flex-start",
    backgroundColor: "#0284c7",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    marginBottom: 6,
  },
  bannerBadgeText: {
    fontSize: 9,
    fontWeight: "800",
    color: "#f0f9ff",
  },
  environmentTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#f8fafc",
  },
  subdomainText: {
    fontSize: 12,
    color: "#64748b",
    marginTop: 4,
  },
  conflictCard: {
    backgroundColor: "#451a03",
    borderWidth: 1,
    borderColor: "#b45309",
    borderRadius: 8,
    padding: 14,
    marginBottom: 16,
  },
  conflictHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  conflictIcon: {
    fontSize: 16,
    marginRight: 6,
  },
  conflictTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#fde68a",
  },
  conflictItem: {
    marginTop: 8,
  },
  conflictRule: {
    fontSize: 12,
    color: "#fef3c7",
    marginBottom: 2,
  },
  guidanceBox: {
    backgroundColor: "rgba(0,0,0,0.3)",
    padding: 8,
    borderRadius: 6,
    marginTop: 6,
  },
  guidanceTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: "#fbbf24",
  },
  guidanceText: {
    fontSize: 11,
    color: "#fde68a",
    marginTop: 2,
  },
  section: {
    marginBottom: 18,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#e2e8f0",
    marginBottom: 8,
  },
  tagsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  metricChip: {
    backgroundColor: "#0f233a",
    borderWidth: 1,
    borderColor: "#0284c7",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  metricChipText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#38bdf8",
  },
  termChip: {
    backgroundColor: "#1e293b",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  termChipText: {
    fontSize: 11,
    color: "#cbd5e1",
  },
  deliverablesList: {
    backgroundColor: "#0f172a",
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: "#1e293b",
  },
  deliverableRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },
  deliverableBullet: {
    color: "#38bdf8",
    fontSize: 10,
    marginRight: 8,
  },
  deliverableName: {
    fontSize: 12,
    color: "#f1f5f9",
    fontWeight: "500",
  },
  ruleCard: {
    backgroundColor: "#0f172a",
    borderWidth: 1,
    borderColor: "#1e293b",
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  ruleHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  ruleName: {
    fontSize: 13,
    fontWeight: "600",
    color: "#f8fafc",
  },
  severityBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  sevCritical: {
    backgroundColor: "#991b1b",
  },
  sevHigh: {
    backgroundColor: "#c2410c",
  },
  sevMedium: {
    backgroundColor: "#854d0e",
  },
  severityText: {
    fontSize: 9,
    fontWeight: "800",
    color: "#ffffff",
  },
  ruleDesc: {
    fontSize: 11,
    color: "#94a3b8",
  },
});
