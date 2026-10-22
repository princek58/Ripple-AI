import crypto from 'node:crypto';
import path from 'node:path';
import type { ScannedFile } from '../scanner/types.js';
import { parseFile } from '../parser/parser.js';
import { resolveImport } from '../parser/resolver.js';
import type { ParsedFileResult } from '../parser/types.js';
import type { GraphNode, GraphEdge, BuildGraphResult } from './types.js';

export interface BuildGraphOptions {
  projectId: string;
  scanId: string;
  projectName?: string;
}

/**
 * Builds the static analysis dependency graph for a project.
 * Adheres strictly to the master spec and agent rules:
 * - Evidence-first, deterministic
 * - No fake or hallucinated nodes
 * - Level 1 project & modules, Level 3 files, APIs, and config nodes
 * - Clean edges: imports, calls, serves, reads, tests
 */
export function buildGraph(
  files: ScannedFile[],
  options: BuildGraphOptions
): BuildGraphResult {
  const { projectId, scanId, projectName = 'project' } = options;

  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const syntaxErrors: string[] = [];

  // Map of project files for quick lookup
  const filesSet = new Set(files.map((f) => f.path));
  const fileNodesByPath = new Map<string, GraphNode>();

  // 1. Project Node (Level 1)
  const projectNodeId = crypto.randomUUID();
  const projectNode: GraphNode = {
    id: projectNodeId,
    project_id: projectId,
    scan_id: scanId,
    type: 'project',
    level: 1,
    parent_id: null,
    label: projectName,
    path: '/',
  };
  nodes.push(projectNode);

  // 2. Module Nodes (Level 1)
  // Extract all unique modules from scanned files
  const moduleNames = Array.from(new Set(files.map((f) => f.module))).sort();
  // Ensure 'shared' module is present if not already
  if (!moduleNames.includes('shared')) {
    moduleNames.push('shared');
  }

  const moduleNodesByName = new Map<string, GraphNode>();
  for (const modName of moduleNames) {
    const modNodeId = crypto.randomUUID();
    const modNode: GraphNode = {
      id: modNodeId,
      project_id: projectId,
      scan_id: scanId,
      type: 'module',
      level: 1,
      parent_id: projectNodeId,
      label: modName,
      path: `module:${modName}`,
    };
    nodes.push(modNode);
    moduleNodesByName.set(modName, modNode);
  }

  // 3. Parse all files and create Level 3 File Nodes
  const parsedFilesByPath = new Map<string, ParsedFileResult>();

  for (const file of files) {
    const parsed = parseFile(file);
    parsedFilesByPath.set(file.path, parsed);

    if (parsed.syntaxError) {
      syntaxErrors.push(`${file.path}: ${parsed.syntaxError}`);
    }

    const parentModule =
      moduleNodesByName.get(file.module) ??
      moduleNodesByName.get('shared') ??
      projectNode;

    const fileNodeId = crypto.randomUUID();
    const fileNode: GraphNode = {
      id: fileNodeId,
      project_id: projectId,
      scan_id: scanId,
      type: file.type,
      level: 3,
      parent_id: parentModule.id,
      label: path.posix.basename(file.path),
      path: file.path,
      language: file.language,
      meta_json: JSON.stringify({
        size: file.size,
        functions: parsed.functions,
        packages: parsed.packages,
      }),
    };

    nodes.push(fileNode);
    fileNodesByPath.set(file.path, fileNode);
  }

  // 4. Resolve Route Mounts across backend files
  // e.g. server.js has app.use('/api/notices', noticesRouter)
  // Map identifier -> prefix, then find where that identifier was imported from
  const routePrefixByFilePath = new Map<string, string>();

  for (const file of files) {
    const parsed = parsedFilesByPath.get(file.path);
    if (!parsed || parsed.mounts.length === 0) continue;

    for (const mount of parsed.mounts) {
      if (!mount.routerIdentifier) continue;

      // Find import in this file matching the router identifier
      // e.g. const noticesRouter = require('./routes/notices')
      for (const imp of parsed.imports) {
        if (!imp.specifier) continue;
        const resolved = resolveImport(file.path, imp.specifier, filesSet);
        if (resolved.isResolved && resolved.targetPath) {
          // Check if router identifier name matches the import stem
          const stem = path.posix.basename(imp.specifier).replace(/\.[a-z0-9]+$/i, '');
          const identLower = mount.routerIdentifier.toLowerCase();
          if (identLower.includes(stem.toLowerCase())) {
            routePrefixByFilePath.set(resolved.targetPath, mount.prefix);
          }
        }
      }
    }
  }

  // 5. Create Level 3 API Nodes and 'serves' edges from route files
  const apiNodes: GraphNode[] = [];

  for (const file of files) {
    const parsed = parsedFilesByPath.get(file.path);
    if (!parsed || parsed.routes.length === 0) continue;

    const fileNode = fileNodesByPath.get(file.path)!;
    const mountPrefix = routePrefixByFilePath.get(file.path) || '';

    for (const route of parsed.routes) {
      // Normalize full path: mountPrefix + route.path
      let fullPath = mountPrefix;
      if (route.path === '/' || route.path === '') {
        fullPath = mountPrefix || '/';
      } else {
        const cleanedSub = route.path.startsWith('/') ? route.path : `/${route.path}`;
        fullPath = mountPrefix ? `${mountPrefix}${cleanedSub}` : cleanedSub;
      }

      // Avoid creating duplicate API nodes for the same method + fullPath in the same file
      const label = `${route.method} ${fullPath}`;
      const existing = apiNodes.find(
        (n) => n.label === label && n.path === fullPath
      );

      let apiNodeId = existing?.id;
      if (!existing) {
        apiNodeId = crypto.randomUUID();
        const apiNode: GraphNode = {
          id: apiNodeId,
          project_id: projectId,
          scan_id: scanId,
          type: 'api',
          level: 3,
          parent_id: fileNode.parent_id,
          label,
          path: fullPath,
          line_start: route.line,
          line_end: route.line,
          language: file.language,
          meta_json: JSON.stringify({
            method: route.method,
            path: fullPath,
          }),
        };
        nodes.push(apiNode);
        apiNodes.push(apiNode);
      }

      // 'serves' edge from route file to api node
      edges.push({
        id: crypto.randomUUID(),
        project_id: projectId,
        scan_id: scanId,
        source_id: fileNode.id,
        target_id: apiNodeId!,
        relation: 'serves',
        status: 'resolved',
        confidence: 'confirmed',
        evidence_json: JSON.stringify({
          file: file.path,
          line_start: route.line,
          line_end: route.line,
        }),
      });
    }
  }

  // 6. Create Level 3 Config Nodes for environment variables and 'reads' edges
  const configNodesByName = new Map<string, GraphNode>();
  const sharedModuleId =
    moduleNodesByName.get('shared')?.id ?? projectNodeId;

  for (const file of files) {
    const parsed = parsedFilesByPath.get(file.path);
    if (!parsed || parsed.envVars.length === 0) continue;

    const fileNode = fileNodesByPath.get(file.path)!;
    // Track unique env vars per file to avoid redundant duplicate edges
    const seenEnvPerFile = new Set<string>();

    for (const ev of parsed.envVars) {
      if (seenEnvPerFile.has(ev.name)) continue;
      seenEnvPerFile.add(ev.name);

      let configNode = configNodesByName.get(ev.name);
      if (!configNode) {
        configNode = {
          id: crypto.randomUUID(),
          project_id: projectId,
          scan_id: scanId,
          type: 'config',
          level: 3,
          parent_id: sharedModuleId,
          label: `env:${ev.name}`,
          path: ev.name,
          language: 'Environment',
          meta_json: JSON.stringify({ envName: ev.name }),
        };
        nodes.push(configNode);
        configNodesByName.set(ev.name, configNode);
      }

      // 'reads' edge from file to config node
      edges.push({
        id: crypto.randomUUID(),
        project_id: projectId,
        scan_id: scanId,
        source_id: fileNode.id,
        target_id: configNode.id,
        relation: 'reads',
        status: 'resolved',
        confidence: 'confirmed',
        evidence_json: JSON.stringify({
          file: file.path,
          line_start: ev.line,
          line_end: ev.line,
          envVar: ev.name,
        }),
      });
    }
  }

  // 7. Create Import & Test Edges
  for (const file of files) {
    const parsed = parsedFilesByPath.get(file.path);
    if (!parsed || parsed.imports.length === 0) continue;

    const fileNode = fileNodesByPath.get(file.path)!;

    for (const imp of parsed.imports) {
      if (imp.isExternal) {
        // Bare package import: recorded in file node metadata, no node created
        continue;
      }

      if (imp.isUnresolved || !imp.specifier) {
        // Dynamic import with variable argument: unresolved edge
        edges.push({
          id: crypto.randomUUID(),
          project_id: projectId,
          scan_id: scanId,
          source_id: fileNode.id,
          target_id: fileNode.id,
          relation: 'imports',
          status: 'unresolved',
          confidence: 'hypothesis',
          evidence_json: JSON.stringify({
            file: file.path,
            line_start: imp.line,
            line_end: imp.line,
            type: 'dynamic_import_unresolved',
          }),
        });
        continue;
      }

      // Resolve relative import against project files
      const resolved = resolveImport(file.path, imp.specifier, filesSet);

      if (resolved.isResolved && resolved.targetPath) {
        const targetNode = fileNodesByPath.get(resolved.targetPath);
        if (targetNode) {
          const relation = file.type === 'test' ? 'tests' : 'imports';
          edges.push({
            id: crypto.randomUUID(),
            project_id: projectId,
            scan_id: scanId,
            source_id: fileNode.id,
            target_id: targetNode.id,
            relation,
            status: 'resolved',
            confidence: 'confirmed',
            evidence_json: JSON.stringify({
              file: file.path,
              line_start: imp.line,
              line_end: imp.line,
              specifier: imp.specifier,
            }),
          });
        }
      } else {
        // Broken import or escapes project root: unresolved edge
        edges.push({
          id: crypto.randomUUID(),
          project_id: projectId,
          scan_id: scanId,
          source_id: fileNode.id,
          target_id: fileNode.id,
          relation: 'imports',
          status: 'unresolved',
          confidence: 'confirmed',
          evidence_json: JSON.stringify({
            file: file.path,
            line_start: imp.line,
            line_end: imp.line,
            specifier: imp.specifier,
            reason: resolved.reason || 'FILE_NOT_FOUND',
          }),
        });
      }
    }
  }

  // 8. Create API Call Edges ('calls')
  for (const file of files) {
    const parsed = parsedFilesByPath.get(file.path);
    if (!parsed || parsed.apiCalls.length === 0) continue;

    const fileNode = fileNodesByPath.get(file.path)!;

    for (const apiCall of parsed.apiCalls) {
      if (apiCall.isRuntimeBuilt) {
        // Runtime-built URL (e.g. baseUrl + id): unresolved edge
        edges.push({
          id: crypto.randomUUID(),
          project_id: projectId,
          scan_id: scanId,
          source_id: fileNode.id,
          target_id: fileNode.id,
          relation: 'calls',
          status: 'unresolved',
          confidence: 'hypothesis',
          evidence_json: JSON.stringify({
            file: file.path,
            line_start: apiCall.line,
            line_end: apiCall.line,
            type: 'runtime_url_unresolved',
          }),
        });
        continue;
      }

      if (!apiCall.url) continue;

      // Normalize url
      const callUrl = apiCall.url.trim().replace(/\/+$/, '') || '/';

      // 1. Exact match against API nodes
      const exactMatch = apiNodes.find((api) => {
        const normApiPath = api.path.trim().replace(/\/+$/, '') || '/';
        return normApiPath === callUrl;
      });

      if (exactMatch) {
        edges.push({
          id: crypto.randomUUID(),
          project_id: projectId,
          scan_id: scanId,
          source_id: fileNode.id,
          target_id: exactMatch.id,
          relation: 'calls',
          status: 'resolved',
          confidence: 'confirmed',
          evidence_json: JSON.stringify({
            file: file.path,
            line_start: apiCall.line,
            line_end: apiCall.line,
            url: apiCall.url,
            method: apiCall.method,
          }),
        });
        continue;
      }

      // 2. Parametric match (e.g. route /api/notices/:id matching /api/notices/123)
      const paramMatch = apiNodes.find((api) => {
        if (!api.path.includes(':')) return false;
        const regexStr = '^' + api.path.replace(/:[a-zA-Z0-9_]+/g, '[^/]+') + '$';
        const regex = new RegExp(regexStr);
        return regex.test(callUrl);
      });

      if (paramMatch) {
        edges.push({
          id: crypto.randomUUID(),
          project_id: projectId,
          scan_id: scanId,
          source_id: fileNode.id,
          target_id: paramMatch.id,
          relation: 'calls',
          status: 'possible',
          confidence: 'likely',
          evidence_json: JSON.stringify({
            file: file.path,
            line_start: apiCall.line,
            line_end: apiCall.line,
            url: apiCall.url,
            method: apiCall.method,
          }),
        });
        continue;
      }

      // Non-matching calls (e.g. /api/notice/list): creates no resolved link
    }
  }

  // 9. Summary Counts
  const unresolvedCount = edges.filter((e) => e.status === 'unresolved').length;
  let notes = `Analyzed ${files.length} files: ${nodes.length} nodes, ${edges.length} edges (${unresolvedCount} unresolved).`;
  if (syntaxErrors.length > 0) {
    notes += ` Syntax errors in: ${syntaxErrors.map((s) => s.split(':')[0]).join(', ')}.`;
  }

  return {
    nodes,
    edges,
    filesTotal: files.length,
    filesSkipped: 0,
    unresolvedCount,
    notes,
  };
}
