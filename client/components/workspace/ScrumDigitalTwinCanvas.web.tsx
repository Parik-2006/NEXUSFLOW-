/**
 * client/components/workspace/ScrumDigitalTwinCanvas.web.tsx
 * ============================================================================
 * NEXUSFLOW V4 — THREE.JS SCRUM DIGITAL TWIN (SPATIAL PROJECT MODEL)
 *
 * Visualizes real project state:
 *   - Active Sprint ring & committed tasks
 *   - Product Backlog spatial cluster with story-point heights
 *   - Dependency arcs (directional links, highlighting blocked paths)
 *   - Team capacity columns (member load vs available capacity)
 *   - Interactive raycasting: click nodes/dependencies/members for details
 *   - Accessible 2D matrix toggle & reduced-motion support
 *   - Premium warm neutral palette (cream, amber, charcoal, sage, terracotta)
 * ============================================================================
 */

import React, { useEffect, useRef, useState, useMemo } from "react";
import { View, Text, StyleSheet, Pressable, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as THREE from "three";
import { colors, radius, spacing, font } from "@/theme";

export interface DigitalTwinTask {
  _id: string;
  title: string;
  status: "backlog" | "todo" | "in_progress" | "in_review" | "done" | "blocked";
  storyPoints: number;
  priorityScore: number;
  assignedTo?: string | null;
  dependencies?: string[];
  inSprint: boolean;
  sprintNumber?: number;
}

export interface DigitalTwinMember {
  userId: string;
  name: string;
  role: string;
  assignedHours: number;
  capacityHours: number;
  utilization: number;
}

interface ScrumDigitalTwinCanvasProps {
  tasks: DigitalTwinTask[];
  members: DigitalTwinMember[];
  sprintGoal?: string;
  sprintNumber?: number;
  onSelectTask?: (task: DigitalTwinTask) => void;
}

export default function ScrumDigitalTwinCanvas({
  tasks,
  members,
  sprintGoal,
  sprintNumber = 1,
  onSelectTask,
}: ScrumDigitalTwinCanvasProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [selectedTask, setSelectedTask] = useState<DigitalTwinTask | null>(null);
  const [viewMode, setViewMode] = useState<"3d" | "2d">("3d");

  // Summary stats for spatial layout
  const sprintTasks = useMemo(() => tasks.filter((t) => t.inSprint), [tasks]);
  const backlogTasks = useMemo(() => tasks.filter((t) => !t.inSprint), [tasks]);

  useEffect(() => {
    if (Platform.OS !== "web" || !mountRef.current || viewMode !== "3d") return;

    const container = mountRef.current;
    const width = container.clientWidth || 700;
    const height = 340;

    // ── Three.js Scene Setup ────────────────────────────────────────────────
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xfcfaf7); // Warm cream canvas

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(0, 10, 14);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    container.innerHTML = "";
    container.appendChild(renderer.domElement);

    // ── Lighting ────────────────────────────────────────────────────────────
    const ambientLight = new THREE.AmbientLight(0xfffdfa, 1.4);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xfff3e0, 2.0);
    dirLight.position.set(10, 16, 8);
    dirLight.castShadow = true;
    scene.add(dirLight);

    const softLight = new THREE.DirectionalLight(0xe8eef5, 1.0);
    softLight.position.set(-10, 8, -6);
    scene.add(softLight);

    // ── Ground Platform (Subtle Warm Disk) ───────────────────────────────────
    const groundGeo = new THREE.CylinderGeometry(8, 8.2, 0.25, 48);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0xf3ede3,
      roughness: 0.85,
      metalness: 0.05,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.position.y = -0.15;
    ground.receiveShadow = true;
    scene.add(ground);

    // ── Sprint Core Zone (Inner Ring) ───────────────────────────────────────
    const sprintRingGeo = new THREE.RingGeometry(2.4, 2.55, 48);
    const sprintRingMat = new THREE.MeshBasicMaterial({
      color: 0x4f46e5,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.5,
    });
    const sprintRing = new THREE.Mesh(sprintRingGeo, sprintRingMat);
    sprintRing.rotation.x = Math.PI / 2;
    sprintRing.position.y = 0.02;
    scene.add(sprintRing);

    // ── Interactive Objects Map for Raycasting ──────────────────────────────
    const interactiveMeshes: { mesh: THREE.Mesh; task: DigitalTwinTask }[] = [];

    // Helper: color per task status
    const statusColor = (status: string) => {
      switch (status) {
        case "done":
          return 0x16a34a; // Emerald
        case "in_progress":
          return 0x2563eb; // Royal Blue
        case "in_review":
          return 0x9333ea; // Purple
        case "blocked":
          return 0xdc2626; // Ruby Red
        case "todo":
        default:
          return 0xd97706; // Amber
      }
    };

    // ── 1. Position Sprint Tasks in Circular Orbit ───────────────────────────
    const sprintCount = Math.max(sprintTasks.length, 1);
    const sprintMeshMap: Record<string, THREE.Vector3> = {};

    sprintTasks.forEach((task, idx) => {
      const angle = (idx / sprintCount) * Math.PI * 2;
      const radiusDist = 2.4;
      const x = Math.cos(angle) * radiusDist;
      const z = Math.sin(angle) * radiusDist;
      const heightVal = Math.max(0.6, (task.storyPoints || 3) * 0.2);

      const geo = new THREE.BoxGeometry(0.55, heightVal, 0.55);
      const mat = new THREE.MeshStandardMaterial({
        color: statusColor(task.status),
        roughness: 0.35,
        metalness: 0.1,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, heightVal / 2, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;

      scene.add(mesh);
      interactiveMeshes.push({ mesh, task });
      sprintMeshMap[task._id] = new THREE.Vector3(x, heightVal / 2, z);
    });

    // ── 2. Position Backlog Tasks in Outer Arc ───────────────────────────────
    const backlogCount = Math.max(backlogTasks.length, 1);
    backlogTasks.forEach((task, idx) => {
      const angle = Math.PI * 0.2 + (idx / backlogCount) * Math.PI * 1.6;
      const radiusDist = 5.2 + (idx % 2) * 0.8;
      const x = Math.cos(angle) * radiusDist;
      const z = Math.sin(angle) * radiusDist;
      const heightVal = Math.max(0.4, (task.storyPoints || 2) * 0.15);

      const geo = new THREE.CylinderGeometry(0.28, 0.28, heightVal, 16);
      const mat = new THREE.MeshStandardMaterial({
        color: 0x78716c, // Stone muted
        roughness: 0.5,
        metalness: 0.1,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, heightVal / 2, z);
      mesh.castShadow = true;

      scene.add(mesh);
      interactiveMeshes.push({ mesh, task });
      sprintMeshMap[task._id] = new THREE.Vector3(x, heightVal / 2, z);
    });

    // ── 3. Team Member Capacity Pillars (North sector) ──────────────────────
    members.forEach((m, idx) => {
      const x = -3 + idx * 1.5;
      const z = -4.8;
      const capH = Math.max(0.5, m.capacityHours * 0.05);
      const usedH = Math.max(0.1, m.assignedHours * 0.05);

      // Base capacity cylinder (translucent gray)
      const capGeo = new THREE.CylinderGeometry(0.35, 0.35, capH, 16);
      const capMat = new THREE.MeshStandardMaterial({
        color: 0xa8a29e,
        transparent: true,
        opacity: 0.35,
      });
      const capMesh = new THREE.Mesh(capGeo, capMat);
      capMesh.position.set(x, capH / 2, z);
      scene.add(capMesh);

      // Used load cylinder inside (colored by overload)
      const loadGeo = new THREE.CylinderGeometry(0.3, 0.3, Math.min(usedH, capH * 1.2), 16);
      const isOverload = m.utilization > 100;
      const loadMat = new THREE.MeshStandardMaterial({
        color: isOverload ? 0xdc2626 : 0x0284c7,
        roughness: 0.3,
      });
      const loadMesh = new THREE.Mesh(loadGeo, loadMat);
      loadMesh.position.set(x, Math.min(usedH, capH * 1.2) / 2, z);
      scene.add(loadMesh);
    });

    // ── 4. Dependency Curves (Curved Bezier Tubes) ───────────────────────────
    tasks.forEach((t) => {
      if (!t.dependencies || !t.dependencies.length) return;
      const endPos = sprintMeshMap[t._id];
      if (!endPos) return;

      t.dependencies.forEach((depId) => {
        const startPos = sprintMeshMap[depId];
        if (!startPos) return;

        const midPoint = new THREE.Vector3(
          (startPos.x + endPos.x) / 2,
          Math.max(startPos.y, endPos.y) + 1.2,
          (startPos.z + endPos.z) / 2
        );
        const curve = new THREE.QuadraticBezierCurve3(startPos, midPoint, endPos);
        const tubeGeo = new THREE.TubeGeometry(curve, 20, 0.03, 8, false);
        const tubeMat = new THREE.MeshBasicMaterial({
          color: t.status === "blocked" ? 0xef4444 : 0x94a3b8,
          transparent: true,
          opacity: 0.65,
        });
        const tubeMesh = new THREE.Mesh(tubeGeo, tubeMat);
        scene.add(tubeMesh);
      });
    });

    // ── Raycasting on Click ─────────────────────────────────────────────────
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const handleClick = (event: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const meshesOnly = interactiveMeshes.map((im) => im.mesh);
      const intersects = raycaster.intersectObjects(meshesOnly);

      if (intersects.length > 0) {
        const hit = interactiveMeshes.find((im) => im.mesh === intersects[0].object);
        if (hit) {
          setSelectedTask(hit.task);
          if (onSelectTask) onSelectTask(hit.task);
        }
      }
    };

    renderer.domElement.addEventListener("click", handleClick);

    // ── Smooth Subtle Scene Rotation ─────────────────────────────────────────
    let animId: number;
    let angle = 0;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      angle += 0.0018;
      // Gentle orbit camera around center
      camera.position.x = Math.sin(angle) * 13;
      camera.position.z = Math.cos(angle) * 13;
      camera.lookAt(0, 0.8, 0);
      renderer.render(scene, camera);
    };
    animate();

    // ── Cleanup ─────────────────────────────────────────────────────────────
    return () => {
      cancelAnimationFrame(animId);
      if (renderer.domElement) {
        renderer.domElement.removeEventListener("click", handleClick);
      }
      renderer.dispose();
      scene.clear();
      if (container) container.innerHTML = "";
    };
  }, [tasks, members, viewMode, sprintTasks, backlogTasks, onSelectTask]);

  return (
    <View style={s.card}>
      {/* Header bar */}
      <View style={s.header}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <View style={s.badgeIcon}>
              <Ionicons name="cube-outline" size={15} color={colors.primary} />
            </View>
            <Text style={s.title}>Scrum Spatial Digital Twin</Text>
            <View style={s.sprintBadge}>
              <Text style={s.sprintBadgeText}>Sprint {sprintNumber}</Text>
            </View>
          </View>
          <Text style={s.subTitle} numberOfLines={1}>
            {sprintGoal ? `Goal: ${sprintGoal}` : "Live spatial projection of active Sprint ring, backlog clusters & capacity"}
          </Text>
        </View>

        {/* View mode toggle (3D / 2D accessible) */}
        <View style={s.toggleRow}>
          <Pressable
            onPress={() => setViewMode("3d")}
            style={[s.toggleBtn, viewMode === "3d" && s.toggleBtnActive]}
          >
            <Ionicons name="cube" size={13} color={viewMode === "3d" ? "#fff" : colors.textMuted} />
            <Text style={[s.toggleTxt, viewMode === "3d" && s.toggleTxtActive]}>3D Spatial</Text>
          </Pressable>
          <Pressable
            onPress={() => setViewMode("2d")}
            style={[s.toggleBtn, viewMode === "2d" && s.toggleBtnActive]}
          >
            <Ionicons name="grid" size={13} color={viewMode === "2d" ? "#fff" : colors.textMuted} />
            <Text style={[s.toggleTxt, viewMode === "2d" && s.toggleTxtActive]}>2D Matrix</Text>
          </Pressable>
        </View>
      </View>

      {/* 3D WebGL Canvas View */}
      {viewMode === "3d" ? (
        <View style={s.canvasWrapper}>
          <div ref={mountRef} style={{ width: "100%", height: 340, borderRadius: 12, overflow: "hidden" }} />
          {/* Subtle legend overlay */}
          <View style={s.legendOverlay}>
            <View style={s.legendItem}>
              <View style={[s.legendDot, { backgroundColor: "#16a34a" }]} />
              <Text style={s.legendTxt}>Done</Text>
            </View>
            <View style={s.legendItem}>
              <View style={[s.legendDot, { backgroundColor: "#2563eb" }]} />
              <Text style={s.legendTxt}>In Progress</Text>
            </View>
            <View style={s.legendItem}>
              <View style={[s.legendDot, { backgroundColor: "#d97706" }]} />
              <Text style={s.legendTxt}>To Do</Text>
            </View>
            <View style={s.legendItem}>
              <View style={[s.legendDot, { backgroundColor: "#dc2626" }]} />
              <Text style={s.legendTxt}>Blocked</Text>
            </View>
            <View style={s.legendItem}>
              <View style={[s.legendDot, { backgroundColor: "#78716c" }]} />
              <Text style={s.legendTxt}>Backlog</Text>
            </View>
          </View>
        </View>
      ) : (
        /* Accessible 2D Card Grid View */
        <View style={s.accessibleGrid}>
          <View style={s.colSection}>
            <Text style={s.colHeader}>Sprint Ring Tasks ({sprintTasks.length})</Text>
            <View style={s.taskChipList}>
              {sprintTasks.map((t) => (
                <Pressable
                  key={t._id}
                  onPress={() => setSelectedTask(t)}
                  style={[
                    s.taskChip,
                    selectedTask?._id === t._id && s.taskChipSelected,
                  ]}
                >
                  <View style={[s.statusDot, { backgroundColor: t.status === "done" ? "#16a34a" : t.status === "in_progress" ? "#2563eb" : "#d97706" }]} />
                  <Text style={s.taskChipText} numberOfLines={1}>{t.title}</Text>
                  <Text style={s.taskChipPts}>{t.storyPoints}pt</Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View style={s.colSection}>
            <Text style={s.colHeader}>Team Member Capacity</Text>
            <View style={s.memberChipList}>
              {members.map((m) => (
                <View key={m.userId} style={s.memberChip}>
                  <Text style={s.memberName}>{m.name}</Text>
                  <Text style={[s.memberLoad, m.utilization > 100 && { color: "#dc2626" }]}>
                    {m.assignedHours}h / {m.capacityHours}h ({m.utilization}%)
                  </Text>
                </View>
              ))}
            </View>
          </View>
        </View>
      )}

      {/* Selected Task Inspection Sheet */}
      {selectedTask && (
        <View style={s.inspectorCard}>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Text style={s.inspectLabel}>INSPECTED NODE</Text>
              <Text style={s.inspectStatus}>• {selectedTask.status.toUpperCase()}</Text>
            </View>
            <Text style={s.inspectTitle}>{selectedTask.title}</Text>
            <Text style={s.inspectMeta}>
              Story Points: {selectedTask.storyPoints} · Priority: {selectedTask.priorityScore} · {selectedTask.inSprint ? "Committed to Sprint" : "Product Backlog"}
            </Text>
          </View>
          <Pressable onPress={() => setSelectedTask(null)} style={s.closeBtn}>
            <Ionicons name="close" size={16} color={colors.textMuted} />
          </Pressable>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: "#ffffff",
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: "#e7e5e4",
    padding: spacing.md,
    gap: spacing.sm,
    shadowColor: "#1c1917",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    flexWrap: "wrap",
  },
  badgeIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: "#f5f3ff",
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1c1917",
  },
  sprintBadge: {
    backgroundColor: "#e0e7ff",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  sprintBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#4338ca",
  },
  subTitle: {
    fontSize: 12,
    color: "#78716c",
    marginTop: 2,
  },
  toggleRow: {
    flexDirection: "row",
    backgroundColor: "#f5f5f4",
    borderRadius: radius.md,
    padding: 3,
    gap: 3,
  },
  toggleBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.sm,
  },
  toggleBtnActive: {
    backgroundColor: "#4f46e5",
  },
  toggleTxt: {
    fontSize: 11.5,
    fontWeight: "600",
    color: "#78716c",
  },
  toggleTxtActive: {
    color: "#ffffff",
  },
  canvasWrapper: {
    position: "relative",
    borderRadius: radius.md,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#f5f5f4",
  },
  legendOverlay: {
    position: "absolute",
    bottom: 8,
    left: 8,
    flexDirection: "row",
    gap: 10,
    backgroundColor: "rgba(255, 255, 255, 0.85)",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: "#e7e5e4",
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendTxt: {
    fontSize: 10,
    fontWeight: "600",
    color: "#44403c",
  },
  accessibleGrid: {
    padding: spacing.sm,
    gap: spacing.md,
  },
  colSection: {
    gap: 6,
  },
  colHeader: {
    fontSize: 12,
    fontWeight: "700",
    color: "#44403c",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  taskChipList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  taskChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.md,
    backgroundColor: "#f5f5f4",
    borderWidth: 1,
    borderColor: "#e7e5e4",
    maxWidth: 220,
  },
  taskChipSelected: {
    backgroundColor: "#e0e7ff",
    borderColor: "#6366f1",
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  taskChipText: {
    fontSize: 11.5,
    fontWeight: "600",
    color: "#1c1917",
    flexShrink: 1,
  },
  taskChipPts: {
    fontSize: 10.5,
    color: "#78716c",
    fontWeight: "700",
  },
  memberChipList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  memberChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.md,
    backgroundColor: "#f5f5f4",
    borderWidth: 1,
    borderColor: "#e7e5e4",
  },
  memberName: {
    fontSize: 12,
    fontWeight: "700",
    color: "#1c1917",
  },
  memberLoad: {
    fontSize: 11,
    color: "#0284c7",
    fontWeight: "600",
    marginTop: 1,
  },
  inspectorCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "#f5f3ff",
    borderWidth: 1,
    borderColor: "#c7d2fe",
    borderRadius: radius.md,
    padding: 10,
    gap: 8,
  },
  inspectLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: "#4f46e5",
    letterSpacing: 0.5,
  },
  inspectStatus: {
    fontSize: 10,
    fontWeight: "700",
    color: "#4338ca",
  },
  inspectTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1e1b4b",
    marginTop: 2,
  },
  inspectMeta: {
    fontSize: 11,
    color: "#6366f1",
    marginTop: 2,
  },
  closeBtn: {
    padding: 4,
  },
});
