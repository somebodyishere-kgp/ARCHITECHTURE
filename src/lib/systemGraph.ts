import {
  AnyEntity,
  DimensionEntity,
  DoorEntity,
  FloorPlan,
  TagEntity,
  WallEntity,
  WindowEntity,
} from './adf';

export type DependencyRelation = 'hosted_on' | 'constrained_to' | 'tagged_to';

export interface SystemDependencyEdge {
  sourceId: string;
  targetId: string;
  relation: DependencyRelation;
}

export interface SystemDependencyGraph {
  edges: SystemDependencyEdge[];
  downstream: Map<string, string[]>;
}

export interface DependencyPropagationReport {
  adjustedCount: number;
  impactedIds: string[];
  changedRoots: string[];
}

function vecChanged(a: number, b: number): boolean {
  return Math.abs(a - b) > 1e-6;
}

function wallChanged(prev: WallEntity, next: WallEntity): boolean {
  return (
    vecChanged(prev.x1, next.x1) ||
    vecChanged(prev.y1, next.y1) ||
    vecChanged(prev.x2, next.x2) ||
    vecChanged(prev.y2, next.y2)
  );
}

function paramAlongWall(px: number, py: number, wall: WallEntity): number {
  const dx = wall.x2 - wall.x1;
  const dy = wall.y2 - wall.y1;
  const denom = dx * dx + dy * dy;
  if (denom <= 1e-6) return 0;
  const t = ((px - wall.x1) * dx + (py - wall.y1) * dy) / denom;
  return Math.max(0, Math.min(1, t));
}

function pointOnWallAt(wall: WallEntity, t: number): { x: number; y: number } {
  return {
    x: wall.x1 + (wall.x2 - wall.x1) * t,
    y: wall.y1 + (wall.y2 - wall.y1) * t,
  };
}

function resolveDimensionConstraint(entity: AnyEntity, dim: DimensionEntity): AnyEntity {
  if (typeof dim.drivenValue !== 'number' || dim.drivenValue <= 0) return entity;

  if (entity.type !== 'line' && entity.type !== 'wall') return entity;

  const x1 = (entity as any).x1 as number;
  const y1 = (entity as any).y1 as number;
  const x2 = (entity as any).x2 as number;
  const y2 = (entity as any).y2 as number;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len <= 1e-6) return entity;

  const ux = dx / len;
  const uy = dy / len;
  const targetLen = dim.drivenValue;

  if (dim.constrainedEnd === 'start') {
    return {
      ...entity,
      x1: x2 - ux * targetLen,
      y1: y2 - uy * targetLen,
    } as AnyEntity;
  }

  if (dim.constrainedEnd === 'both') {
    const midX = (x1 + x2) * 0.5;
    const midY = (y1 + y2) * 0.5;
    const half = targetLen * 0.5;
    return {
      ...entity,
      x1: midX - ux * half,
      y1: midY - uy * half,
      x2: midX + ux * half,
      y2: midY + uy * half,
    } as AnyEntity;
  }

  return {
    ...entity,
    x2: x1 + ux * targetLen,
    y2: y1 + uy * targetLen,
  } as AnyEntity;
}

export function buildSystemDependencyGraph(entities: AnyEntity[]): SystemDependencyGraph {
  const edges: SystemDependencyEdge[] = [];

  for (const entity of entities) {
    if (entity.type === 'door' && (entity as DoorEntity).wallId) {
      edges.push({
        sourceId: (entity as DoorEntity).wallId as string,
        targetId: entity.id,
        relation: 'hosted_on',
      });
    }

    if (entity.type === 'window' && (entity as WindowEntity).wallId) {
      edges.push({
        sourceId: (entity as WindowEntity).wallId as string,
        targetId: entity.id,
        relation: 'hosted_on',
      });
    }

    if (entity.type === 'dimension' && (entity as DimensionEntity).constrainedEntityId) {
      edges.push({
        sourceId: entity.id,
        targetId: (entity as DimensionEntity).constrainedEntityId as string,
        relation: 'constrained_to',
      });
    }

    if (entity.type === 'tag' && (entity as TagEntity).linkedEntityId) {
      edges.push({
        sourceId: (entity as TagEntity).linkedEntityId as string,
        targetId: entity.id,
        relation: 'tagged_to',
      });
    }
  }

  const downstream = new Map<string, string[]>();
  for (const edge of edges) {
    const list = downstream.get(edge.sourceId) || [];
    if (!list.includes(edge.targetId)) list.push(edge.targetId);
    downstream.set(edge.sourceId, list);
  }

  return { edges, downstream };
}

export function getDependencyImpactOrder(graph: SystemDependencyGraph, rootIds: string[]): string[] {
  const order: string[] = [];
  const seen = new Set<string>();
  const queue = [...rootIds];

  while (queue.length > 0) {
    const current = queue.shift() as string;
    const children = graph.downstream.get(current) || [];
    for (const child of children) {
      if (seen.has(child)) continue;
      seen.add(child);
      order.push(child);
      queue.push(child);
    }
  }

  return order;
}

export function propagateFloorDependencies(previousFloor: FloorPlan, nextFloor: FloorPlan): {
  floor: FloorPlan;
  report: DependencyPropagationReport;
  graph: SystemDependencyGraph;
} {
  const prevById = new Map(previousFloor.entities.map(entity => [entity.id, entity] as const));
  const nextById = new Map(nextFloor.entities.map(entity => [entity.id, entity] as const));

  const changedRoots: string[] = [];
  for (const entity of nextFloor.entities) {
    if (entity.type !== 'wall') continue;
    const prev = prevById.get(entity.id);
    if (!prev || prev.type !== 'wall') continue;
    if (wallChanged(prev as WallEntity, entity as WallEntity)) changedRoots.push(entity.id);
  }

  const graph = buildSystemDependencyGraph(nextFloor.entities);
  const impactedIds = getDependencyImpactOrder(graph, changedRoots);
  if (impactedIds.length === 0) {
    return {
      floor: nextFloor,
      graph,
      report: { adjustedCount: 0, impactedIds: [], changedRoots },
    };
  }

  const dimensionsByTarget = new Map<string, DimensionEntity[]>();
  for (const entity of nextFloor.entities) {
    if (entity.type !== 'dimension') continue;
    const dim = entity as DimensionEntity;
    if (!dim.constrainedEntityId) continue;
    const list = dimensionsByTarget.get(dim.constrainedEntityId) || [];
    list.push(dim);
    dimensionsByTarget.set(dim.constrainedEntityId, list);
  }

  let adjustedCount = 0;
  const updatedEntities = nextFloor.entities.map(entity => {
    let updated = entity;

    if (entity.type === 'door') {
      const door = entity as DoorEntity;
      if (door.wallId && changedRoots.includes(door.wallId)) {
        const prevHost = prevById.get(door.wallId);
        const nextHost = nextById.get(door.wallId);
        if (prevHost?.type === 'wall' && nextHost?.type === 'wall') {
          const t = paramAlongWall(door.x, door.y, prevHost as WallEntity);
          const pt = pointOnWallAt(nextHost as WallEntity, t);
          updated = { ...door, x: pt.x, y: pt.y };
          adjustedCount += 1;
        }
      }
    }

    if (entity.type === 'window') {
      const windowEntity = entity as WindowEntity;
      if (windowEntity.wallId && changedRoots.includes(windowEntity.wallId)) {
        const prevHost = prevById.get(windowEntity.wallId);
        const nextHost = nextById.get(windowEntity.wallId);
        if (prevHost?.type === 'wall' && nextHost?.type === 'wall') {
          const t = paramAlongWall(windowEntity.x, windowEntity.y, prevHost as WallEntity);
          const pt = pointOnWallAt(nextHost as WallEntity, t);
          updated = { ...windowEntity, x: pt.x, y: pt.y };
          adjustedCount += 1;
        }
      }
    }

    const constraints = dimensionsByTarget.get(updated.id) || [];
    if (constraints.length > 0) {
      for (const dim of constraints) {
        const resolved = resolveDimensionConstraint(updated, dim);
        if (resolved !== updated) {
          updated = resolved;
          adjustedCount += 1;
        }
      }
    }

    return updated;
  });

  return {
    floor: { ...nextFloor, entities: updatedEntities },
    graph,
    report: {
      adjustedCount,
      impactedIds,
      changedRoots,
    },
  };
}
