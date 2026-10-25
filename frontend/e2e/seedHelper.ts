import fs from 'node:fs';
import path from 'node:path';

export interface SeedData {
  scannedProjectId: string;
  unscannedProjectId: string;
  feesModuleNodeId: string;
  brokenImportFindingId: string;
  circularDependencyFindingId: string;
  isolatedFileFindingId: string;
  envUndeclaredFindingId: string;
  proposedFixId: string;
  approvedFixId: string;
  reportId: string;
}

export async function seedQaBackend(backendUrl = 'http://localhost:4100'): Promise<SeedData> {
  const rootDir = 'C:\\RippleAI';
  const zipPath = path.join(rootDir, 'samples', 'demo-erp-sample.zip');
  if (!fs.existsSync(zipPath)) {
    throw new Error(`Sample zip not found at: ${zipPath}`);
  }

  const zipBuffer = fs.readFileSync(zipPath);

  // 1. Upload scanned project
  console.log('[seed] Uploading demo-erp-sample for scanning...');
  const form1 = new FormData();
  form1.append('name', 'demo-erp-sample');
  form1.append('file', new Blob([zipBuffer], { type: 'application/zip' }), 'demo-erp-sample.zip');

  const uploadRes1 = await fetch(`${backendUrl}/api/projects`, {
    method: 'POST',
    body: form1,
  });
  if (!uploadRes1.ok) {
    throw new Error(`Failed to upload project 1: ${uploadRes1.status} ${await uploadRes1.text()}`);
  }
  const project1Data = (await uploadRes1.json()).data;
  const scannedProjectId = project1Data.id;
  console.log(`[seed] Uploaded scanned project: ${scannedProjectId}`);

  // 2. Scan project 1
  console.log(`[seed] Triggering scan for project ${scannedProjectId}...`);
  const scanRes = await fetch(`${backendUrl}/api/projects/${scannedProjectId}/scan`, {
    method: 'POST',
  });
  if (!scanRes.ok) {
    throw new Error(`Failed to scan project 1: ${scanRes.status} ${await scanRes.text()}`);
  }
  const scanResult = await scanRes.json();
  console.log(`[seed] Scan complete:`, scanResult.data?.status || 'done');

  // 3. Upload second project (do NOT scan it)
  console.log('[seed] Uploading second copy (unscanned)...');
  const form2 = new FormData();
  form2.append('name', 'demo-erp-unscanned');
  form2.append('file', new Blob([zipBuffer], { type: 'application/zip' }), 'demo-erp-unscanned.zip');

  const uploadRes2 = await fetch(`${backendUrl}/api/projects`, {
    method: 'POST',
    body: form2,
  });
  if (!uploadRes2.ok) {
    throw new Error(`Failed to upload project 2: ${uploadRes2.status} ${await uploadRes2.text()}`);
  }
  const project2Data = (await uploadRes2.json()).data;
  const unscannedProjectId = project2Data.id;
  console.log(`[seed] Uploaded unscanned project: ${unscannedProjectId}`);

  // 4. Find findings for project 1
  const findingsRes = await fetch(`${backendUrl}/api/projects/${scannedProjectId}/findings?pageSize=100`);
  if (!findingsRes.ok) {
    throw new Error(`Failed to fetch findings: ${findingsRes.status}`);
  }
  const findingsJson = await findingsRes.json();
  const findings: Array<{ id: string; rule_id: string; title: string }> =
    findingsJson.data?.items || (Array.isArray(findingsJson.data) ? findingsJson.data : []);

  const envFinding = findings.find((f) => f.rule_id === 'env_undeclared');
  if (!envFinding) {
    throw new Error(`No env_undeclared finding found in scanned project findings`);
  }
  const envUndeclaredFindingId = envFinding.id;

  const brokenImportFinding = findings.find((f) => f.rule_id === 'broken_import');
  if (!brokenImportFinding) {
    throw new Error(`No broken_import finding found in scanned project findings`);
  }
  const brokenImportFindingId = brokenImportFinding.id;

  const circularFinding = findings.find((f) => f.rule_id === 'circular_dependency');
  if (!circularFinding) {
    throw new Error(`No circular_dependency finding found in scanned project findings`);
  }
  const circularDependencyFindingId = circularFinding.id;

  const isolatedFinding = findings.find((f) => f.rule_id === 'isolated_file');
  if (!isolatedFinding) {
    throw new Error(`No isolated_file finding found in scanned project findings`);
  }
  const isolatedFileFindingId = isolatedFinding.id;

  console.log(`[seed] Found env_undeclared finding: ${envUndeclaredFindingId}`);
  console.log(`[seed] Found broken_import finding: ${brokenImportFindingId}`);
  console.log(`[seed] Found circular_dependency finding: ${circularDependencyFindingId}`);
  console.log(`[seed] Found isolated_file finding: ${isolatedFileFindingId}`);

  // 5. Create fix for env_undeclared and leave it proposed
  console.log(`[seed] Creating fix for env_undeclared (leaving proposed)...`);
  const fixRes1 = await fetch(`${backendUrl}/api/findings/${envUndeclaredFindingId}/fixes`, {
    method: 'POST',
  });
  if (!fixRes1.ok) {
    throw new Error(`Failed to create fix for env finding: ${fixRes1.status} ${await fixRes1.text()}`);
  }
  const fixData1 = (await fixRes1.json()).data;
  const proposedFixId = fixData1.id;
  console.log(`[seed] Created proposed fix: ${proposedFixId}`);

  // 6. Create second fix and approve it
  let approvedFixId: string | null = null;
  for (const candidate of findings) {
    if (candidate.id === envUndeclaredFindingId) continue;
    try {
      const fixRes = await fetch(`${backendUrl}/api/findings/${candidate.id}/fixes`, {
        method: 'POST',
      });
      if (!fixRes.ok) continue;
      const fixData = (await fixRes.json()).data;
      if (!fixData?.id) continue;

      const secondFixId = fixData.id;
      console.log(`[seed] Created second fix ${secondFixId} for finding ${candidate.id} (${candidate.rule_id})`);

      const approveRes = await fetch(`${backendUrl}/api/fixes/${secondFixId}/approve`, {
        method: 'POST',
      });
      if (approveRes.ok) {
        approvedFixId = (await approveRes.json()).data.id;
        console.log(`[seed] Approved second fix: ${approvedFixId}`);
        break;
      }
    } catch {}
  }

  if (!approvedFixId) {
    throw new Error('Failed to find an eligible finding to create and approve second fix');
  }

  // 7. Generate a report for scanned project
  console.log(`[seed] Generating report for project ${scannedProjectId}...`);
  const reportRes = await fetch(`${backendUrl}/api/projects/${scannedProjectId}/reports`, {
    method: 'POST',
  });
  if (!reportRes.ok) {
    throw new Error(`Failed to generate report: ${reportRes.status} ${await reportRes.text()}`);
  }
  const reportData = (await reportRes.json()).data;
  const reportId = reportData.id;
  console.log(`[seed] Generated report: ${reportId}`);

  // 8. Find fees module node ID in level 1 graph
  console.log(`[seed] Fetching level 1 graph to identify fees module node ID...`);
  const graphRes = await fetch(`${backendUrl}/api/projects/${scannedProjectId}/graph?level=1`);
  if (!graphRes.ok) {
    throw new Error(`Failed to fetch level 1 graph: ${graphRes.status}`);
  }
  const graphJson = await graphRes.json();
  const nodes: Array<{ id: string; label: string; path: string }> = graphJson.data?.nodes || [];
  const feesNode = nodes.find((n) => n.label === 'fees' || n.path?.includes('fees'));
  if (!feesNode) {
    throw new Error(`Could not find fees module node in graph level 1`);
  }
  const feesModuleNodeId = feesNode.id;
  console.log(`[seed] Found fees module node ID: ${feesModuleNodeId}`);

  const seedResult: SeedData = {
    scannedProjectId,
    unscannedProjectId,
    feesModuleNodeId,
    brokenImportFindingId,
    circularDependencyFindingId,
    isolatedFileFindingId,
    envUndeclaredFindingId,
    proposedFixId,
    approvedFixId,
    reportId,
  };

  return seedResult;
}
