import crypto from 'node:crypto';
import type { CheckContext, CheckFinding } from './types.js';

export const PRIVATE_KEY_PATTERN = /-----BEGIN [A-Z ]*PRIVATE KEY-----/;
export const CLOUD_KEY_PATTERN = /(?:AKIA|ABIA|ACCA|ASIA)[0-9A-Z]{16}/;
export const TOKEN_ASSIGNMENT_PATTERN = /(?:password|secret|token|api_key|apikey)\s*[:=]\s*['"][a-zA-Z0-9_\-\.]{16,}['"]/i;

const PLACEHOLDER_PATTERN = /(?:example|changeme|your_|your-|placeholder|dummy|xxx|<.*>|TODO)/i;

/**
 * Checks for hardcoded secrets, private keys, or cloud access keys in source files.
 * SAFETY: NEVER stores or logs the actual secret value. Only file, line numbers, and pattern name.
 */
export function checkSecretPattern(context: CheckContext): CheckFinding[] {
  const { projectId, scanId, nodes, files } = context;

  const nodeMapByPath = new Map(nodes.map((n) => [n.path, n]));
  const findings: CheckFinding[] = [];

  for (const file of files) {
    // Skip .env files (already sanitized) and sensitive files
    if (file.sensitive || file.path.includes('.env')) {
      continue;
    }

    if (!file.content) {
      continue;
    }

    const lines = file.content.split(/\r?\n/);
    const node = nodeMapByPath.get(file.path);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      let patternName: string | null = null;
      if (PRIVATE_KEY_PATTERN.test(line)) {
        patternName = 'private_key_header';
      } else if (CLOUD_KEY_PATTERN.test(line)) {
        patternName = 'cloud_access_key';
      } else if (TOKEN_ASSIGNMENT_PATTERN.test(line)) {
        patternName = 'token_assignment';
      }

      if (patternName) {
        const isPlaceholder = PLACEHOLDER_PATTERN.test(line);

        const severity = isPlaceholder ? 'low' : 'high';
        const confidence = isPlaceholder ? 'hypothesis' : 'likely';
        const summary = isPlaceholder
          ? `Possible placeholder or test credential (${patternName}) detected at line ${lineNum}.`
          : `Suspected hardcoded credential (${patternName}) detected in source code at line ${lineNum}.`;

        findings.push({
          id: crypto.randomUUID(),
          project_id: projectId,
          scan_id: scanId,
          rule_id: 'secret_pattern',
          title: `Potential ${patternName.replace(/_/g, ' ')} in ${file.path}`,
          summary,
          severity,
          confidence,
          verification: 'not_tested',
          evidence_json: JSON.stringify([
            {
              file: file.path,
              line_start: lineNum,
              line_end: lineNum,
              pattern: patternName,
            },
          ]),
          node_ids_json: JSON.stringify(node ? [node.id] : []),
          likely_cause: 'Credential or secret token committed directly into version-controlled source code.',
          not_confirmed: 'Whether this credential is active, expired, revoked, or an internal test dummy.',
          created_at: new Date().toISOString(),
        });
      }
    }
  }

  return findings;
}
