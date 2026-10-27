/**
 * client/components/workspace/ScrumDigitalTwinCanvas.web.tsx
 * ============================================================================
 * NEXUSFLOW V4 — THREE.JS SCRUM DIGITAL TWIN (SPATIAL PROJECT MODEL)
 *
 * Visualizes real project state:
 *   - Active Sprint ring & committed tasks in genuine 3D space
 *   - Product Backlog spatial cluster with story-point heights
 *   - Dependency arcs (curved bezier tubes, highlighting blocked paths)
 *   - Team capacity columns (member load vs available capacity)
 *   - OrbitControls: left-drag orbit, scroll zoom, right-drag pan, bounds check
 *   - Viewport controls: Zoom In, Zoom Out, Reset View, Auto-Rotate toggle
 *   - Accessible 2D Matrix view with explicit Status and Priority axes
 *   - Premium warm neutral palette (cream, amber, royal blue, emerald, terracotta)
 * ============================================================================
 */

import React, { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { View, Text, StyleSheet, Pressable, Platform, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
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

const INITIAL_CAMERA_POS = new THREE.Vector3(0, 8.5, 12);
const INITIAL_TARGET_POS = new THREE.Vector3(0, 0.4, 0);

export default function ScrumDigitalTwinCanvas({
  tasks = [],
  members = [],
  sprintGoal,
  sprintNumber = 1,
  onSelectTask,
}: ScrumDigitalTwinCanvasProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);

  const [selectedTask, setSelectedTask] = useState<DigitalTwinTask | null>(null);
  const [viewMode, setViewMode] = useState<"3d" | "2d">("3d");
  const [autoRotate, setAutoRotate] = useState(false);
  const [matrixPriorityFilter, setMatrixPriorityFilter] = useState<"all" | "high" | "medium" | "low">("all");

  // Summary stats for spatial layout
  const sprintTasks = useMemo(() => tasks.filter((t) => t.inSprint), [tasks]);
  const backlogTasks = useMemo(() => tasks.filter((t) => !t.inSprint), [tasks]);

  // Update OrbitControls autoRotate dynamically
  useEffect(() => {
    if (controlsRef.current) {
      controlsRef.current.autoRotate = autoRotate;
      controlsRef.current.autoRotateSpeed = 1.2;
    }
  }, [autoRotate]);

  // Camera toolbar actions
  const handleZoomIn = useCallback(() => {
    if (!controlsRef.current || !cameraRef.current) return;
    const dir = new THREE.Vector3();
    cameraRef.current.getWorldDirection(dir);
    cameraRef.current.position.addScaledVector(dir, 1.8);
    controlsRef.current.update();
  }, []);

  const handleZoomOut = useCallback(() => {
    if (!controlsRef.current || !cameraRef.current) return;
    const dir = new THREE.Vector3();
    cameraRef.current.getWorldDirection(dir);
    cameraRef.current.position.addScaledVector(dir, -1.8);
    controlsRef.current.update();
  }, []);

  const handleResetView = useCallback(() => {
    if (!controlsRef.current || !cameraRef.current) return;
    cameraRef.current.position.copy(INITIAL_CAMERA_POS);
    controlsRef.current.target.copy(INITIAL_TARGET_POS);
    controlsRef.current.update();
  }, []);

  useEffect(() => {
    if (Platform.OS !== "web" || !mountRef.current || viewMode !== "3d") return;

    const container = mountRef.current;
    const width = container.clientWidth || 700;
    const height = 340;

    // ── Three.js Scene Setup ────────────────────────────────────────────────
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xfcfaf7); // Warm cream canvas

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.copy(INITIAL_CAMERA_POS);
    camera.lookAt(INITIAL_TARGET_POS);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    container.innerHTML = "";
    container.appendChild(renderer.domElement);

    // ── OrbitControls ────────────────────────────────────────────────────────
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 5;
    controls.maxDistance = 25;
    controls.maxPolarAngle = Math.PI / 2 - 0.04; // Prevent dipping below ground
    controls.target.copy(INITIAL_TARGET_POS);
    controls.autoRotate = autoRotate;
    controls.autoRotateSpeed = 1.2;
    controlsRef.current = controls;

    // ── Lighting ────────────────────────────────────────────────────────────
    const ambientLight = new THREE.AmbientLight(0xfffdfa, 1.4);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xfff3e0, 2.0);
    dirLight.position.set(8, 14, 7);
    dirLight.castShadow = true;
    scene.add(dirLight);

    const softLight = new THREE.DirectionalLight(0xe8eef5, 1.0);
    softLight.position.set(-8, 7, -5);
    scene.add(softLight);

    // ── Ground Platform (Subtle Warm Disk - Scaled to avoid clipping) ────────
    const groundGeo = new THREE.CylinderGeometry(4.6, 4.8, 0.2, 48);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0xf5efe6,
      roughness: 0.85,
      metalness: 0.05,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.position.y = -0.1;
    ground.receiveShadow = true;
    scene.add(ground);

    // ── Sprint Core Zone (Inner Ring) ───────────────────────────────────────
    const sprintRingGeo = new THREE.RingGeometry(1.9, 2.05, 48);
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
      const radiusDist = 1.95;
      const x = Math.cos(angle) * radiusDist;
      const z = Math.sin(angle) * radiusDist;
      const heightVal = Math.max(0.5, (task.storyPoints || 3) * 0.18);

      const geo = new THREE.BoxGeometry(0.45, heightVal, 0.45);
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
      const angle = Math.PI * 0.15 + (idx / backlogCount) * Math.PI * 1.7;
      const radiusDist = 3.2 + (idx % 2) * 0.6;
      const x = Math.cos(angle) * radiusDist;
      const z = Math.sin(angle) * radiusDist;
      const heightVal = Math.max(0.35, (task.storyPoints || 2) * 0.14);

      const geo = new THREE.CylinderGeometry(0.22, 0.22, heightVal, 16);
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
      const x = -2.2 + idx * 1.1;
      const z = -3.2;
      const capH = Math.max(0.4, (m.capacityHours || 40) * 0.04);
      const usedH = Math.max(0.1, (m.assignedHours || 0) * 0.04);

      // Base capacity cylinder (translucent)
      const capGeo = new THREE.CylinderGeometry(0.26, 0.26, capH, 16);
      const capMat = new THREE.MeshStandardMaterial({
        color: 0xa8a29e,
        transparent: true,
        opacity: 0.35,
      });
      const capMesh = new THREE.Mesh(capGeo, capMat);
      capMesh.position.set(x, capH / 2, z);
      scene.add(capMesh);

      // Used load cylinder inside
      const loadGeo = new THREE.CylinderGeometry(0.22, 0.22, Math.min(usedH, capH * 1.2), 16);
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
          Math.max(startPos.y, endPos.y) + 1.0,
          (startPos.z + endPos.z) / 2
        );
        const curve = new THREE.QuadraticBezierCurve3(startPos, midPoint, endPos);
        const tubeGeo = new THREE.TubeGeometry(curve, 20, 0.025, 8, false);
        const tubeMat = new THREE.MeshBasicMaterial({
          color: t.status === "blocked" ? 0xef4444 : 0x94a3b8,
          transparent: true,
          opacity: 0.65,
        });
        const tubeMesh = new THREE.Mesh(tubeGeo, tubeMat);
        scene.add(tubeMesh);
      });
    });

    // ── Raycasting on Click / Empty Space Clear ──────────────────────────────
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
      } else {
        setSelectedTask(null);
      }
    };

    renderer.domElement.addEventListener("click", handleClick);

    // ── Window Resize Handler ───────────────────────────────────────────────
    const handleResize = () => {
      if (!container || !renderer || !camera) return;
      const newWidth = container.clientWidth || 700;
      const newHeight = 340;
      camera.aspect = newWidth / newHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(newWidth, newHeight);
    };
    window.addEventListener("resize", handleResize);

    // ── Animation Loop ───────────────────────────────────────────────────────
    let animId: number;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // ── Cleanup ─────────────────────────────────────────────────────────────
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", handleResize);
      if (renderer.domElement) {
        renderer.domElement.removeEventListener("click", handleClick);
      }
      controls.dispose();
      renderer.dispose();
      scene.clear();
      if (container) container.innerHTML = "";
      controlsRef.current = null;
      cameraRef.current = null;
    };
  }, [tasks, members, viewMode, sprintTasks, backlogTasks, onSelectTask]);

  // 2D Matrix Columns
  const matrixColumns = [
    { key: "todo", label: "Backlog & To Do", statuses: ["backlog", "todo"], color: "#d97706" },
    { key: "in_progress", label: "In Progress", statuses: ["in_progress"], color: "#2563eb" },
    { key: "in_review", label: "Review & Blocked", statuses: ["in_review", "blocked"], color: "#9333ea" },
    { key: "done", label: "Done", statuses: ["done"], color: "#16a34a" },
  ];

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

          {/* Interactive Camera Toolbar Controls */}
          <View style={s.cameraToolbar}>
            <Pressable onPress={handleZoomIn} style={s.cameraBtn} accessibilityLabel="Zoom in">
              <Ionicons name="add" size={16} color="#374151" />
            </Pressable>
            <Pressable onPress={handleZoomOut} style={s.cameraBtn} accessibilityLabel="Zoom out">
              <Ionicons name="remove" size={16} color="#374151" />
            </Pressable>
            <Pressable onPress={handleResetView} style={s.cameraBtn} accessibilityLabel="Reset view">
              <Ionicons name="refresh-outline" size={15} color="#374151" />
            </Pressable>
            <Pressable
              onPress={() => setAutoRotate((prev) => !prev)}
              style={[s.cameraBtn, autoRotate && s.cameraBtnActive]}
              accessibilityLabel="Toggle rotation"
            >
              <Ionicons name="sync" size={14} color={autoRotate ? "#ffffff" : "#374151"} />
            </Pressable>
          </View>

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
        /* Meaningful 2D Matrix View with Real Data & Clear Axes */
        <View style={s.matrixContainer}>
          {tasks.length === 0 ? (
            <View style={s.emptyMatrixBox}>
              <Ionicons name="file-tray-outline" size={28} color="#94a3b8" />
              <Text style={s.emptyMatrixTitle}>No Work Items in Scrum Workspace</Text>
              <Text style={s.emptyMatrixSub}>
                Upload project documentation and approve AI story suggestions in Project Setup & Plan to populate the 2D Matrix.
              </Text>
            </View>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={true} contentContainerStyle={s.matrixScroll}>
              {matrixColumns.map((col) => {
                const colTasks = tasks.filter((t) => col.statuses.includes(t.status));
                return (
                  <View key={col.key} style={s.matrixColumn}>
                    <View style={[s.matrixColHeader, { borderLeftColor: col.color }]}>
                      <Text style={s.matrixColTitle}>{col.label}</Text>
                      <View style={s.matrixColCount}>
                        <Text style={s.matrixColCountText}>{colTasks.length}</Text>
                      </View>
                    </View>

                    <ScrollView style={s.matrixCardScroll} showsVerticalScrollIndicator={false}>
                      {colTasks.length === 0 ? (
                        <Text style={s.emptyColText}>No items</Text>
                      ) : (
                        colTasks.map((t) => {
                          const isSelected = selectedTask?._id === t._id;
                          return (
                            <Pressable
                              key={t._id}
                              onPress={() => setSelectedTask(t)}
                              style={[s.matrixTaskCard, isSelected && s.matrixTaskCardSelected]}
                            >
                              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                                <View style={[s.matrixStatusDot, { backgroundColor: col.color }]} />
                                <Text style={s.matrixPtsBadge}>{t.storyPoints}pt</Text>
                              </View>
                              <Text style={s.matrixCardTitle} numberOfLines={2}>
                                {t.title}
                              </Text>
                              <View style={s.matrixCardFooter}>
                                <Text style={s.matrixSprintTag}>
                                  {t.inSprint ? `Sprint ${sprintNumber}` : "Backlog"}
                                </Text>
                                {t.dependencies && t.dependencies.length > 0 && (
                                  <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
                                    <Ionicons name="git-network-outline" size={11} color="#6b7280" />
                                    <Text style={s.matrixDepCount}>{t.dependencies.length}</Text>
                                  </View>
                                )}
                              </View>
                            </Pressable>
                          );
                        })
                      )}
                    </ScrollView>
                  </View>
                );
              })}
            </ScrollView>
          )}

          {/* Member Capacity Summary Row */}
          {members.length > 0 && (
            <View style={s.matrixMemberRow}>
              <Text style={s.matrixMemberLabel}>Team Availability:</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {members.map((m) => (
                  <View key={m.userId} style={s.memberChip}>
                    <Text style={s.memberName}>{m.name}</Text>
                    <Text style={[s.memberLoad, m.utilization > 100 && { color: "#dc2626" }]}>
                      {m.assignedHours}h / {m.capacityHours}h ({m.utilization}%)
                    </Text>
                  </View>
                ))}
              </ScrollView>
            </View>
          )}
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
    alignItems: "center",
    gap: 4,
    backgroundColor: "#f5f5f4",
    padding: 3,
    borderRadius: radius.md,
  },
  toggleBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  toggleBtnActive: {
    backgroundColor: colors.primary,
  },
  toggleTxt: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.textMuted,
  },
  toggleTxtActive: {
    color: "#ffffff",
  },
  canvasWrapper: {
    position: "relative",
    width: "100%",
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#fcfaf7",
  },
  cameraToolbar: {
    position: "absolute",
    top: 10,
    right: 10,
    flexDirection: "row",
    gap: 6,
    zIndex: 10,
  },
  cameraBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: "rgba(255, 255, 255, 0.9)",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  cameraBtnActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  legendOverlay: {
    position: "absolute",
    bottom: 8,
    left: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "rgba(255,255,255,0.85)",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: "#f5f5f4",
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  legendDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  legendTxt: {
    fontSize: 11,
    color: "#57534e",
    fontWeight: "500",
  },
  matrixContainer: {
    paddingVertical: 6,
    gap: 10,
  },
  matrixScroll: {
    flexDirection: "row",
    gap: 10,
    paddingBottom: 6,
  },
  matrixColumn: {
    width: 210,
    backgroundColor: "#fafaf9",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "#e7e5e4",
    padding: 8,
    gap: 8,
  },
  matrixColHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderLeftWidth: 3,
    paddingLeft: 6,
  },
  matrixColTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#292524",
  },
  matrixColCount: {
    backgroundColor: "#e7e5e4",
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radius.pill,
  },
  matrixColCountText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#57534e",
  },
  matrixCardScroll: {
    maxHeight: 250,
  },
  emptyColText: {
    fontSize: 11,
    color: "#a8a29e",
    fontStyle: "italic",
    textAlign: "center",
    paddingVertical: 12,
  },
  matrixTaskCard: {
    backgroundColor: "#ffffff",
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: "#e7e5e4",
    padding: 8,
    gap: 6,
    marginBottom: 6,
  },
  matrixTaskCardSelected: {
    borderColor: colors.primary,
    borderWidth: 1.5,
    backgroundColor: "#f5f3ff",
  },
  matrixStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  matrixPtsBadge: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.primary,
    backgroundColor: "#eff6ff",
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
  },
  matrixCardTitle: {
    fontSize: 12,
    fontWeight: "600",
    color: "#1c1917",
    lineHeight: 16,
  },
  matrixCardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: "#f5f5f4",
    paddingTop: 4,
  },
  matrixSprintTag: {
    fontSize: 10,
    color: "#78716c",
  },
  matrixDepCount: {
    fontSize: 10,
    color: "#6b7280",
  },
  matrixMemberRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: "#f5f5f4",
    paddingTop: 8,
  },
  matrixMemberLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#57534e",
  },
  memberChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#f5f5f4",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  memberName: {
    fontSize: 11,
    fontWeight: "600",
    color: "#292524",
  },
  memberLoad: {
    fontSize: 11,
    color: "#57534e",
  },
  emptyMatrixBox: {
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
    gap: 6,
    backgroundColor: "#fafaf9",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "#e7e5e4",
  },
  emptyMatrixTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#475569",
  },
  emptyMatrixSub: {
    fontSize: 12,
    color: "#94a3b8",
    textAlign: "center",
    maxWidth: 420,
    lineHeight: 16,
  },
  inspectorCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "#fbfbfa",
    borderWidth: 1,
    borderColor: "#e7e5e4",
    borderRadius: radius.md,
    padding: spacing.sm,
    marginTop: 4,
  },
  inspectLabel: {
    fontSize: 9,
    fontWeight: "800",
    color: colors.primary,
    letterSpacing: 0.5,
  },
  inspectStatus: {
    fontSize: 9,
    fontWeight: "700",
    color: "#78716c",
  },
  inspectTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1c1917",
    marginTop: 2,
  },
  inspectMeta: {
    fontSize: 11,
    color: "#78716c",
    marginTop: 2,
  },
  closeBtn: {
    padding: 4,
  },
});
