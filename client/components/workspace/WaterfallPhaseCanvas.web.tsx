/**
 * client/components/workspace/WaterfallPhaseCanvas.web.tsx
 * ============================================================================
 * Three.js Waterfall Phase Pipeline Visualization
 *
 * Requirements → Design → Implementation → Testing → Deployment.
 *
 * Real project data:
 *   - Nodes represent the sequential engineering phases
 *   - Node status/color reflects real task completion and gate clearance
 *   - Clicking a node selects the phase for inspection
 *   - Restrained warm materials (slate, sage, amber, cream) — NO neon
 * ============================================================================
 */

import React, { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as THREE from "three";
import { colors, radius, spacing, font } from "@/theme";

export interface PhaseNodeData {
  key: string;
  label: string;
  order: number;
  taskCount: number;
  doneCount: number;
  status: "cleared" | "in_progress" | "pending";
  gatePassed: boolean;
  deliverables: string[];
}

interface WaterfallPhaseCanvasProps {
  phases: PhaseNodeData[];
  activePhaseKey?: string;
  onSelectPhase: (phaseKey: string) => void;
}

export default function WaterfallPhaseCanvas({
  phases,
  activePhaseKey,
  onSelectPhase,
}: WaterfallPhaseCanvasProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [hoveredPhase, setHoveredPhase] = useState<string | null>(null);
  const [selectedPhase, setSelectedPhase] = useState<PhaseNodeData | null>(
    phases.find((p) => p.key === activePhaseKey) || phases[0] || null
  );

  useEffect(() => {
    if (activePhaseKey) {
      const match = phases.find((p) => p.key === activePhaseKey);
      if (match) setSelectedPhase(match);
    }
  }, [activePhaseKey, phases]);

  useEffect(() => {
    if (Platform.OS !== "web" || !mountRef.current) return;

    const container = mountRef.current;
    const width = container.clientWidth || 600;
    const height = 220;

    // ── Three.js Scene Setup ────────────────────────────────────────────────
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xfaf8f4); // Warm cream canvas

    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 1000);
    camera.position.set(0, 1.2, 7.5);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    container.innerHTML = "";
    container.appendChild(renderer.domElement);

    // ── Lighting (Warm, Natural, Editorial) ──────────────────────────────────
    const ambientLight = new THREE.AmbientLight(0xfffdfa, 1.2);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffeedd, 1.8);
    dirLight.position.set(5, 8, 5);
    dirLight.castShadow = true;
    scene.add(dirLight);

    const fillLight = new THREE.DirectionalLight(0xddeeff, 0.8);
    fillLight.position.set(-5, 3, -2);
    scene.add(fillLight);

    // ── Nodes & Connectors ──────────────────────────────────────────────────
    const nodeMeshes: THREE.Mesh[] = [];
    const nodeGroup = new THREE.Group();
    scene.add(nodeGroup);

    const count = phases.length || 5;
    const spacingX = 2.4;
    const startX = -((count - 1) * spacingX) / 2;

    const phaseColors = {
      cleared: 0x5c8a5a,      // sage green
      in_progress: 0x2f4f4f,  // deep pine
      pending: 0xd8d1c4,      // warm neutral stone
    };

    phases.forEach((p, idx) => {
      const x = startX + idx * spacingX;
      const y = 0;
      const z = 0;

      // Outer ring for active or gate-cleared
      const nodeGeo = new THREE.SphereGeometry(0.55, 32, 32);
      const nodeMat = new THREE.MeshStandardMaterial({
        color: phaseColors[p.status] || phaseColors.pending,
        roughness: 0.35,
        metalness: 0.15,
      });

      const mesh = new THREE.Mesh(nodeGeo, nodeMat);
      mesh.position.set(x, y, z);
      mesh.userData = { phaseKey: p.key, phaseData: p };
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      nodeGroup.add(mesh);
      nodeMeshes.push(mesh);

      // Connecting pipeline cylinder to next node
      if (idx < count - 1) {
        const nextX = startX + (idx + 1) * spacingX;
        const pipeLen = spacingX;
        const pipeGeo = new THREE.CylinderGeometry(0.08, 0.08, pipeLen, 16);
        const pipeMat = new THREE.MeshStandardMaterial({
          color: p.gatePassed ? 0x7d8f69 : 0xe7e2d9,
          roughness: 0.5,
          metalness: 0.1,
        });
        const pipe = new THREE.Mesh(pipeGeo, pipeMat);
        pipe.rotation.z = Math.PI / 2;
        pipe.position.set(x + pipeLen / 2, y, z);
        nodeGroup.add(pipe);
      }
    });

    // ── Raycasting for Interaction ──────────────────────────────────────────
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const onPointerMove = (e: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(nodeMeshes);

      if (intersects.length > 0) {
        const key = intersects[0].object.userData.phaseKey;
        setHoveredPhase(key);
        renderer.domElement.style.cursor = "pointer";
      } else {
        setHoveredPhase(null);
        renderer.domElement.style.cursor = "default";
      }
    };

    const onClick = (e: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(nodeMeshes);

      if (intersects.length > 0) {
        const pData = intersects[0].object.userData.phaseData as PhaseNodeData;
        setSelectedPhase(pData);
        onSelectPhase(pData.key);
      }
    };

    renderer.domElement.addEventListener("mousemove", onPointerMove);
    renderer.domElement.addEventListener("click", onClick);

    // ── Animation Loop ──────────────────────────────────────────────────────
    let reqId: number;
    let clock = new THREE.Clock();

    const animate = () => {
      reqId = requestAnimationFrame(animate);
      const t = clock.getElapsedTime();

      // Subtle breathing motion on node group
      nodeGroup.position.y = Math.sin(t * 0.8) * 0.06;

      // Gently highlight hovered or selected node
      nodeMeshes.forEach((mesh) => {
        const isHovered = mesh.userData.phaseKey === hoveredPhase;
        const isSelected = mesh.userData.phaseKey === selectedPhase?.key;
        const targetScale = isSelected ? 1.25 : isHovered ? 1.15 : 1.0;
        mesh.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), 0.1);
      });

      renderer.render(scene, camera);
    };

    animate();

    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth || 600;
      camera.aspect = w / height;
      camera.updateProjectionMatrix();
      renderer.setSize(w, height);
    };
    window.addEventListener("resize", handleResize);

    return () => {
      cancelAnimationFrame(reqId);
      window.removeEventListener("resize", handleResize);
      if (renderer.domElement) {
        renderer.domElement.removeEventListener("mousemove", onPointerMove);
        renderer.domElement.removeEventListener("click", onClick);
      }
      renderer.dispose();
      container.innerHTML = "";
    };
  }, [phases, hoveredPhase, selectedPhase, onSelectPhase]);

  return (
    <View style={s.card}>
      <View style={s.headerRow}>
        <View style={s.headerLeft}>
          <View style={s.iconWrap}>
            <Ionicons name="git-commit" size={18} color={colors.primary} />
          </View>
          <View>
            <Text style={s.title}>Waterfall Engineering Cascade</Text>
            <Text style={s.subTitle}>Interactive 3D phase gate pipeline (click any node to inspect)</Text>
          </View>
        </View>
        <View style={s.legendRow}>
          <View style={s.legendItem}>
            <View style={[s.legendDot, { backgroundColor: "#5c8a5a" }]} />
            <Text style={s.legendTxt}>Cleared Gate</Text>
          </View>
          <View style={s.legendItem}>
            <View style={[s.legendDot, { backgroundColor: "#2f4f4f" }]} />
            <Text style={s.legendTxt}>In Progress</Text>
          </View>
          <View style={s.legendItem}>
            <View style={[s.legendDot, { backgroundColor: "#d8d1c4" }]} />
            <Text style={s.legendTxt}>Pending</Text>
          </View>
        </View>
      </View>

      {/* 3D WebGL Canvas Container */}
      <View style={s.canvasWrap}>
        <div ref={mountRef} style={{ width: "100%", height: 220 }} />
      </View>

      {/* Selected Node Details Drawer */}
      {selectedPhase && (
        <View style={s.detailsDrawer}>
          <View style={s.drawerHead}>
            <View style={s.drawerBadge}>
              <Text style={s.drawerBadgeTxt}>PHASE {selectedPhase.order}</Text>
            </View>
            <Text style={s.drawerTitle}>{selectedPhase.label}</Text>
            <View style={[s.statusBadge, selectedPhase.status === "cleared" ? s.statusCleared : s.statusActive]}>
              <Text style={[s.statusBadgeTxt, selectedPhase.status === "cleared" ? s.statusClearedTxt : s.statusActiveTxt]}>
                {selectedPhase.status === "cleared" ? "GATE CLEARED" : selectedPhase.status === "in_progress" ? "ACTIVE PHASE" : "LOCKED"}
              </Text>
            </View>
          </View>

          <View style={s.drawerMetrics}>
            <View style={s.metricBox}>
              <Text style={s.metricVal}>{selectedPhase.doneCount} / {selectedPhase.taskCount}</Text>
              <Text style={s.metricLabel}>Tasks Completed</Text>
            </View>
            <View style={s.metricBox}>
              <Text style={s.metricVal}>
                {selectedPhase.taskCount ? Math.round((selectedPhase.doneCount / selectedPhase.taskCount) * 100) : 0}%
              </Text>
              <Text style={s.metricLabel}>Phase Progress</Text>
            </View>
            <View style={s.metricBox}>
              <Text style={[s.metricVal, { color: selectedPhase.gatePassed ? colors.success : colors.warning }]}>
                {selectedPhase.gatePassed ? "Passed ✓" : "Review Req."}
              </Text>
              <Text style={s.metricLabel}>Gate Quality Status</Text>
            </View>
          </View>

          {selectedPhase.deliverables?.length > 0 && (
            <View style={s.deliverablesBox}>
              <Text style={s.deliverablesHead}>KEY DELIVERABLES & REQUIREMENTS</Text>
              <View style={s.deliverablesList}>
                {selectedPhase.deliverables.map((item, idx) => (
                  <View key={idx} style={s.delivItem}>
                    <Ionicons name="checkmark-done" size={14} color={colors.accentDark} />
                    <Text style={s.delivTxt}>{item}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
    shadowColor: "#2F4F4F",
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
    marginBottom: spacing.md,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: spacing.sm,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.text,
  },
  subTitle: {
    fontSize: 11.5,
    color: colors.textMuted,
  },
  legendRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  legendDot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
  },
  legendTxt: {
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: "600",
  },
  canvasWrap: {
    width: "100%",
    height: 220,
    borderRadius: radius.md,
    overflow: "hidden",
    backgroundColor: "#FAF8F4",
    borderWidth: 1,
    borderColor: colors.border,
  },
  detailsDrawer: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: 10,
    marginTop: 4,
  },
  drawerHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  drawerBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
  },
  drawerBadgeTxt: {
    fontSize: 10,
    fontWeight: "800",
    color: "#fff",
  },
  drawerTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: "700",
    color: colors.text,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  statusCleared: {
    backgroundColor: colors.successSoft,
  },
  statusActive: {
    backgroundColor: colors.primarySoft,
  },
  statusBadgeTxt: {
    fontSize: 10,
    fontWeight: "700",
  },
  statusClearedTxt: {
    color: colors.success,
  },
  statusActiveTxt: {
    color: colors.primary,
  },
  drawerMetrics: {
    flexDirection: "row",
    gap: 8,
  },
  metricBox: {
    flex: 1,
    backgroundColor: colors.surface,
    padding: 10,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
  },
  metricVal: {
    fontSize: 15,
    fontWeight: "800",
    color: colors.text,
  },
  metricLabel: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
  deliverablesBox: {
    backgroundColor: colors.surface,
    padding: 10,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 6,
  },
  deliverablesHead: {
    fontSize: 10.5,
    fontWeight: "700",
    color: colors.textFaint,
    letterSpacing: 0.5,
  },
  deliverablesList: {
    gap: 5,
  },
  delivItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  delivTxt: {
    fontSize: 12.5,
    color: colors.text,
  },
});
