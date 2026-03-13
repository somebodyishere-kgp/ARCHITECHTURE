import { ADFProject, InfiniteDesignGraph, DesignGraphNode, uid } from './adf';
import { createBranchFromActive, ensureGraph, switchToBranch } from './branchGraph';

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

const OBJECTIVE_KEYWORD_WEIGHTS: Record<string, number> = {
  daylight: 8,
  carbon: 10,
  embodied: 7,
  energy: 9,
  comfort: 6,
  ventilation: 6,
  structure: 5,
  cost: 7,
  lifecycle: 7,
  adaptive: 6,
};

export interface DesignNodeFitness {
  nodeId: string;
  score: number;
  objectiveScore: number;
  stabilityScore: number;
  penaltyScore: number;
  rank: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function tokenizeObjective(objective?: string): string[] {
  if (!objective) return [];
  return objective
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function scoreObjectiveText(objective?: string): number {
  const tokens = tokenizeObjective(objective);
  if (tokens.length === 0) return 20;

  const unique = new Set(tokens);
  let weighted = 0;
  unique.forEach(token => {
    weighted += OBJECTIVE_KEYWORD_WEIGHTS[token] || 1;
  });

  const detailBonus = clamp(unique.size * 1.5, 0, 20);
  return clamp(20 + weighted + detailBonus, 0, 70);
}

export function scoreDesignNodeFitness(node: DesignGraphNode): Omit<DesignNodeFitness, 'rank'> {
  const objectiveScore = scoreObjectiveText(node.objective);
  const warningPenalty = (node.metrics?.constraintWarnings || 0) * 6;
  const adjustmentPenalty = (node.metrics?.adjustments || 0) * 2;
  const iterationPenalty = (node.metrics?.iterations || 0) * 1.5;
  const promotedBonus = node.tags.includes('promoted') ? 8 : 0;
  const stabilityScore = clamp(40 - warningPenalty - adjustmentPenalty - iterationPenalty, 0, 40);
  const penaltyScore = clamp(warningPenalty + adjustmentPenalty + iterationPenalty, 0, 100);
  const score = clamp(objectiveScore + stabilityScore + promotedBonus, 0, 100);

  return {
    nodeId: node.id,
    score,
    objectiveScore,
    stabilityScore,
    penaltyScore,
  };
}

export function rankDesignNodes(graph: InfiniteDesignGraph): DesignNodeFitness[] {
  const scored = graph.nodes.map(node => ({
    ...scoreDesignNodeFitness(node),
    rank: 0,
  }));

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.penaltyScore !== b.penaltyScore) return a.penaltyScore - b.penaltyScore;
    return a.nodeId.localeCompare(b.nodeId);
  });

  return scored.map((item, index) => ({ ...item, rank: index + 1 }));
}

export function ensureDesignGraph(project: ADFProject): InfiniteDesignGraph {
  const branchGraph = ensureGraph(project);
  const base = project.designGraph;

  const now = new Date().toISOString();
  const nodes = base?.nodes ? clone(base.nodes) : [];
  const byBranch = new Map(nodes.map(node => [node.branchId, node]));

  for (const branch of branchGraph.nodes) {
    if (byBranch.has(branch.id)) continue;
    nodes.push({
      id: uid(),
      branchId: branch.id,
      name: branch.name,
      createdAt: branch.createdAt || now,
      objective: branch.objective,
      tags: branch.parentId ? ['variant'] : ['root'],
    });
  }

  const activeNode = nodes.find(node => node.branchId === branchGraph.activeBranchId) || nodes[0];
  return {
    activeNodeId: activeNode?.id || uid(),
    nodes,
    edges: base?.edges ? clone(base.edges) : [],
  };
}

export function syncDesignGraph(project: ADFProject): ADFProject {
  const graph = ensureDesignGraph(project);
  return { ...project, designGraph: graph };
}

export function createDesignVariant(
  project: ADFProject,
  name: string,
  objective?: string
): { project: ADFProject; node: DesignGraphNode } {
  const synced = syncDesignGraph(project);
  const current = ensureDesignGraph(synced);
  const activeNode = current.nodes.find(node => node.id === current.activeNodeId) || current.nodes[0];

  const created = createBranchFromActive(synced, name, objective);
  const nextGraph = ensureDesignGraph(created.project);

  const node: DesignGraphNode = {
    id: uid(),
    branchId: created.branch.id,
    name: name.trim() || created.branch.name,
    createdAt: new Date().toISOString(),
    objective: objective?.trim() || undefined,
    tags: ['variant'],
  };

  return {
    project: {
      ...created.project,
      designGraph: {
        ...nextGraph,
        activeNodeId: node.id,
        nodes: [...nextGraph.nodes, node],
        edges: [
          ...nextGraph.edges,
          {
            id: uid(),
            fromNodeId: activeNode.id,
            toNodeId: node.id,
            relation: 'fork',
            createdAt: new Date().toISOString(),
          },
        ],
      },
    },
    node,
  };
}

export function activateDesignNode(project: ADFProject, nodeId: string): ADFProject {
  const graph = ensureDesignGraph(project);
  const node = graph.nodes.find(n => n.id === nodeId);
  if (!node) throw new Error('Design node not found.');

  const switched = switchToBranch(project, node.branchId);
  const nextGraph = ensureDesignGraph(switched);

  return {
    ...switched,
    designGraph: {
      ...nextGraph,
      activeNodeId: nodeId,
    },
  };
}

export function promoteDesignNode(project: ADFProject, nodeId: string): ADFProject {
  const graph = ensureDesignGraph(project);
  const target = graph.nodes.find(n => n.id === nodeId);
  if (!target) return project;

  const nextNodes = graph.nodes.map(node => {
    if (node.id !== nodeId) return node;
    const tags = new Set(node.tags);
    tags.add('promoted');
    return { ...node, tags: Array.from(tags) };
  });

  return {
    ...project,
    designGraph: {
      ...graph,
      nodes: nextNodes,
      edges: [
        ...graph.edges,
        {
          id: uid(),
          fromNodeId: graph.activeNodeId,
          toNodeId: nodeId,
          relation: 'promote',
          createdAt: new Date().toISOString(),
        },
      ],
    },
  };
}

export function recordActiveNodeMetrics(
  project: ADFProject,
  metrics: { constraintWarnings: number; adjustments: number; iterations: number }
): ADFProject {
  const graph = ensureDesignGraph(project);
  return {
    ...project,
    designGraph: {
      ...graph,
      nodes: graph.nodes.map(node => (
        node.id !== graph.activeNodeId
          ? node
          : {
              ...node,
              metrics: {
                constraintWarnings: metrics.constraintWarnings,
                adjustments: metrics.adjustments,
                iterations: metrics.iterations,
                lastUpdated: new Date().toISOString(),
              },
            }
      )),
    },
  };
}

export function updateDesignNodeObjective(project: ADFProject, nodeId: string, objective: string): ADFProject {
  const graph = ensureDesignGraph(project);
  return {
    ...project,
    designGraph: {
      ...graph,
      nodes: graph.nodes.map(node => (
        node.id === nodeId ? { ...node, objective } : node
      )),
    },
  };
}
