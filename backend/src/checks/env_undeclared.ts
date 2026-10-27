import crypto from 'node:crypto';
import type { CheckContext, CheckFinding } from './types.js';

export const STANDARD_ENV_EXEMPTIONS = ['NODE_ENV', 'CI'];

export function isExemptEnvVariable(name: string): boolean {
  if (STANDARD_ENV_EXEMPTIONS.includes(name)) {
    return true;
  }
  if (name.startsWith('npm_')) {
    return true;
  }
  return false;
}

/**
 * Checks for environment variables used in source code that are missing from .env.example.
 * Never stores or references secret values. Names only.
 * Exempts standard Node/npm runtime variables (NODE_ENV, CI, npm_*).
 */
export function checkEnvUndeclared(context: CheckContext): CheckFinding[] {
  const { projectId, scanId, nodes, edges, files } = context;

  // 1. Find all declared env keys from .env.example / .env
  const declaredFiles = files.filter(
    (f) =>
      f.path.endsWith('.env.example') ||
      f.path.endsWith('.env') ||
      f.path.includes('.env.')
  );

  const declaredKeys = new Set<string>();
  for (const df of declaredFiles) {
    if (df.content) {
      const lines = df.content.split(/\r?\n/);
      for (const line of lines) {
        const match = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*)=/);
        if (match) {
          declaredKeys.add(match[1]);
        }
      }
    }
  }

  // 2. Find all config nodes representing environment variables (label: "env:NAME"),
  // excluding standard Node/npm runtime variables (NODE_ENV, CI, npm_*)
  const envConfigNodes = nodes.filter(
    (n) =>
      n.type === 'config' &&
      n.label.startsWith('env:') &&
      !isExemptEnvVariable(n.path)
  );

  if (envConfigNodes.length === 0) {
    return [];
  }

  // Map config node ID -> incoming 'reads' edges for file/line evidence
  const readsEdgesByConfigId = new Map<string, typeof edges>();
  for (const edge of edges) {
    if (edge.relation === 'reads') {
      const list = readsEdgesByConfigId.get(edge.target_id) || [];
      list.push(edge);
      readsEdgesByConfigId.set(edge.target_id, list);
    }
  }

  const findings: CheckFinding[] = [];

  // Case A: No env declaration file exists at all in the project
  if (declaredFiles.length === 0) {
    const envNames = envConfigNodes.map((n) => n.path);
    const allEvidence: Array<{ file: string; line_start: number; line_end: number }> = [];

    for (const node of envConfigNodes) {
      const incident = readsEdgesByConfigId.get(node.id) || [];
      for (const e of incident) {
        if (e.evidence_json) {
          try {
            const ev = JSON.parse(e.evidence_json);
            allEvidence.push({
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
      rule_id: 'env_undeclared',
      title: `${envNames.length} environment variables used without .env.example`,
      summary: `The project reads ${envNames.length} environment variables (${envNames.join(', ')}), but no .env.example template was found.`,
      severity: 'medium',
      confidence: 'hypothesis',
      verification: 'not_tested',
      evidence_json: JSON.stringify(allEvidence.slice(0, 10)),
      node_ids_json: JSON.stringify(envConfigNodes.map((n) => n.id)),
      likely_cause: 'Missing .env.example file to document required environment configurations for developers and deployment.',
      not_confirmed: 'Environment variables may be injected by the runtime environment or container host.',
      created_at: new Date().toISOString(),
    });

    return findings;
  }

  // Case B: Env declaration file exists -> Check each used env variable individually
  for (const node of envConfigNodes) {
    const envName = node.path;
    if (declaredKeys.has(envName)) {
      continue;
    }

    // This env variable is undeclared!
    const incidentEdges = readsEdgesByConfigId.get(node.id) || [];
    const evidenceList: Array<{ file: string; line_start: number; line_end: number }> = [];

    for (const e of incidentEdges) {
      if (e.evidence_json) {
        try {
          const ev = JSON.parse(e.evidence_json);
          evidenceList.push({
            file: ev.file || '',
            line_start: ev.line_start || 1,
            line_end: ev.line_end || ev.line_start || 1,
          });
        } catch {}
      }
    }

    findings.push({
      id: crypto.randomUUID(),
      project_id: projectId,
      scan_id: scanId,
      rule_id: 'env_undeclared',
      title: `Undeclared environment variable "${envName}"`,
      summary: `Environment variable "${envName}" is accessed in code but is not declared in .env.example.`,
      severity: 'medium',
      confidence: 'likely',
      verification: 'not_tested',
      evidence_json: JSON.stringify(evidenceList),
      node_ids_json: JSON.stringify([node.id]),
      likely_cause: 'A new feature added process.env access but .env.example was not updated.',
      not_confirmed: 'It may be set in the deployment environment or injected by CI/CD secrets.',
      created_at: new Date().toISOString(),
    });
  }

  return findings;
}
