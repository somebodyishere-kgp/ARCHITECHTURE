import { ConstraintRuleDefinition, ConstraintRuleReport, FloorPlan } from './adf';
import {
  DependencyPropagationReport,
  SystemDependencyGraph,
  propagateFloorDependencies,
} from './systemGraph';
import {
  applyConstraintAutoAdjustments,
  evaluateConstraintRuleGraph,
} from './constraintRules';

export interface LivingSolverOptions {
  maxIterations?: number;
}

export interface LivingConvergenceReport {
  iterations: number;
  stabilized: boolean;
  capped: boolean;
  cycleBroken: boolean;
  guardTriggered: boolean;
  totalAdjustments: number;
}

export interface LivingSolverResult {
  floor: FloorPlan;
  graph: SystemDependencyGraph;
  dependencyReport: DependencyPropagationReport;
  constraintReport: ConstraintRuleReport;
  convergence: LivingConvergenceReport;
  adjustments: string[];
}

function floorSignature(floor: FloorPlan): string {
  const sorted = floor.entities
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(entity => JSON.stringify(entity));
  return sorted.join('|');
}

export function runLivingBuildingSolver(
  previousFloor: FloorPlan,
  candidateFloor: FloorPlan,
  rules?: ConstraintRuleDefinition[],
  options?: LivingSolverOptions
): LivingSolverResult {
  const maxIterations = Math.max(1, Math.floor(options?.maxIterations ?? 6));

  let prior = previousFloor;
  let current = candidateFloor;

  let lastGraph: SystemDependencyGraph = { edges: [], downstream: new Map() };
  let lastDependencyReport: DependencyPropagationReport = {
    adjustedCount: 0,
    impactedIds: [],
    changedRoots: [],
    impactReasons: [],
    warnings: [],
  };
  let lastConstraintReport: ConstraintRuleReport = {
    timestamp: new Date().toISOString(),
    nodeCount: candidateFloor.entities.length,
    edgeCount: 0,
    warningCount: 0,
    nodes: [],
    edges: [],
    warnings: [],
  };

  const seen = new Set<string>();
  const adjustments: string[] = [];
  let stabilized = false;
  let cycleBroken = false;
  let guardTriggered = false;
  let totalAdjustments = 0;
  let iterations = 0;

  for (let i = 0; i < maxIterations; i += 1) {
    iterations = i + 1;

    const propagation = propagateFloorDependencies(prior, current);
    let auto = applyConstraintAutoAdjustments(propagation.floor, rules);

    lastGraph = propagation.graph;
    lastDependencyReport = propagation.report;

    const signatureBefore = floorSignature(auto.floor);
    if (seen.has(signatureBefore)) {
      cycleBroken = true;
      auto = applyConstraintAutoAdjustments(auto.floor, rules, { forceCycleBreak: true });
      const signatureAfter = floorSignature(auto.floor);
      if (seen.has(signatureAfter)) {
        guardTriggered = true;
        lastConstraintReport = evaluateConstraintRuleGraph(auto.floor, rules);
        adjustments.push(...auto.adjustments);
        totalAdjustments += propagation.report.adjustedCount + auto.adjustedCount;
        current = auto.floor;
        break;
      }
    }

    seen.add(floorSignature(auto.floor));
    lastConstraintReport = evaluateConstraintRuleGraph(auto.floor, rules);

    adjustments.push(...auto.adjustments);
    totalAdjustments += propagation.report.adjustedCount + auto.adjustedCount;

    const stableNow = propagation.report.adjustedCount === 0 && auto.adjustedCount === 0;
    current = auto.floor;

    if (stableNow) {
      stabilized = true;
      break;
    }

    prior = current;
  }

  return {
    floor: current,
    graph: lastGraph,
    dependencyReport: lastDependencyReport,
    constraintReport: lastConstraintReport,
    convergence: {
      iterations,
      stabilized,
      capped: !stabilized && !guardTriggered && iterations >= maxIterations,
      cycleBroken,
      guardTriggered,
      totalAdjustments,
    },
    adjustments,
  };
}
