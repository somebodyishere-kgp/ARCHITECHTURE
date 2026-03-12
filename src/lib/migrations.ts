import {
  ADFProject,
  DesignBranchGraph,
  FloorPlan,
  ProjectMigrationEntry,
  ProjectPresetLibrary,
  ProjectTimeline,
  createProject,
  uid,
} from './adf';

export const CURRENT_PROJECT_SCHEMA = 4;

export interface MigrationReport {
  from: number;
  to: number;
  applied: ProjectMigrationEntry[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function ensurePresetLibrary(value: unknown): ProjectPresetLibrary {
  const src = isRecord(value) ? value : {};
  const toArray = (v: unknown) => (Array.isArray(v) ? v : []);
  return {
    views: toArray(src.views) as ProjectPresetLibrary['views'],
    sections: toArray(src.sections) as ProjectPresetLibrary['sections'],
    sectionSets: toArray(src.sectionSets) as ProjectPresetLibrary['sectionSets'],
    elevations: toArray(src.elevations) as ProjectPresetLibrary['elevations'],
    worlds: toArray(src.worlds) as ProjectPresetLibrary['worlds'],
  };
}

function ensureBranchGraph(value: unknown): DesignBranchGraph {
  const src = isRecord(value) ? value : {};
  const nodes = Array.isArray(src.nodes) ? (src.nodes as DesignBranchGraph['nodes']) : [];
  const activeBranchId = typeof src.activeBranchId === 'string' ? src.activeBranchId : '';
  if (nodes.length === 0) {
    const rootId = uid();
    return {
      activeBranchId: rootId,
      nodes: [{ id: rootId, name: 'Main', createdAt: new Date().toISOString() }],
    };
  }
  return {
    activeBranchId: activeBranchId || nodes[0].id,
    nodes,
  };
}

function ensureTimeline(value: unknown): ProjectTimeline {
  const src = isRecord(value) ? value : {};
  return {
    activeTime: typeof src.activeTime === 'number' ? src.activeTime : 0,
    tracks: Array.isArray(src.tracks) ? (src.tracks as ProjectTimeline['tracks']) : [],
  };
}

function ensureFloorDependencyMetadata(floor: FloorPlan): FloorPlan {
  return {
    ...floor,
    dependencyMetadata: floor.dependencyMetadata || { recentReports: [] },
  };
}

function normalizeBaseProject(raw: unknown): ADFProject {
  if (!isRecord(raw)) {
    return createProject('Recovered Project');
  }

  const fallback = createProject(String(raw.projectName || 'Recovered Project'));
  const floors = Array.isArray(raw.floors) ? (raw.floors as ADFProject['floors']) : fallback.floors;
  const layers = Array.isArray(raw.layers) ? (raw.layers as ADFProject['layers']) : fallback.layers;
  const sheets = Array.isArray(raw.sheets) ? (raw.sheets as ADFProject['sheets']) : [];
  const blocks = Array.isArray(raw.blocks) ? (raw.blocks as ADFProject['blocks']) : [];

  return {
    ...fallback,
    ...(raw as Partial<ADFProject>),
    projectName: String(raw.projectName || fallback.projectName),
    floors,
    layers,
    sheets,
    blocks,
    presetLibrary: ensurePresetLibrary(raw.presetLibrary),
    migrationHistory: Array.isArray(raw.migrationHistory)
      ? (raw.migrationHistory as ProjectMigrationEntry[])
      : [],
    branchGraph: ensureBranchGraph(raw.branchGraph),
    timeline: ensureTimeline(raw.timeline),
  };
}

export function migrateProjectData(raw: unknown): { project: ADFProject; report: MigrationReport } {
  const project = normalizeBaseProject(raw);
  const applied: ProjectMigrationEntry[] = [];

  let schemaVersion = Number(project.schemaVersion ?? 1);
  if (!Number.isFinite(schemaVersion) || schemaVersion < 1) schemaVersion = 1;

  while (schemaVersion < CURRENT_PROJECT_SCHEMA) {
    if (schemaVersion === 1) {
      project.presetLibrary = ensurePresetLibrary(project.presetLibrary);
      const step: ProjectMigrationEntry = {
        from: 1,
        to: 2,
        timestamp: new Date().toISOString(),
        notes: 'Initialized project preset library structure.',
      };
      applied.push(step);
      schemaVersion = 2;
      continue;
    }

    if (schemaVersion === 2) {
      project.migrationHistory = Array.isArray(project.migrationHistory) ? project.migrationHistory : [];
      const step: ProjectMigrationEntry = {
        from: 2,
        to: 3,
        timestamp: new Date().toISOString(),
        notes: 'Initialized migration history metadata.',
      };
      applied.push(step);
      schemaVersion = 3;
      continue;
    }

    if (schemaVersion === 3) {
      project.branchGraph = ensureBranchGraph(project.branchGraph);
      project.timeline = ensureTimeline(project.timeline);
      project.floors = project.floors.map(ensureFloorDependencyMetadata);
      const step: ProjectMigrationEntry = {
        from: 3,
        to: 4,
        timestamp: new Date().toISOString(),
        notes: 'Initialized branch graph, timeline scaffolding, and floor dependency metadata.',
      };
      applied.push(step);
      schemaVersion = 4;
      continue;
    }

    break;
  }

  project.schemaVersion = Math.max(schemaVersion, CURRENT_PROJECT_SCHEMA);
  project.branchGraph = ensureBranchGraph(project.branchGraph);
  project.timeline = ensureTimeline(project.timeline);
  project.floors = project.floors.map(ensureFloorDependencyMetadata);
  project.migrationHistory = [...(project.migrationHistory || []), ...applied];

  return {
    project,
    report: {
      from: Number((raw as { schemaVersion?: number })?.schemaVersion ?? 1),
      to: project.schemaVersion,
      applied,
    },
  };
}
