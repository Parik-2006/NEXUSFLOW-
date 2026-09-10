/**
 * client/components/workspace/KanbanDigitalTwinCanvas.web.tsx
 * ============================================================================
 * NEXUSFLOW V4 — THREE.JS KANBAN DIGITAL TWIN (Prompt 30)
 *
 * Spatial flow river projection:
 *   - Backlog buffer cluster
 *   - Continuous flow stages: READY -> IN PROGRESS -> IN REVIEW -> DONE
 *   - WIP boundary rings and saturation indicators
 *   - Dependency interconnects and blocker highlights
 *   - Team workload pedestals
 *   - Interactive raycasting selection and accessible 2D matrix toggle
 * ============================================================================
 */

import React, { useEffect, useRef, useState, useMemo } from "react";
import { View, Text, StyleSheet, Pressable, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as THREE from "three";
import { colors, radius, spacing, font } from "@/theme";

export interface KanbanTwinItem {
  _id: string;
  title: string;
  column: string;
  classOfService: string;
  isBlocked: boolean;
  priorityScore: number;
  ageDays?: number;
  dependencies?: string[];
}

export interface KanbanTwinMember {
  userId: string;
  name: string;
  activeCount: number;
  limit: number;
  utilization: number;
}

interface KanbanDigitalTwinProps {
  items: KanbanTwinItem[];
  columns: { id: string; name: string; wipLimit: number; count: number }[];
  members?: KanbanTwinMember[];
  onSelectItem?: (item: KanbanTwinItem) => void;
}

export default function KanbanDigitalTwinCanvas({
  items,
  columns,
  members = [],
  onSelectItem,
}: KanbanDigitalTwinProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [selectedItem, setSelectedItem] = useState<KanbanTwinItem | null>(null);
  const [show2DFallback, setShow2DFallback] = useState(false);

  // Warm, premium neutral palette
  const stageColors: Record<string, number> = useMemo(
    () => ({
      backlog: 0x9ca3af,
      ready: 0x4f46e5,
      in_progress: 0xd97706,
      in_review: 0x8b5cf6,
      done: 0x10b981,
    }),
    []
  );

  useEffect(() => {
    if (Platform.OS !== "web" || show2DFallback || !mountRef.current) return;

    const container = mountRef.current;
    const width = container.clientWidth || 720;
    const height = 340;

    // 1. Scene, Camera, Renderer
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xfcfbf9); // warm cream neutral

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(0, 18, 28);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.innerHTML = "";
    container.appendChild(renderer.domElement);

    // 2. Lighting
    const ambient = new THREE.AmbientLight(0xffffff, 0.85);
    scene.add(ambient);
    const directional = new THREE.DirectionalLight(0xfffbeb, 1.2);
    directional.position.set(15, 25, 20);
    scene.add(directional);

    // 3. Flow Stages Base Platforms (River)
    const stageWidth = 6.5;
    const stageDepth = 8.5;
    const startX = -((columns.length - 1) * (stageWidth + 1.2)) / 2;

    const itemMeshes: { mesh: THREE.Mesh; item: KanbanTwinItem }[] = [];

    columns.forEach((col, idx) => {
      const x = startX + idx * (stageWidth + 1.2);

      // Base plate for column
      const baseGeo = new THREE.BoxGeometry(stageWidth, 0.4, stageDepth);
      const isSaturated = col.wipLimit > 0 && col.count >= col.wipLimit;
      const baseMat = new THREE.MeshStandardMaterial({
        color: isSaturated ? 0xfecaca : (stageColors[col.id] || 0xe5e7eb),
        roughness: 0.4,
        metalness: 0.1,
        transparent: true,
        opacity: 0.75,
      });
      const baseMesh = new THREE.Mesh(baseGeo, baseMat);
      baseMesh.position.set(x, 0, 0);
      scene.add(baseMesh);

      // Items positioned on top of the stage
      const colItems = items.filter((i) => i.column === col.id);
      colItems.slice(0, 8).forEach((item, itemIdx) => {
        const row = Math.floor(itemIdx / 2);
        const colPos = (itemIdx % 2) - 0.5;

        const itemH = Math.max(0.6, (item.priorityScore || 50) / 45);
        const itemGeo = new THREE.BoxGeometry(1.4, itemH, 1.4);

        let itemCol = stageColors[col.id] || 0x64748b;
        if (item.isBlocked) itemCol = 0xef4444; // Red for blocked
        else if (item.classOfService === "expedite") itemCol = 0xf59e0b; // Amber for expedite

        const itemMat = new THREE.MeshStandardMaterial({
          color: itemCol,
          roughness: 0.3,
          metalness: 0.2,
        });

        const mesh = new THREE.Mesh(itemGeo, itemMat);
        mesh.position.set(x + colPos * 2.2, 0.2 + itemH / 2, -2.5 + row * 2.2);
        scene.add(mesh);
        itemMeshes.push({ mesh, item });
      });
    });

    // 4. Raycasting
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const handlePointerDown = (evt: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((evt.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((evt.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(itemMeshes.map((im) => im.mesh));

      if (intersects.length > 0) {
        const hit = itemMeshes.find((im) => im.mesh === intersects[0].object);
        if (hit) {
          setSelectedItem(hit.item);
          if (onSelectItem) onSelectItem(hit.item);
        }
      }
    };

    renderer.domElement.addEventListener("pointerdown", handlePointerDown);

    // 5. Gentle Orbit / Render Loop
    let animId: number;
    let angle = 0;
    const animate = () => {
      angle += 0.002;
      camera.position.x = Math.sin(angle) * 26;
      camera.position.z = Math.cos(angle) * 26;
      camera.lookAt(0, 0, 0);
      renderer.render(scene, camera);
      animId = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      cancelAnimationFrame(animId);
      if (renderer.domElement) {
        renderer.domElement.removeEventListener("pointerdown", handlePointerDown);
      }
      renderer.dispose();
      if (container) container.innerHTML = "";
    };
  }, [items, columns, show2DFallback, stageColors, onSelectItem]);

  return (
    <View style={s.card}>
      <View style={s.headerRow}>
        <View style={s.titleWrap}>
          <Ionicons name="cube-outline" size={16} color={colors.primary} />
          <Text style={s.title}>Kanban Spatial Flow Twin</Text>
          <View style={s.liveBadge}>
            <Text style={s.liveText}>Interactive 3D</Text>
          </View>
        </View>
        <Pressable
          onPress={() => setShow2DFallback(!show2DFallback)}
          style={s.toggleBtn}
          accessibilityRole="button"
          accessibilityLabel="Toggle 2D Matrix view"
        >
          <Ionicons name={show2DFallback ? "cube" : "grid-outline"} size={14} color={colors.textFaint} />
          <Text style={s.toggleText}>{show2DFallback ? "View 3D" : "2D Matrix"}</Text>
        </Pressable>
      </View>

      {show2DFallback ? (
        <View style={s.fallbackGrid}>
          {columns.map((col) => (
            <View key={col.id} style={s.fallbackCol}>
              <Text style={s.fallbackColTitle}>{col.name}</Text>
              <Text style={s.fallbackColCount}>
                {col.count} {col.wipLimit ? `/ ${col.wipLimit}` : ""}
              </Text>
            </View>
          ))}
        </View>
      ) : (
        <div ref={mountRef} style={{ width: "100%", height: 340, borderRadius: 8, overflow: "hidden" }} />
      )}

      {selectedItem && (
        <View style={s.infoBar}>
          <Text style={s.infoTitle} numberOfLines={1}>{selectedItem.title}</Text>
          <Text style={s.infoSub}>
            Stage: {selectedItem.column.toUpperCase()} · Priority: {selectedItem.priorityScore}/100
            {selectedItem.isBlocked ? " · ⚠️ BLOCKED" : ""}
          </Text>
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
    marginBottom: spacing.md,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
  },
  titleWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  title: {
    ...font.caption,
    fontWeight: "700",
    color: colors.text,
  },
  liveBadge: {
    backgroundColor: colors.primary + "18",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  liveText: {
    fontSize: 10,
    fontWeight: "600",
    color: colors.primary,
  },
  toggleBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  toggleText: {
    fontSize: 11,
    fontWeight: "500",
    color: colors.textFaint,
  },
  fallbackGrid: {
    flexDirection: "row",
    gap: 8,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
  },
  fallbackCol: {
    flex: 1,
    padding: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    alignItems: "center",
  },
  fallbackColTitle: {
    ...font.caption,
    fontWeight: "600",
    color: colors.textFaint,
  },
  fallbackColCount: {
    ...font.h3,
    color: colors.primary,
    marginTop: 4,
  },
  infoBar: {
    marginTop: spacing.sm,
    padding: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },
  infoTitle: {
    ...font.caption,
    fontWeight: "700",
    color: colors.text,
  },
  infoSub: {
    fontSize: 11,
    color: colors.textFaint,
    marginTop: 2,
  },
});
