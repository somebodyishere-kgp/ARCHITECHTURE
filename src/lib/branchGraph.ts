import {
  ADFProject,
  FloorPlan,
  DesignBranchGraph,
  DesignBranchNode,
  AnyEntity,
  ProjectBranchSnapshot,
  uid,
} from './adf';

export interface BranchComparisonFloorDelta {
  floorId: string;
  floorName: string;
  entityCountA: number;
  entityCountB: number;
  delta: number;
}

export interface BranchComparisonResult {
  branchAId: string;
  branchBId: string;
  totalEntitiesA: number;
  totalEntitiesB: number;
  totalDelta: number;
  floors: BranchComparisonFloorDelta[];
}

export type BranchMergeStrategy = 'prefer_source' | 'prefer_target';

export interface BranchMergeConflict {
  floorId: string;
  floorName: string;
  entityId: string;
  sourceType: string;
  targetType: string;
}

export interface BranchMergePreview {
  sourceBranchId: string;
  targetBranchId: string;
  addedCount: number;
  updatedCount: number;
  conflictCount: number;
  conflicts: BranchMergeConflict[];
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function ensureGraph(project: ADFProject): DesignBranchGraph {
  const nodes = project.branchGraph?.nodes || [];
  if (nodes.length === 0) {
    const rootId = uid();
    return {
      activeBranchId: rootId,
      nodes: [{ id: rootId, name: 'Main', createdAt: new Date().toISOString() }],
    };
  }
  return {
    activeBranchId: project.branchGraph?.activeBranchId || nodes[0].id,
    nodes: deepClone(nodes),
  };
}

export function captureBranchSnapshot(project: ADFProject): ProjectBranchSnapshot {
  return {
    capturedAt: new Date().toISOString(),
    floors: deepClone(project.floors),
    sheets: deepClone(project.sheets),
    layers: deepClone(project.layers),
    blocks: deepClone(project.blocks),
    presetLibrary: project.presetLibrary ? deepClone(project.presetLibrary) : undefined,
    timeline: project.timeline ? deepClone(project.timeline) : undefined,
  };
}

function withUpdatedNode(
  nodes: DesignBranchNode[],
  nodeId: string,
  updater: (node: DesignBranchNode) => DesignBranchNode
): DesignBranchNode[] {
  return nodes.map(node => (node.id === nodeId ? updater(node) : node));
}

export function createBranchFromActive(
  project: ADFProject,
  name: string,
  objective?: string
): { project: ADFProject; branch: DesignBranchNode } {
  const graph = ensureGraph(project);
  const activeNode = graph.nodes.find(n => n.id === graph.activeBranchId) || graph.nodes[0];
  const now = new Date().toISOString();

  const currentSnapshot = captureBranchSnapshot(project);
  const nodesWithCurrent = withUpdatedNode(graph.nodes, activeNode.id, node => ({
    ...node,
    snapshot: currentSnapshot,
  }));

  const branch: DesignBranchNode = {
    id: uid(),
    name: name.trim() || `Branch ${nodesWithCurrent.length}`,
    parentId: activeNode.id,
    createdAt: now,
    objective: objective?.trim() || undefined,
    snapshot: currentSnapshot,
  };

  return {
    project: {
      ...project,
      branchGraph: {
        activeBranchId: branch.id,
        nodes: [...nodesWithCurrent, branch],
      },
    },
    branch,
  };
}

export function switchToBranch(project: ADFProject, branchId: string): ADFProject {
  const graph = ensureGraph(project);
  if (graph.activeBranchId === branchId) return { ...project, branchGraph: graph };

  const activeNode = graph.nodes.find(n => n.id === graph.activeBranchId);
  const targetNode = graph.nodes.find(n => n.id === branchId);
  if (!targetNode) {
    throw new Error('Branch not found.');
  }

  const currentSnapshot = captureBranchSnapshot(project);
  let nodes = graph.nodes;
  if (activeNode) {
    nodes = withUpdatedNode(nodes, activeNode.id, node => ({ ...node, snapshot: currentSnapshot }));
  }

  const targetSnapshot = targetNode.snapshot;
  if (!targetSnapshot) {
    throw new Error('Target branch has no snapshot yet. Create or save branch state first.');
  }

  return {
    ...project,
    floors: deepClone(targetSnapshot.floors),
    sheets: deepClone(targetSnapshot.sheets),
    layers: deepClone(targetSnapshot.layers),
    blocks: deepClone(targetSnapshot.blocks),
    presetLibrary: targetSnapshot.presetLibrary ? deepClone(targetSnapshot.presetLibrary) : project.presetLibrary,
    timeline: targetSnapshot.timeline ? deepClone(targetSnapshot.timeline) : project.timeline,
    branchGraph: {
      activeBranchId: branchId,
      nodes,
    },
  };
}

export function resolveSnapshot(project: ADFProject, nodeId: string): ProjectBranchSnapshot | null {
  const graph = ensureGraph(project);
  const node = graph.nodes.find(n => n.id === nodeId);
  if (!node) return null;
  if (node.snapshot) return node.snapshot;
  if (graph.activeBranchId === nodeId) return captureBranchSnapshot(project);
  return null;
}

function getFloorMap(snapshot: ProjectBranchSnapshot): Map<string, FloorPlan> {
  return new Map(snapshot.floors.map(floor => [floor.id, deepClone(floor)]));
}

function entityConflict(a: AnyEntity, b: AnyEntity): boolean {
  return JSON.stringify(a) !== JSON.stringify(b);
}

export function previewBranchMerge(
  project: ADFProject,
  sourceBranchId: string,
  targetBranchId: string
): BranchMergePreview {
  const source = resolveSnapshot(project, sourceBranchId);
  const target = resolveSnapshot(project, targetBranchId);

  if (!source || !target) {
    throw new Error('Cannot preview merge because source or target snapshot is missing.');
  }

  const sourceFloors = getFloorMap(source);
  const targetFloors = getFloorMap(target);

  let addedCount = 0;
  let updatedCount = 0;
  const conflicts: BranchMergeConflict[] = [];

  sourceFloors.forEach((sourceFloor, floorId) => {
    const targetFloor = targetFloors.get(floorId);
    if (!targetFloor) {
      addedCount += sourceFloor.entities.length;
      return;
    }

    const sourceEntities = new Map(sourceFloor.entities.map(entity => [entity.id, entity]));
    const targetEntities = new Map(targetFloor.entities.map(entity => [entity.id, entity]));

    sourceEntities.forEach((sourceEntity, entityId) => {
      const targetEntity = targetEntities.get(entityId);
      if (!targetEntity) {
        addedCount += 1;
        return;
      }
      if (entityConflict(sourceEntity, targetEntity)) {
        updatedCount += 1;
        conflicts.push({
          floorId,
          floorName: targetFloor.name,
          entityId,
          sourceType: sourceEntity.type,
          targetType: targetEntity.type,
        });
      }
    });
  });

  return {
    sourceBranchId,
    targetBranchId,
    addedCount,
    updatedCount,
    conflictCount: conflicts.length,
    conflicts,
  };
}

export function applyBranchMerge(
  project: ADFProject,
  sourceBranchId: string,
  targetBranchId: string,
  strategy: BranchMergeStrategy
): { project: ADFProject; preview: BranchMergePreview } {
  const preview = previewBranchMerge(project, sourceBranchId, targetBranchId);
  const source = resolveSnapshot(project, sourceBranchId);
  const target = resolveSnapshot(project, targetBranchId);

  if (!source || !target) {
    throw new Error('Cannot apply merge because source or target snapshot is missing.');
  }

  const sourceFloors = getFloorMap(source);
  const mergedFloors = getFloorMap(target);

  sourceFloors.forEach((sourceFloor, floorId) => {
    const currentFloor = mergedFloors.get(floorId);
    if (!currentFloor) {
      mergedFloors.set(floorId, deepClone(sourceFloor));
      return;
    }

    const mergedEntityMap = new Map(currentFloor.entities.map(entity => [entity.id, deepClone(entity)]));
    sourceFloor.entities.forEach(sourceEntity => {
      const existing = mergedEntityMap.get(sourceEntity.id);
      if (!existing) {
        mergedEntityMap.set(sourceEntity.id, deepClone(sourceEntity));
        return;
      }

      if (!entityConflict(existing, sourceEntity)) return;
      if (strategy === 'prefer_source') {
        mergedEntityMap.set(sourceEntity.id, deepClone(sourceEntity));
      }
    });

    mergedFloors.set(floorId, {
      ...currentFloor,
      entities: Array.from(mergedEntityMap.values()),
    });
  });

  const graph = ensureGraph(project);
  const nodes = graph.nodes.map(node => {
    if (node.id !== targetBranchId) return node;
    return {
      ...node,
      snapshot: {
        ...target,
        capturedAt: new Date().toISOString(),
        floors: Array.from(mergedFloors.values()),
      },
    };
  });

  const targetIsActive = graph.activeBranchId === targetBranchId;
  return {
    project: {
      ...project,
      ...(targetIsActive ? { floors: Array.from(mergedFloors.values()) } : {}),
      branchGraph: {
        ...graph,
        nodes,
      },
    },
    preview,
  };
}

export function compareBranches(project: ADFProject, branchAId: string, branchBId: string): BranchComparisonResult {
  const a = resolveSnapshot(project, branchAId);
  const b = resolveSnapshot(project, branchBId);

  if (!a || !b) {
    throw new Error('One or both branches are missing snapshots.');
  }

  const floorMapA = new Map(a.floors.map(f => [f.id, f]));
  const floorMapB = new Map(b.floors.map(f => [f.id, f]));
  const floorIds = Array.from(new Set([...floorMapA.keys(), ...floorMapB.keys()]));

  const floors = floorIds.map(id => {
    const fa = floorMapA.get(id);
    const fb = floorMapB.get(id);
    const countA = fa?.entities.length || 0;
    const countB = fb?.entities.length || 0;
    return {
      floorId: id,
      floorName: fa?.name || fb?.name || id,
      entityCountA: countA,
      entityCountB: countB,
      delta: countB - countA,
    };
  });

  const totalEntitiesA = a.floors.reduce((acc, floor) => acc + floor.entities.length, 0);
  const totalEntitiesB = b.floors.reduce((acc, floor) => acc + floor.entities.length, 0);

  return {
    branchAId,
    branchBId,
    totalEntitiesA,
    totalEntitiesB,
    totalDelta: totalEntitiesB - totalEntitiesA,
    floors,
  };
}
