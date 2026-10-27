/**
 * Pure geometry and layout computation for Overview Level 1 Architecture & Dependency Graph.
 * Completely decoupled from React and DOM rendering.
 */

import type {
  GraphResponseData,
  GraphEdge,
  FindingSeverity,
} from '../../../../shared/types.js';

export interface Point {
  x: number;
  y: number;
}

export interface RectBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LayoutNode {
  id: string;
  type: 'project' | 'module';
  label: string;
  pos: Point;
  radius: number;
  labelBox: RectBox;
  ringRadius?: number;
  badgeBox?: RectBox;
  isMostAffected: boolean;
  findingCount?: number;
  maxSeverity?: FindingSeverity | null;
}

export interface LayoutEdge {
  id: string;
  sourceId: string;
  targetId: string;
  pathD: string;
  controlPoint: Point;
  status?: string;
  count?: number;
  chipPos?: Point;
  chipBox?: RectBox;
  isUnresolved: boolean;
}

export interface L1LayoutResult {
  svgWidth: number;
  svgHeight: number;
  centerX: number;
  centerY: number;
  orbitRadius: number;
  projectNode: LayoutNode | null;
  moduleNodes: LayoutNode[];
  edges: LayoutEdge[];
  hiddenEdgesCount: number;
  overflowModulesCount: number;
  mostAffectedModuleId: string | null;
}

const SEVERITY_ORDER: Record<FindingSeverity, number> = {
  critical: 5,
  high: 4,
  medium: 3,
  low: 2,
  unknown: 1,
};

/**
 * Estimate text bounding box width as characters times a fixed factor plus horizontal padding.
 * For 11px font: charFactor is 6.2 px per character plus 6 px horizontal padding.
 */
export function estimateLabelBox(
  text: string,
  centerX: number,
  baselineY: number,
  fontSize: number = 11
): RectBox {
  const charFactor = 6.2;
  const padding = 6;
  const width = Math.round(Math.max(20, text.length * charFactor + padding));
  const height = Math.round(fontSize + 4);
  return {
    x: Math.round(centerX - width / 2),
    y: Math.round(baselineY - fontSize),
    width,
    height,
  };
}

export function boxesIntersect(a: RectBox, b: RectBox): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

export function pointInBox(px: number, py: number, box: RectBox): boolean {
  return (
    px >= box.x &&
    px <= box.x + box.width &&
    py >= box.y &&
    py <= box.y + box.height
  );
}

export function pointInCircle(
  px: number,
  py: number,
  cx: number,
  cy: number,
  r: number
): boolean {
  const dx = px - cx;
  const dy = py - cy;
  return dx * dx + dy * dy <= r * r;
}

/**
 * Pure layout function for Level 1 graph visualization.
 */
export function computeL1Layout(graphData: GraphResponseData): L1LayoutResult {
  const svgWidth = 640;
  const svgHeight = 440;
  const centerX = 320;
  const centerY = 220;
  const orbitRadius = 150;

  const projectNodeRaw = graphData.nodes.find((n) => n.type === 'project');
  const allModuleNodes = graphData.nodes.filter((n) => n.type === 'module');

  // Cap at 24 modules
  const MAX_DISPLAYED_MODULES = 24;
  const displayedModules = allModuleNodes.slice(0, MAX_DISPLAYED_MODULES);
  const overflowModulesCount = allModuleNodes.length - displayedModules.length;

  // Identify most affected module (highest maxSeverity rank, then finding count)
  let mostAffectedModuleId: string | null = null;
  let highestRank = -1;
  let highestCount = -1;

  for (const m of allModuleNodes) {
    if (m.maxSeverity && (m.findingCount ?? 0) > 0) {
      const rank = SEVERITY_ORDER[m.maxSeverity] ?? 0;
      const count = m.findingCount ?? 0;
      if (rank > highestRank || (rank === highestRank && count > highestCount)) {
        highestRank = rank;
        highestCount = count;
        mostAffectedModuleId = m.id;
      }
    }
  }

  // Position Project Node at center
  let projectNode: LayoutNode | null = null;
  if (projectNodeRaw) {
    const rawLabel = projectNodeRaw.label;
    // When project name exceeds 26 characters, clamp layout calculation to 26 characters
    // so the bounding box doesn't horizontally touch or overlap adjacent module pills
    const effectiveLabel = rawLabel.length > 26 ? rawLabel.slice(0, 26) : rawLabel;
    const labelBox = estimateLabelBox(effectiveLabel, centerX, centerY + 38, 12);
    projectNode = {
      id: projectNodeRaw.id,
      type: 'project',
      label: projectNodeRaw.label,
      pos: { x: centerX, y: centerY },
      radius: 28,
      labelBox,
      isMostAffected: false,
      findingCount: projectNodeRaw.findingCount,
      maxSeverity: projectNodeRaw.maxSeverity,
    };
  }

  // Position Module Nodes
  const moduleNodes: LayoutNode[] = [];
  const nodePositions = new Map<string, Point>();
  if (projectNode) {
    nodePositions.set(projectNode.id, projectNode.pos);
  }

  const count = displayedModules.length;

  // Single ring for <= 8 modules; two staggered concentric rings for > 8 modules (Defect 4 fix)
  if (count <= 8) {
    displayedModules.forEach((mod, index) => {
      const angle = (2 * Math.PI * index) / (count || 1) - Math.PI / 2;
      const x = Math.round(centerX + orbitRadius * Math.cos(angle));
      const y = Math.round(centerY + orbitRadius * Math.sin(angle));
      const pos = { x, y };
      nodePositions.set(mod.id, pos);

      const isMostAffected = mod.id === mostAffectedModuleId;
      const ringRadius = isMostAffected ? 26 : undefined;
      // Ring outer edge reaches y + 28. If ring exists, baseline at y + 44 (label top at y + 33, 5px from ring).
      // If no ring, outer edge reaches y + 20, baseline at y + 36 (label top at y + 25, 5px from circle).
      const baselineY = ringRadius ? y + 44 : y + 36;
      const labelBox = estimateLabelBox(mod.label, x, baselineY, 11);

      const badgeBox = (mod.findingCount ?? 0) > 0 && mod.maxSeverity
        ? { x: x - 28, y: baselineY + 10, width: 56, height: 20 }
        : undefined;

      moduleNodes.push({
        id: mod.id,
        type: 'module',
        label: mod.label,
        pos,
        radius: 20,
        labelBox,
        ringRadius,
        badgeBox,
        isMostAffected,
        findingCount: mod.findingCount,
        maxSeverity: mod.maxSeverity,
      });
    });
  } else {
    // Two concentric rings for > 8 modules
    const outerCount = Math.ceil(count / 2);
    const innerCount = count - outerCount;
    const rOuter = 165;
    const rInner = 100;

    displayedModules.forEach((mod, index) => {
      const isOuter = index < outerCount;
      const ringIndex = isOuter ? index : index - outerCount;
      const ringTotal = isOuter ? outerCount : innerCount;
      const angleOffset = isOuter ? 0 : Math.PI / innerCount;
      const angle = (2 * Math.PI * ringIndex) / ringTotal - Math.PI / 2 + angleOffset;
      const r = isOuter ? rOuter : rInner;

      const x = Math.round(centerX + r * Math.cos(angle));
      const y = Math.round(centerY + r * Math.sin(angle));
      const pos = { x, y };
      nodePositions.set(mod.id, pos);

      const isMostAffected = mod.id === mostAffectedModuleId;
      const ringRadius = isMostAffected ? 26 : undefined;
      const baselineY = ringRadius ? y + 44 : y + 34;
      const labelBox = estimateLabelBox(mod.label, x, baselineY, 10);

      const badgeBox = (mod.findingCount ?? 0) > 0 && mod.maxSeverity
        ? { x: x - 28, y: baselineY + 8, width: 56, height: 18 }
        : undefined;

      moduleNodes.push({
        id: mod.id,
        type: 'module',
        label: mod.label,
        pos,
        radius: 18,
        labelBox,
        ringRadius,
        badgeBox,
        isMostAffected,
        findingCount: mod.findingCount,
        maxSeverity: mod.maxSeverity,
      });
    });
  }

  const allLabelBoxes: RectBox[] = [];
  if (projectNode) allLabelBoxes.push(projectNode.labelBox);
  for (const m of moduleNodes) allLabelBoxes.push(m.labelBox);

  // Filter and sort edges
  const rawEdges = (graphData.edges || []).filter(
    (e) => nodePositions.has(e.source_id) && nodePositions.has(e.target_id)
  );

  // Deterministic sort: count descending, then id
  const sortedEdges = [...rawEdges].sort((a, b) => {
    const countA = a.count ?? 0;
    const countB = b.count ?? 0;
    if (countB !== countA) return countB - countA;
    return a.id.localeCompare(b.id);
  });

  // Cap: with more than 10 modules draw only the 12 strongest edges (by count)
  let edgesToRender: GraphEdge[] = sortedEdges;
  let hiddenEdgesCount = 0;
  if (displayedModules.length > 10 && sortedEdges.length > 12) {
    edgesToRender = sortedEdges.slice(0, 12);
    hiddenEdgesCount = sortedEdges.length - 12;
  }

  const edges: LayoutEdge[] = [];
  const occupiedChipBoxes: RectBox[] = [];

  for (const edge of edgesToRender) {
    const sPos = nodePositions.get(edge.source_id);
    const tPos = nodePositions.get(edge.target_id);
    if (!sPos || !tPos) continue;

    const midX = (sPos.x + tPos.x) / 2;
    const midY = (sPos.y + tPos.y) / 2;

    const testCurve = (c: Point): boolean => {
      for (let k = 0; k < 40; k++) {
        const t = k / 39;
        const px = (1 - t) ** 2 * sPos.x + 2 * (1 - t) * t * c.x + t ** 2 * tPos.x;
        const py = (1 - t) ** 2 * sPos.y + 2 * (1 - t) * t * c.y + t ** 2 * tPos.y;

        // Check project node circle
        if (pointInCircle(px, py, centerX, centerY, 28)) return false;

        // Check other module circles (not endpoints)
        for (const m of moduleNodes) {
          if (m.id !== edge.source_id && m.id !== edge.target_id) {
            if (pointInCircle(px, py, m.pos.x, m.pos.y, m.radius)) return false;
          }
        }

        // Check label boxes (no sample inside ANY label box)
        for (const box of allLabelBoxes) {
          if (pointInBox(px, py, box)) return false;
        }
      }

      // If edge has a count, ensure at least one valid chip position exists in [0.35, 0.65]
      if (edge.count !== undefined) {
        let hasValidChip = false;
        for (let t = 0.35; t <= 0.65; t += 0.02) {
          const px = Math.round((1 - t) ** 2 * sPos.x + 2 * (1 - t) * t * c.x + t ** 2 * tPos.x);
          const py = Math.round((1 - t) ** 2 * sPos.y + 2 * (1 - t) * t * c.y + t ** 2 * tPos.y);
          const box: RectBox = { x: px - 9, y: py - 9, width: 18, height: 18 };
          if (
            !allLabelBoxes.some((lBox) => boxesIntersect(box, lBox)) &&
            !occupiedChipBoxes.some((cBox) => boxesIntersect(box, cBox))
          ) {
            hasValidChip = true;
            break;
          }
        }
        if (!hasValidChip) return false;
      }

      return true;
    };

    let bestCtrl: Point | null = null;

    // Normal vector perpendicular to chord
    const cdx = tPos.x - sPos.x;
    const cdy = tPos.y - sPos.y;
    const chordLen = Math.sqrt(cdx * cdx + cdy * cdy);

    let nX = -cdy / (chordLen || 1);
    let nY = cdx / (chordLen || 1);

    const testMidX = midX + nX * 10;
    const testMidY = midY + nY * 10;
    if (Math.hypot(testMidX - centerX, testMidY - centerY) < Math.hypot(midX - centerX, midY - centerY)) {
      nX = -nX;
      nY = -nY;
    }

    const candidates: Point[] = [];
    // Normal pushes (both outward and inward)
    for (const p of [25, 45, 65, 85, 110, -25, -45, -65, -85, -110, 15, -15]) {
      candidates.push({ x: midX + nX * p, y: midY + nY * p });
    }

    // Radial pushes
    const vx = midX - centerX;
    const vy = midY - centerY;
    const d = Math.hypot(vx, vy);
    const ux = d > 0.001 ? vx / d : 0;
    const uy = d > 0.001 ? vy / d : -1;
    for (const r of [80, 85, 75, 90, 70, 95, 65, 100]) {
      const ax = centerX + ux * r;
      const ay = centerY + uy * r;
      candidates.push({ x: 2 * ax - midX, y: 2 * ay - midY });
    }

    for (const c of candidates) {
      if (testCurve(c)) {
        bestCtrl = c;
        break;
      }
    }

    // Systematic search if needed
    if (!bestCtrl) {
      gridSearch: for (let cx = 60; cx <= 580; cx += 15) {
        for (let cy = 50; cy <= 390; cy += 15) {
          const c: Point = { x: cx, y: cy };
          if (testCurve(c)) {
            bestCtrl = c;
            break gridSearch;
          }
        }
      }
    }

    if (!bestCtrl) {
      bestCtrl = { x: midX + nX * 30, y: midY + nY * 30 };
    }

    const pathD = `M ${Math.round(sPos.x)} ${Math.round(sPos.y)} Q ${Math.round(bestCtrl.x)} ${Math.round(bestCtrl.y)} ${Math.round(tPos.x)} ${Math.round(tPos.y)}`;

    let chipPos: Point | undefined = undefined;
    let chipBox: RectBox | undefined = undefined;

    if (edge.count !== undefined) {
      const candidateTs: number[] = [];
      for (let offset = 0; offset <= 0.15; offset += 0.01) {
        candidateTs.push(Number((0.50 + offset).toFixed(3)));
        if (offset > 0) candidateTs.push(Number((0.50 - offset).toFixed(3)));
      }
      for (const t of candidateTs) {
        const px = Math.round((1 - t) ** 2 * sPos.x + 2 * (1 - t) * t * bestCtrl.x + t ** 2 * tPos.x);
        const py = Math.round((1 - t) ** 2 * sPos.y + 2 * (1 - t) * t * bestCtrl.y + t ** 2 * tPos.y);
        const candidateBox: RectBox = { x: px - 9, y: py - 9, width: 18, height: 18 };

        const hitsLabel = allLabelBoxes.some((lBox) => boxesIntersect(candidateBox, lBox));
        const hitsChip = occupiedChipBoxes.some((cBox) => boxesIntersect(candidateBox, cBox));

        if (!hitsLabel && !hitsChip) {
          chipPos = { x: px, y: py };
          chipBox = candidateBox;
          occupiedChipBoxes.push(candidateBox);
          break;
        }
      }
      if (!chipPos) {
        const t = 0.5;
        const px = Math.round((1 - t) ** 2 * sPos.x + 2 * (1 - t) * t * bestCtrl.x + t ** 2 * tPos.x);
        const py = Math.round((1 - t) ** 2 * sPos.y + 2 * (1 - t) * t * bestCtrl.y + t ** 2 * tPos.y);
        chipPos = { x: px, y: py };
        chipBox = { x: px - 9, y: py - 9, width: 18, height: 18 };
        occupiedChipBoxes.push(chipBox);
      }
    }

    edges.push({
      id: edge.id,
      sourceId: edge.source_id,
      targetId: edge.target_id,
      pathD,
      controlPoint: bestCtrl,
      status: edge.status,
      count: edge.count,
      chipPos,
      chipBox,
      isUnresolved: edge.status === 'unresolved',
    });
  }

  return {
    svgWidth,
    svgHeight,
    centerX,
    centerY,
    orbitRadius: 150,
    projectNode,
    moduleNodes,
    edges,
    hiddenEdgesCount,
    overflowModulesCount,
    mostAffectedModuleId,
  };
}
