import { ADFProject, ProjectMigrationEntry, ProjectPresetLibrary, createProject } from './adf';

export const CURRENT_PROJECT_SCHEMA = 3;

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

    break;
  }

  project.schemaVersion = Math.max(schemaVersion, CURRENT_PROJECT_SCHEMA);
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
