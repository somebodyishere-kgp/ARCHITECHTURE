import { ADFProject } from './adf';

export type IntelligenceModule =
  | 'environmental'
  | 'spatial'
  | 'behavioral'
  | 'operational'
  | 'reflective';

export type PipelinePhase =
  | 'state_analysis'
  | 'context_understanding'
  | 'constraint_evaluation'
  | 'action_generation'
  | 'proposal_validation'
  | 'execution';

export interface ParsedRule {
  key: string;
  operator: '=' | '<' | '<=' | '>' | '>=';
  rawValue: string;
  numericValue?: number;
}

export interface DesignIntent {
  project_type: string;
  site: {
    location: string;
    dimensions?: [number, number];
  };
  capacity?: number;
  architectural_style?: string;
  functional_program: string[];
  explicit_rules: ParsedRule[];
}

export interface PipelineAuditStage {
  phase: PipelinePhase;
  module: IntelligenceModule;
  summary: string;
  evidence: string[];
  deterministic: true;
  output: Record<string, unknown>;
}

export interface ProgramAreaTarget {
  name: string;
  area_m2: number;
}

export interface CandidateProposal {
  id: string;
  strategy: string;
  prompt: string;
  confidence: number;
}

export interface PipelineResult {
  auditId: string;
  intent: DesignIntent;
  stages: PipelineAuditStage[];
  designSpec: Record<string, unknown>;
  executionPrompt: string;
  proposals: CandidateProposal[];
}

interface PipelineInput {
  prompt: string;
  project: ADFProject;
  buildingCodes?: Record<string, unknown>;
}

const STYLE_KEYWORDS = ['brutalist', 'modern', 'contemporary', 'vernacular', 'industrial', 'minimal'];
const PROJECT_TYPE_KEYWORDS = ['museum', 'auditorium', 'office', 'hospital', 'school', 'residential', 'house', 'apartment', 'cafe'];

function toWords(text: string): string[] {
  return text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

function hashText(input: string): string {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) - h) + input.charCodeAt(i);
    h |= 0;
  }
  return `af-${Math.abs(h).toString(36)}`;
}

function summarizeProjectContext(project: ADFProject): string[] {
  const floorCount = project.floors.length;
  const entities = project.floors.reduce((sum, floor) => sum + floor.entities.length, 0);
  const activeBranch = project.branchGraph?.nodes.find(node => node.id === project.branchGraph?.activeBranchId)?.name || 'Main';
  const ruleCount = project.constraintRules?.length || 0;
  return [
    `project=${project.projectName}`,
    `floors=${floorCount}`,
    `entities=${entities}`,
    `active_branch=${activeBranch}`,
    `constraint_rules=${ruleCount}`,
  ];
}

function parseCapacity(text: string): number | undefined {
  const match = text.match(/(\d{2,5})\s*(people|visitors|occupants|persons)/i);
  if (!match) return undefined;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : undefined;
}

function parseSiteDimensions(text: string): [number, number] | undefined {
  const match = text.match(/(\d+(?:\.\d+)?)\s*m\s*[x×]\s*(\d+(?:\.\d+)?)\s*m/i);
  if (!match) return undefined;
  return [Number(match[1]), Number(match[2])];
}

function parseLocation(text: string, fallback: string): string {
  const nearMatch = text.match(/(?:in|near|at)\s+([a-zA-Z\s,]+?)(?:\.|,|for|with|on|$)/i);
  if (nearMatch?.[1]) return nearMatch[1].trim();
  return fallback || 'unspecified';
}

function parseExplicitRules(text: string): ParsedRule[] {
  const rules: ParsedRule[] = [];
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*(<=|>=|=|<|>)\s*(.+?)\s*$/);
    if (!m) continue;
    const raw = m[3].trim();
    const num = Number(raw.replace(/[^0-9.+-]/g, ''));
    rules.push({
      key: m[1],
      operator: m[2] as ParsedRule['operator'],
      rawValue: raw,
      numericValue: Number.isFinite(num) ? num : undefined,
    });
  }
  return rules;
}

function inferProjectType(words: string, fallback: string): string {
  const w = toWords(words);
  const found = PROJECT_TYPE_KEYWORDS.find(k => w.includes(k));
  if (found) return found;
  return fallback || 'mixed-use';
}

function inferStyle(text: string): string | undefined {
  const lower = text.toLowerCase();
  return STYLE_KEYWORDS.find(k => lower.includes(k));
}

function buildFunctionalProgram(projectType: string, capacity?: number): string[] {
  const base = ['lobby', 'restrooms', 'service areas', 'circulation'];
  if (projectType === 'museum') {
    base.unshift('exhibition halls', 'storage', 'auditorium');
  } else if (projectType === 'office') {
    base.unshift('open work area', 'meeting rooms', 'reception');
  } else if (projectType === 'school') {
    base.unshift('classrooms', 'staff room', 'assembly hall');
  } else if (projectType === 'hospital') {
    base.unshift('triage', 'wards', 'diagnostics');
  } else {
    base.unshift('primary spaces', 'support spaces');
  }

  if (capacity && capacity > 800) base.push('crowd management corridors');
  return base;
}

function synthesizeProgramAreas(projectType: string, capacity: number): ProgramAreaTarget[] {
  const unit = Math.max(0.7, Math.min(2.4, capacity / 600));
  const common: ProgramAreaTarget[] = [
    { name: 'Lobby', area_m2: Math.round(220 * unit) },
    { name: 'Circulation', area_m2: Math.round(650 * unit) },
    { name: 'Restrooms + Service', area_m2: Math.round(280 * unit) },
  ];

  if (projectType === 'museum') {
    return [
      { name: 'Exhibition Halls', area_m2: Math.round(1900 * unit) },
      { name: 'Auditorium', area_m2: Math.round(700 * unit) },
      { name: 'Storage + Conservation', area_m2: Math.round(350 * unit) },
      ...common,
    ];
  }

  if (projectType === 'office') {
    return [
      { name: 'Work Areas', area_m2: Math.round(1200 * unit) },
      { name: 'Meeting Rooms', area_m2: Math.round(420 * unit) },
      { name: 'Cafeteria', area_m2: Math.round(260 * unit) },
      ...common,
    ];
  }

  return [
    { name: 'Primary Program', area_m2: Math.round(1300 * unit) },
    { name: 'Secondary Program', area_m2: Math.round(700 * unit) },
    ...common,
  ];
}

function styleRules(style?: string): string[] {
  if (!style) return ['balanced materiality', 'contextual massing', 'daylight-first envelope'];
  if (style === 'brutalist') {
    return [
      'exposed concrete and heavy geometric forms',
      'deep recessed openings for shadow',
      'minimal ornament, strong tectonic expression',
    ];
  }
  if (style === 'industrial') {
    return ['honest steel expression', 'modular facade rhythm', 'high clear spans'];
  }
  if (style === 'vernacular') {
    return ['climate-responsive shading', 'local material palette', 'passive ventilation'];
  }
  return ['coherent facade language', 'material continuity', 'human-scale entrances'];
}

function toExecutionPrompt(intent: DesignIntent, programs: ProgramAreaTarget[], rules: string[], constraints: string[]): string {
  const areaLines = programs.map(p => `${p.name}: ${p.area_m2} m2`).join(', ');
  const hardConstraints = constraints.map(c => `- ${c}`).join('\n');
  const styleLine = intent.architectural_style || 'contextual';

  return [
    `Design a ${styleLine} ${intent.project_type} for ${intent.site.location}.`,
    intent.site.dimensions ? `Site: ${intent.site.dimensions[0]}m x ${intent.site.dimensions[1]}m.` : 'Site dimensions: derive from context.',
    intent.capacity ? `Target capacity: ${intent.capacity} users.` : 'Capacity: derive from program.',
    `Functional program: ${intent.functional_program.join(', ')}.`,
    `Program area targets: ${areaLines}.`,
    `Style rules: ${rules.join('; ')}.`,
    `Hard constraints:\n${hardConstraints || '- apply default code compliance constraints'}`,
    'Generate code-aware floor layout entities with circulation, egress, and daylight intent.',
  ].join(' ');
}

function buildCandidateProposals(basePrompt: string, strategies: string[]): CandidateProposal[] {
  return strategies.slice(0, 3).map((strategy, index) => {
    const confidence = Math.max(0.55, 0.88 - index * 0.08);
    return {
      id: hashText(`${basePrompt}|${strategy}|${index}`),
      strategy,
      prompt: `${basePrompt} Preferred massing strategy: ${strategy}. Keep egress and circulation robust for the target occupancy.`,
      confidence: Number(confidence.toFixed(2)),
    };
  });
}

export function runArchflowAIPipeline(input: PipelineInput): PipelineResult {
  const prompt = input.prompt.trim();
  const fallbackLocation = input.project.location || 'unspecified';
  const projectType = inferProjectType(prompt, input.project.buildingType);
  const capacity = parseCapacity(prompt);
  const dimensions = parseSiteDimensions(prompt);
  const location = parseLocation(prompt, fallbackLocation);
  const rules = parseExplicitRules(prompt);
  const archStyle = inferStyle(prompt);
  const functionalProgram = buildFunctionalProgram(projectType, capacity);
  const projectContext = summarizeProjectContext(input.project);
  const auditId = hashText([
    prompt,
    projectType,
    String(capacity || ''),
    String(dimensions?.[0] || ''),
    String(dimensions?.[1] || ''),
    location,
    projectContext.join('|'),
  ].join('|'));

  const intent: DesignIntent = {
    project_type: projectType,
    site: { location, dimensions },
    capacity,
    architectural_style: archStyle,
    functional_program: functionalProgram,
    explicit_rules: rules,
  };

  const stage1: PipelineAuditStage = {
    phase: 'state_analysis',
    module: 'spatial',
    summary: 'Parsed human intent into typed design intent.',
    evidence: [
      `project_type=${intent.project_type}`,
      `location=${intent.site.location}`,
      `capacity=${intent.capacity ?? 'unspecified'}`,
      `explicit_rules=${intent.explicit_rules.length}`,
      ...projectContext,
    ],
    deterministic: true,
    output: { intent, audit_id: auditId },
  };

  const climateHints = /kolkata|mumbai|goa|chennai/i.test(location)
    ? ['humid climate', 'monsoon resilience', 'solar gain control']
    : ['temperate assumptions', 'orientation-driven daylighting'];

  const stage2: PipelineAuditStage = {
    phase: 'context_understanding',
    module: 'environmental',
    summary: 'Built environmental context assumptions and site constraints.',
    evidence: climateHints,
    deterministic: true,
    output: {
      site_dimensions: dimensions,
      location,
      climate_hints: climateHints,
      building_codes_present: Boolean(input.buildingCodes && Object.keys(input.buildingCodes).length > 0),
    },
  };

  const hardConstraints = [
    'egress paths must remain continuous',
    'primary circulation width >= 1800 mm',
    'accessible route from entry to core spaces',
    'service and public paths should be separable',
  ];

  for (const rule of rules) {
    hardConstraints.push(`${rule.key} ${rule.operator} ${rule.rawValue}`);
  }

  const stage3: PipelineAuditStage = {
    phase: 'constraint_evaluation',
    module: 'operational',
    summary: 'Converted explicit and inferred rules into hard constraints.',
    evidence: hardConstraints.slice(0, 6),
    deterministic: true,
    output: {
      hard_constraints: hardConstraints,
      code_keys: Object.keys(input.buildingCodes || {}).slice(0, 8),
      project_context: projectContext,
    },
  };

  const programAreas = synthesizeProgramAreas(projectType, capacity || 300);
  const styleGuidelines = styleRules(archStyle);
  const candidateStrategies = [
    'central courtyard spine',
    'linear gallery bar',
    'stacked block with service core',
    'terraced perimeter massing',
  ];

  const stage4: PipelineAuditStage = {
    phase: 'action_generation',
    module: 'behavioral',
    summary: 'Generated candidate spatial strategies and area program.',
    evidence: candidateStrategies,
    deterministic: true,
    output: {
      candidate_strategies: candidateStrategies,
      program_areas_m2: programAreas,
      style_rules: styleGuidelines,
    },
  };

  const complianceScore = Math.max(0, 100 - rules.length * 2);
  const feasibilityScore = Math.max(0, 92 - Math.max(0, (capacity || 300) - 300) / 40);
  const validation = {
    compliance_score: Number(complianceScore.toFixed(1)),
    feasibility_score: Number(feasibilityScore.toFixed(1)),
    warnings: [
      ...(dimensions ? [] : ['Site dimensions missing; generator will infer extents.']),
      ...((capacity || 0) > 1200 ? ['High occupancy; egress geometry should be reviewed manually.'] : []),
    ],
  };

  const stage5: PipelineAuditStage = {
    phase: 'proposal_validation',
    module: 'reflective',
    summary: 'Scored proposal fitness before geometry execution.',
    evidence: [
      `compliance=${validation.compliance_score}`,
      `feasibility=${validation.feasibility_score}`,
      `warnings=${validation.warnings.length}`,
    ],
    deterministic: true,
    output: validation,
  };

  const executionPrompt = toExecutionPrompt(intent, programAreas, styleGuidelines, hardConstraints);

  const stage6: PipelineAuditStage = {
    phase: 'execution',
    module: 'operational',
    summary: 'Prepared execution payload for geometry/layout generation.',
    evidence: ['execution prompt synthesized', 'design spec attached', 'audit trail complete'],
    deterministic: true,
    output: {
      execution_prompt: executionPrompt,
      design_spec: {
        ...intent,
        style_rules: styleGuidelines,
        program_areas_m2: programAreas,
        candidate_strategies: candidateStrategies,
        project_context: projectContext,
        audit_id: auditId,
      },
    },
  };

  const proposals = buildCandidateProposals(executionPrompt, candidateStrategies);

  return {
    auditId,
    intent,
    stages: [stage1, stage2, stage3, stage4, stage5, stage6],
    designSpec: stage6.output.design_spec as Record<string, unknown>,
    executionPrompt,
    proposals,
  };
}
