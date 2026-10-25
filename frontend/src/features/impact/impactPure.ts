import type {
  ImpactResult,
  ImpactAffectedNode,
  NodeType,
  ImpactCertainty,
  ImpactVia,
} from '../../../../shared/types.js';

export interface ImpactRound {
  round: number;
  label: string;
  items: ImpactAffectedNode[];
}

/**
 * Groups affected items by distance into rounds.
 * Round 1 = depends directly on the start item,
 * Round 2 = depends on round 1,
 * and so on.
 * Items remain in the backend's deterministic order.
 */
export function impactRounds(result: ImpactResult): ImpactRound[] {
  if (!result || !result.affected || result.affected.length === 0) {
    return [];
  }

  const roundsMap = new Map<number, ImpactAffectedNode[]>();
  for (const item of result.affected) {
    const list = roundsMap.get(item.distance) || [];
    list.push(item);
    roundsMap.set(item.distance, list);
  }

  const sortedDistances = Array.from(roundsMap.keys()).sort((a, b) => a - b);

  return sortedDistances.map((d) => {
    let label = `Round ${d}: depends directly on it`;
    if (d === 2) {
      label = 'Round 2: depends on round 1';
    } else if (d > 2) {
      label = `Round ${d}: depends on round ${d - 1}`;
    }
    return {
      round: d,
      label,
      items: roundsMap.get(d)!,
    };
  });
}

/**
 * Returns 2 to 5 plain English sentences summarizing the change impact:
 * - Counts of files, API endpoints, config items, tests, and modules
 * - How many are only "possible"
 * - The unresolved_nearby warning
 * - The truncated notice
 * - For zero results: exactly "No other file depends on this item."
 */
export function impactSentences(result: ImpactResult): string[] {
  if (!result) {
    return ['No impact analysis available.'];
  }

  const sentences: string[] = [];

  if (result.affected.length === 0) {
    sentences.push('No other file depends on this item.');
    if (result.unresolved_nearby > 0) {
      sentences.push(
        `${result.unresolved_nearby} dynamic or unresolved references touch this area, so the real impact may be larger.`
      );
    } else {
      sentences.push('No incoming imports, calls, or configuration references were detected.');
    }
    return sentences;
  }

  const c = result.counts;
  const fileStr = `${c.files} ${c.files === 1 ? 'file' : 'files'}`;
  const apiStr = `${c.api_endpoints} API ${c.api_endpoints === 1 ? 'endpoint' : 'endpoints'}`;
  const configStr = `${c.config} config ${c.config === 1 ? 'item' : 'items'}`;
  const testStr = `${c.tests} ${c.tests === 1 ? 'test' : 'tests'}`;
  const moduleStr = `${c.modules} ${c.modules === 1 ? 'module' : 'modules'}`;

  sentences.push(
    `Up to ${fileStr}, ${apiStr}, ${configStr}, and ${testStr} across ${moduleStr} may be affected.`
  );

  const possibleCount = result.affected.filter((a) => a.certainty === 'possible').length;
  if (possibleCount > 0) {
    sentences.push(
      `${possibleCount} ${possibleCount === 1 ? 'item is' : 'items are'} only a possible dependency reached through dynamic or unresolved references.`
    );
  } else {
    sentences.push(
      `All ${result.affected.length} affected items have proven static dependency paths from the start item.`
    );
  }

  if (result.unresolved_nearby > 0) {
    sentences.push(
      `${result.unresolved_nearby} dynamic or unresolved references touch this area, so the real impact may be larger.`
    );
  }

  if (result.truncated) {
    sentences.push(
      'Results were truncated because the impact traversal reached the maximum display limit; additional dependents may exist.'
    );
  }

  return sentences;
}

export interface RippleLayoutOptions {
  maxPerRing?: number; // default 14
  maxShown?: number;   // default 60
  size?: number;       // default 700 (viewBox size)
  nodeRadius?: number; // default 24
}

export interface RipplePositionedNode {
  id: string;
  label: string;
  type: NodeType;
  path: string;
  module: string | null;
  distance: number;
  certainty: ImpactCertainty;
  via: ImpactVia;
  x: number;
  y: number;
  radius: number;
}

export interface RippleRing {
  round: number;
  label: string;
  radius: number;
  nodes: RipplePositionedNode[];
  overflowCount: number;
  overflowText: string | null;
}

export interface RippleLayoutResult {
  width: number;
  height: number;
  center: { x: number; y: number };
  startNode: {
    id: string;
    label: string;
    type: NodeType;
    path: string;
    module: string | null;
    x: number;
    y: number;
    radius: number;
  };
  rings: RippleRing[];
  totalShown: number;
  totalAffected: number;
}

/**
 * Computes deterministic ripple layout positions:
 * - Start node in the centre
 * - One concentric ring per round (distance)
 * - Items spread evenly by angle in backend order
 * - Ring radius grows so node centres never overlap (distance > 2 * nodeRadius)
 * - Items beyond maxPerRing or maxShown are counted as "+N more in round r"
 */
export function rippleLayout(
  result: ImpactResult,
  options: RippleLayoutOptions = {}
): RippleLayoutResult {
  const maxPerRing = options.maxPerRing ?? 14;
  const maxShown = options.maxShown ?? 60;
  const nodeRadius = options.nodeRadius ?? 24;
  const baseSize = options.size ?? 700;

  const rounds = impactRounds(result);

  let currentRadius = 0;
  const minRadialGap = nodeRadius * 2.8; // radial distance between consecutive rings

  // First pass: compute radii for each ring so that chord distance > 2 * nodeRadius
  const ringRadii: number[] = [];
  for (let i = 0; i < rounds.length; i++) {
    const round = rounds[i];
    const drawnCount = Math.min(round.items.length, maxPerRing);

    let requiredRadiusForRing = 0;
    if (drawnCount > 1) {
      // chord = 2 * R * sin(pi / K) > 2 * nodeRadius => R > nodeRadius / sin(pi / K)
      const minChordDistance = nodeRadius * 2.3; // generous margin above 2 * nodeRadius
      requiredRadiusForRing = minChordDistance / (2 * Math.sin(Math.PI / drawnCount));
    }

    currentRadius = Math.max(currentRadius + minRadialGap, requiredRadiusForRing);
    ringRadii.push(currentRadius);
  }

  // Calculate needed viewBox size if outer ring is larger than baseSize
  const maxRadius = ringRadii.length > 0 ? ringRadii[ringRadii.length - 1] : 0;
  const neededDiameter = (maxRadius + nodeRadius * 2) * 2;
  const size = Math.max(baseSize, Math.ceil(neededDiameter));

  const cx = size / 2;
  const cy = size / 2;

  let totalShownCount = 0;
  const rings: RippleRing[] = [];

  for (let rIdx = 0; rIdx < rounds.length; rIdx++) {
    const round = rounds[rIdx];
    const radius = ringRadii[rIdx];
    const roundNodes: RipplePositionedNode[] = [];

    let drawnThisRound = 0;
    const remainingSlots = Math.max(0, maxShown - totalShownCount);
    const countToDraw = Math.min(round.items.length, maxPerRing, remainingSlots);

    for (let i = 0; i < countToDraw; i++) {
      const item = round.items[i];
      // Angle: starting at -pi / 2 (top) and evenly distributed
      const angle = -Math.PI / 2 + (2 * Math.PI * i) / countToDraw;
      const x = Math.round((cx + radius * Math.cos(angle)) * 100) / 100;
      const y = Math.round((cy + radius * Math.sin(angle)) * 100) / 100;

      roundNodes.push({
        id: item.id,
        label: item.label,
        type: item.type,
        path: item.path,
        module: item.module,
        distance: item.distance,
        certainty: item.certainty,
        via: item.via,
        x,
        y,
        radius: nodeRadius,
      });
      drawnThisRound++;
    }

    totalShownCount += drawnThisRound;
    const overflowCount = round.items.length - drawnThisRound;

    rings.push({
      round: round.round,
      label: round.label,
      radius: Math.round(radius * 100) / 100,
      nodes: roundNodes,
      overflowCount,
      overflowText: overflowCount > 0 ? `+${overflowCount} more in round ${round.round}` : null,
    });
  }

  const startNode = {
    id: result.start.id,
    label: result.start.label,
    type: result.start.type,
    path: result.start.path,
    module: result.start.module,
    x: cx,
    y: cy,
    radius: nodeRadius,
  };

  return {
    width: size,
    height: size,
    center: { x: cx, y: cy },
    startNode,
    rings,
    totalShown: totalShownCount,
    totalAffected: result.affected.length,
  };
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface ImpactUrlParams {
  impact: string | null;
  depth: number | null;
}

/**
 * Parses ?impact=<id>&depth=<n> from URLSearchParams or query string.
 * Bad or malformed values are dropped. Depth is clamped between 1 and 10.
 */
export function parseImpactUrl(search: URLSearchParams | string): ImpactUrlParams {
  const params = typeof search === 'string' ? new URLSearchParams(search) : search;
  const rawImpact = params.get('impact');
  const rawDepth = params.get('depth');

  let impact: string | null = null;
  if (rawImpact && UUID_REGEX.test(rawImpact)) {
    impact = rawImpact;
  }

  let depth: number | null = null;
  if (rawDepth !== null && rawDepth !== '') {
    const num = Number(rawDepth);
    if (Number.isInteger(num) && num >= 1 && num <= 10) {
      depth = num;
    }
  }

  return { impact, depth };
}

/**
 * Builds query string with updated impact parameters, preserving other params.
 */
export function buildImpactUrl(
  currentParams: URLSearchParams | string,
  updates: { impact?: string | null; depth?: number | null }
): string {
  const params = new URLSearchParams(typeof currentParams === 'string' ? currentParams : currentParams.toString());

  if (updates.impact !== undefined) {
    if (updates.impact && UUID_REGEX.test(updates.impact)) {
      params.set('impact', updates.impact);
    } else {
      params.delete('impact');
    }
  }

  if (updates.depth !== undefined) {
    if (updates.depth !== null && Number.isInteger(updates.depth) && updates.depth >= 1 && updates.depth <= 10) {
      params.set('depth', String(updates.depth));
    } else {
      params.delete('depth');
    }
  }

  const qs = params.toString();
  return qs ? `?${qs}` : '';
}
