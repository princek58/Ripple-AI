import crypto from 'node:crypto';
import type { CheckContext, CheckFinding } from './types.js';

function computeCommonPrefixLength(a: string, b: string): number {
  let len = 0;
  while (len < a.length && len < b.length && a[len] === b[len]) {
    len++;
  }
  return len;
}

/**
 * Checks for frontend API calls (fetch/axios) where no matching Express route exists.
 * Suggests the closest route path in likely_cause.
 */
export function checkApiUnmatchedCall(context: CheckContext): CheckFinding[] {
  const { projectId, scanId, nodes } = context;

  // Find all backend API nodes (Express routes)
  const apiNodes = nodes.filter((n) => n.type === 'api');

  const findings: CheckFinding[] = [];

  for (const node of nodes) {
    if (node.level !== 3 || !node.meta_json) continue;

    let meta: any;
    try {
      meta = JSON.parse(node.meta_json);
    } catch {
      continue;
    }

    if (!Array.isArray(meta.apiCalls) || meta.apiCalls.length === 0) {
      continue;
    }

    for (const call of meta.apiCalls) {
      // Skip matched calls
      if (call.matched) continue;

      // Skip runtime-built URLs (url is null or empty)
      if (!call.url || typeof call.url !== 'string') continue;

      // Skip absolute external URLs
      const trimmedUrl = call.url.trim();
      if (trimmedUrl.startsWith('http://') || trimmedUrl.startsWith('https://')) {
        continue;
      }

      const method = (call.method || 'GET').toUpperCase();
      const normUrl = trimmedUrl.replace(/\/+$/, '') || '/';

      // 1. Check if the path exists with a different HTTP method
      const samePathOtherMethod = apiNodes.find((api) => {
        const normApiPath = api.path.trim().replace(/\/+$/, '') || '/';
        return normApiPath === normUrl;
      });

      let likelyCause: string;
      if (samePathOtherMethod) {
        likelyCause = `Route path matches "${samePathOtherMethod.path}" but requires a different HTTP method. Closest route: ${samePathOtherMethod.label}`;
      } else if (apiNodes.length > 0) {
        // 2. Find closest route by longest common prefix / similarity
        let bestScore = -1;
        let closestRoute = apiNodes[0];

        for (const api of apiNodes) {
          const score = computeCommonPrefixLength(normUrl, api.path);
          if (score > bestScore) {
            bestScore = score;
            closestRoute = api;
          }
        }
        likelyCause = `Closest route: ${closestRoute.label}. Potential typo in endpoint path or missing backend route.`;
      } else {
        likelyCause = 'No backend API routes were detected in the project.';
      }

      findings.push({
        id: crypto.randomUUID(),
        project_id: projectId,
        scan_id: scanId,
        rule_id: 'api_unmatched_call',
        title: `Unmatched API call "${method} ${normUrl}" in ${node.label}`,
        summary: `Frontend calls "${method} ${normUrl}" at line ${call.line || 1}, but no matching Express backend route was found.`,
        severity: 'medium',
        confidence: 'likely',
        verification: 'not_tested',
        evidence_json: JSON.stringify([
          {
            file: node.path,
            line_start: call.line || 1,
            line_end: call.line || 1,
          },
        ]),
        node_ids_json: JSON.stringify([node.id]),
        likely_cause: likelyCause,
        not_confirmed: 'Dynamic mounting, a reverse proxy, an API gateway, or URL rewrite rules may handle this call at runtime.',
        created_at: new Date().toISOString(),
      });
    }
  }

  return findings;
}
