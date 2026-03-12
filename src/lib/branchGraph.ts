import {
  ADFProject,
  DesignBranchGraph,
  DesignBranchNode,
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

function resolveSnapshot(project: ADFProject, nodeId: string): ProjectBranchSnapshot | null {
  const graph = ensureGraph(project);
  const node = graph.nodes.find(n => n.id === nodeId);
  if (!node) return null;
  if (node.snapshot) return node.snapshot;
  if (graph.activeBranchId === nodeId) return captureBranchSnapshot(project);
  return null;
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
