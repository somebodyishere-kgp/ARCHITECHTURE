import {
  AnyEntity,
  ConstraintGraphEdge,
  ConstraintGraphNode,
  ConstraintRuleDefinition,
  ConstraintRuleKind,
  ConstraintRuleReport,
  ConstraintRuleSeverity,
  ConstraintRuleWarning,
  DimensionEntity,
  DoorEntity,
  FloorPlan,
  WindowEntity,
} from './adf';

function findRule(rules: ConstraintRuleDefinition[] | undefined, kind: ConstraintRuleKind) {
  return (rules || []).find(rule => rule.kind === kind && rule.enabled);
}

function severityRank(severity: ConstraintRuleSeverity): number {
  if (severity === 'error') return 3;
  if (severity === 'warning') return 2;
  return 1;
}

function maxSeverity(a: ConstraintRuleSeverity, b: ConstraintRuleSeverity): ConstraintRuleSeverity {
  return severityRank(a) >= severityRank(b) ? a : b;
}

function toEntityMap(entities: AnyEntity[]): Map<string, AnyEntity> {
  return new Map(entities.map(entity => [entity.id, entity]));
}

export function evaluateConstraintRuleGraph(
  floor: FloorPlan,
  rules?: ConstraintRuleDefinition[]
): ConstraintRuleReport {
  const entityMap = toEntityMap(floor.entities);
  const warnings: ConstraintRuleWarning[] = [];
  const edges: ConstraintGraphEdge[] = [];

  const missingTargetRule = findRule(rules, 'missing_target');
  const invalidValueRule = findRule(rules, 'invalid_value');
  const conflictRule = findRule(rules, 'dimension_conflict');
  const doorWidthRule = findRule(rules, 'door_width_min');
  const windowSillRule = findRule(rules, 'window_sill_min');

  const constrainedByEntity = new Map<string, DimensionEntity[]>();

  floor.entities.forEach(entity => {
    if (entity.type !== 'dimension') return;
    const dimension = entity as DimensionEntity;
    if (!dimension.constrainedEntityId) return;

    edges.push({ from: dimension.id, to: dimension.constrainedEntityId, kind: 'dimension_conflict', severity: 'info' });

    const target = entityMap.get(dimension.constrainedEntityId);
    if (!target && missingTargetRule) {
      warnings.push({
        code: 'missing_target',
        severity: 'error',
        message: `Dimension ${dimension.id} references missing entity ${dimension.constrainedEntityId}.`,
        entityIds: [dimension.id, dimension.constrainedEntityId],
        ruleId: missingTargetRule.id,
      });
    }

    if (invalidValueRule && typeof dimension.drivenValue === 'number' && dimension.drivenValue <= 0) {
      warnings.push({
        code: 'invalid_value',
        severity: 'error',
        message: `Dimension ${dimension.id} has invalid driven value ${dimension.drivenValue}.`,
        entityIds: [dimension.id],
        ruleId: invalidValueRule.id,
      });
    }

    const list = constrainedByEntity.get(dimension.constrainedEntityId) || [];
    list.push(dimension);
    constrainedByEntity.set(dimension.constrainedEntityId, list);
  });

  if (conflictRule) {
    const epsilon = typeof conflictRule.threshold === 'number' ? Math.max(0.1, conflictRule.threshold) : 1;
    constrainedByEntity.forEach((dimensions, targetId) => {
      const drivenValues = dimensions
        .map(dim => dim.drivenValue)
        .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));

      if (drivenValues.length < 2) return;
      const min = Math.min(...drivenValues);
      const max = Math.max(...drivenValues);
      if (max - min > epsilon) {
        warnings.push({
          code: 'dimension_conflict',
          severity: 'warning',
          message: `Entity ${targetId} has conflicting driven dimensions (${min.toFixed(1)}-${max.toFixed(1)} mm).`,
          entityIds: [targetId, ...dimensions.map(dim => dim.id)],
          ruleId: conflictRule.id,
        });
      }
    });
  }

  if (doorWidthRule) {
    const minDoorWidth = typeof doorWidthRule.threshold === 'number' ? doorWidthRule.threshold : 700;
    floor.entities.forEach(entity => {
      if (entity.type !== 'door') return;
      const door = entity as DoorEntity;
      if (door.width < minDoorWidth) {
        warnings.push({
          code: 'door_width_min',
          severity: 'warning',
          message: `Door ${door.id} width ${door.width} mm is below minimum ${minDoorWidth} mm.`,
          entityIds: [door.id],
          ruleId: doorWidthRule.id,
        });
      }
    });
  }

  if (windowSillRule) {
    const minSill = typeof windowSillRule.threshold === 'number' ? windowSillRule.threshold : 450;
    floor.entities.forEach(entity => {
      if (entity.type !== 'window') return;
      const windowEntity = entity as WindowEntity;
      if (windowEntity.sillHeight < minSill) {
        warnings.push({
          code: 'window_sill_min',
          severity: 'warning',
          message: `Window ${windowEntity.id} sill height ${windowEntity.sillHeight} mm is below minimum ${minSill} mm.`,
          entityIds: [windowEntity.id],
          ruleId: windowSillRule.id,
        });
      }
    });
  }

  const nodeSeverity = new Map<string, ConstraintRuleSeverity>();
  floor.entities.forEach(entity => nodeSeverity.set(entity.id, 'info'));

  warnings.forEach(warning => {
    warning.entityIds.forEach(entityId => {
      if (!nodeSeverity.has(entityId)) return;
      const current = nodeSeverity.get(entityId) || 'info';
      nodeSeverity.set(entityId, maxSeverity(current, warning.severity));
    });
  });

  const nodes: ConstraintGraphNode[] = floor.entities.map(entity => ({
    id: entity.id,
    type: entity.type,
    severity: nodeSeverity.get(entity.id) || 'info',
  }));

  const edgeSeverityMap = new Map<string, ConstraintRuleSeverity>();
  warnings.forEach(warning => {
    if (warning.entityIds.length < 2) return;
    const toId = warning.entityIds[0];
    for (let i = 1; i < warning.entityIds.length; i += 1) {
      const fromId = warning.entityIds[i];
      const key = `${fromId}->${toId}`;
      const current = edgeSeverityMap.get(key) || 'info';
      edgeSeverityMap.set(key, maxSeverity(current, warning.severity));
    }
  });

  const enrichedEdges = edges.map(edge => {
    const key = `${edge.from}->${edge.to}`;
    return {
      ...edge,
      severity: edgeSeverityMap.get(key) || maxSeverity(nodeSeverity.get(edge.from) || 'info', nodeSeverity.get(edge.to) || 'info'),
    };
  });

  return {
    timestamp: new Date().toISOString(),
    nodeCount: floor.entities.length,
    edgeCount: enrichedEdges.length,
    warningCount: warnings.length,
    nodes,
    edges: enrichedEdges,
    warnings,
  };
}
