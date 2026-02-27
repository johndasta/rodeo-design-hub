import fs from 'node:fs/promises';
import path from 'node:path';
import { exists, makeId, readJson, writeJsonAtomic, listDirs } from './fsdb.js';

// Convention:
// Vault/Projects/<Project>/Creative Brief/<briefSlug?>/<vN>/...
// We'll treat each folder that contains `brief.json` as a brief root.

export async function findBriefRoots(vaultRoot) {
  const roots = [];

  // Primary: Agency HQ briefs live here.
  const agencyBriefsRoot = path.join(vaultRoot, 'Agency HQ', 'briefs');
  if (await exists(agencyBriefsRoot)) {
    for (const d of await listDirs(agencyBriefsRoot)) {
      if (await exists(path.join(d, 'brief.json'))) roots.push(d);
    }
  }

  // Legacy support: also scan Projects/*/Creative Brief*
  const projectsRoot = path.join(vaultRoot, 'Projects');
  if (await exists(projectsRoot)) {
    const projectDirs = await listDirs(projectsRoot);

    for (const proj of projectDirs) {
      const candidates = [
        path.join(proj, 'Creative Brief'),
        path.join(proj, 'Creative Briefs')
      ];

      for (const c of candidates) {
        if (!(await exists(c))) continue;
        const subDirs = await listDirs(c);
        if (await exists(path.join(c, 'brief.json'))) roots.push(c);
        for (const d of subDirs) {
          if (await exists(path.join(d, 'brief.json'))) roots.push(d);
          const v1site = path.join(d, 'v1', 'site', 'index.html');
          if (!(await exists(path.join(d, 'brief.json'))) && (await exists(v1site))) roots.push(d);
        }
      }
    }
  }

  return Array.from(new Set(roots));
}

export async function ensureBriefJson(briefRoot) {
  const p = path.join(briefRoot, 'brief.json');
  const existing = await readJson(p, null);
  if (existing) {
    // Ensure id and briefRoot are set/stable
    if (!existing.id || existing.id === '__AUTO__') existing.id = makeId(briefRoot);
    existing.briefRoot = briefRoot;
    if (!existing.updatedAt) existing.updatedAt = new Date().toISOString();
    await writeJsonAtomic(p, existing);
    return existing;
  }

  // Infer
  const inferredProject = path.basename(path.dirname(path.dirname(briefRoot))) === 'Projects'
    ? path.basename(path.dirname(briefRoot))
    : path.basename(path.dirname(path.dirname(briefRoot)));

  const title = path.basename(briefRoot);
  const id = makeId(briefRoot);

  const data = {
    id,
    title: title.includes('Creative Brief') ? `${inferredProject} — Creative Brief` : title,
    project: inferredProject,
    status: 'Needs Review',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    currentVersion: (await inferLatestVersion(briefRoot)) || 'v1',
    briefRoot
  };

  await writeJsonAtomic(p, data);
  return data;
}

export async function inferLatestVersion(briefRoot) {
  try {
    const entries = await fs.readdir(briefRoot, { withFileTypes: true });
    const vs = entries
      .filter(e => e.isDirectory() && /^v\d+$/i.test(e.name))
      .map(e => e.name)
      .sort((a,b) => Number(a.slice(1)) - Number(b.slice(1)));
    return vs.at(-1) || null;
  } catch {
    return null;
  }
}

export async function listBriefs(vaultRoot) {
  const roots = await findBriefRoots(vaultRoot);
  const briefs = [];
  for (const root of roots) {
    const brief = await ensureBriefJson(root);
    const feedback = await readJson(path.join(root, 'feedback.json'), { reviews: [], requests: [] });
    const needsAction = brief.status === 'Needs Review' || brief.status === 'Needs Changes';

    briefs.push({
      id: brief.id,
      title: brief.title,
      project: brief.project,
      status: brief.status,
      updatedAt: brief.updatedAt,
      currentVersion: brief.currentVersion || 'v1',
      needsAction,
      reviewCount: (feedback.reviews || []).length,
      briefRoot: root
    });
  }

  briefs.sort((a,b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  return briefs;
}

export async function getBrief(vaultRoot, id) {
  const roots = await findBriefRoots(vaultRoot);
  for (const root of roots) {
    const brief = await ensureBriefJson(root);
    if (brief.id !== id) continue;

    const feedbackPath = path.join(root, 'feedback.json');
    const feedback = await readJson(feedbackPath, { reviews: [], requests: [] });
    const versions = await listVersions(root);

    return { brief, feedback, versions };
  }
  return null;
}

export async function listVersions(briefRoot) {
  const entries = await fs.readdir(briefRoot, { withFileTypes: true }).catch(() => []);
  const vs = entries
    .filter(e => e.isDirectory() && /^v\d+$/i.test(e.name))
    .map(e => e.name)
    .sort((a,b) => Number(a.slice(1)) - Number(b.slice(1)));

  const out = [];
  for (const v of vs) {
    const sitePath = path.join(briefRoot, v, 'site', 'index.html');
    out.push({
      name: v,
      sitePath,
      hasSite: await exists(sitePath)
    });
  }
  return out;
}

export async function addReview(briefRoot, { version, decision, comment }) {
  const feedbackPath = path.join(briefRoot, 'feedback.json');
  const feedback = await readJson(feedbackPath, { reviews: [], requests: [] });
  feedback.reviews = feedback.reviews || [];

  feedback.reviews.push({
    at: new Date().toISOString(),
    author: 'John',
    version: version || 'v1',
    decision, // 'Approved' | 'Needs Changes'
    comment: comment || ''
  });

  await writeJsonAtomic(feedbackPath, feedback);
  return feedback;
}

export async function setStatus(briefRoot, status) {
  const briefPath = path.join(briefRoot, 'brief.json');
  const brief = await readJson(briefPath, null);
  if (!brief) return null;
  brief.status = status;
  brief.updatedAt = new Date().toISOString();
  await writeJsonAtomic(briefPath, brief);
  return brief;
}

export async function addRequest(briefRoot, { fromVersion, notes }) {
  const feedbackPath = path.join(briefRoot, 'feedback.json');
  const feedback = await readJson(feedbackPath, { reviews: [], requests: [] });
  feedback.requests = feedback.requests || [];

  const req = {
    at: new Date().toISOString(),
    author: 'John',
    fromVersion: fromVersion || 'v1',
    notes: notes || ''
  };
  feedback.requests.push(req);
  await writeJsonAtomic(feedbackPath, feedback);

  // Also write a standalone request artifact for the generator to pick up
  const reqPath = path.join(briefRoot, `${nextRequestName(feedback.requests.length)}.json`);
  await writeJsonAtomic(reqPath, req);

  return feedback;
}

function nextRequestName(n) {
  return `request_${String(n).padStart(3,'0')}`;
}
