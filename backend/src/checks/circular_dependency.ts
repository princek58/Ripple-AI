import crypto from 'node:crypto';
import path from 'node:path';
import type { CheckContext, CheckFinding } from './types.js';

/**
 * Checks for circular import dependencies among resolved static import edges.
 * Uses Tarjan's strongly connected components (SCC) algorithm.
 * Exactly one finding per cycle.
 */
export function checkCircularDependency(context: CheckContext): CheckFinding[] {
  const { projectId, scanId, nodes, edges } = context;

  // Filter to resolved static import edges only
  const importEdges = edges.filter(
    (e) => e.relation === 'imports' && e.status === 'resolved'
  );

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  // Build adjacency list
  const adj = new Map<string, Array<{ targetId: string; edge: typeof edges[0] }>>();
  for (const edge of importEdges) {
    if (!adj.has(edge.source_id)) {
      adj.set(edge.source_id, []);
    }
    adj.get(edge.source_id)!.push({ targetId: edge.target_id, edge });
  }

  // Tarjan's SCC algorithm
  let index = 0;
  const indices = new Map<string, number>();
  const lowlinks = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const sccs: string[][] = [];

  function strongConnect(v: string) {
    indices.set(v, index);
    lowlinks.set(v, index);
    index++;
    stack.push(v);
    onStack.add(v);

    const neighbors = adj.get(v) || [];
    for (const { targetId } of neighbors) {
      if (!indices.has(targetId)) {
        strongConnect(targetId);
        lowlinks.set(v, Math.min(lowlinks.get(v)!, lowlinks.get(targetId)!));
      } else if (onStack.has(targetId)) {
        lowlinks.set(v, Math.min(lowlinks.get(v)!, indices.get(targetId)!));
      }
    }

    if (lowlinks.get(v) === indices.get(v)) {
      const scc: string[] = [];
      let w: string;
      do {
        w = stack.pop()!;
        onStack.delete(w);
        scc.push(w);
      } while (w !== v);

      // We only care about cycles: SCC of size > 1, or self-cycle
      if (scc.length > 1) {
        sccs.push(scc);
      } else if (scc.length === 1) {
        const selfEdge = neighbors.some((n) => n.targetId === v);
        if (selfEdge) {
          sccs.push(scc);
        }
      }
    }
  }

  for (const node of nodes) {
    if (node.level === 3 && !indices.has(node.id)) {
      strongConnect(node.id);
    }
  }

  const findings: CheckFinding[] = [];

  for (const scc of sccs) {
    const sccSet = new Set(scc);
    const sccNodes = scc.map((id) => nodeMap.get(id)).filter(Boolean) as typeof nodes;
    const sccLabels = sccNodes.map((n) => path.posix.basename(n.path || n.label));

    // Collect evidence from the import edges that connect nodes inside this SCC
    const evidenceList: Array<{ file: string; line_start: number; line_end: number }> = [];
    for (const edge of importEdges) {
      if (sccSet.has(edge.source_id) && sccSet.has(edge.target_id)) {
        if (edge.evidence_json) {
          try {
            const ev = JSON.parse(edge.evidence_json);
            evidenceList.push({
              file: ev.file || '',
              line_start: ev.line_start || 1,
              line_end: ev.line_end || ev.line_start || 1,
            });
          } catch {}
        }
      }
    }

    findings.push({
      id: crypto.randomUUID(),
      project_id: projectId,
      scan_id: scanId,
      rule_id: 'circular_dependency',
      title: `Circular dependency between ${sccLabels.join(' and ')}`,
      summary: `A circular import cycle was detected among: ${sccLabels.join(', ')}. Circular imports can cause undefined exports and order-of-execution bugs.`,
      severity: 'low',
      confidence: 'confirmed',
      verification: 'not_tested',
      evidence_json: JSON.stringify(evidenceList),
      node_ids_json: JSON.stringify(scc),
      likely_cause: 'Mutually dependent modules importing each other directly instead of extracting shared functionality.',
      not_confirmed: 'Whether this circular dependency causes a runtime failure or memory leak.',
      created_at: new Date().toISOString(),
    });
  }

  return findings;
}
