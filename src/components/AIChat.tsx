import React, { useState, useRef, useEffect, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { X, Send, Bot, User, Sparkles, Loader, ChevronDown } from 'lucide-react';
import { ADFProject } from '../lib/adf';
import { CandidateProposal, runArchflowAIPipeline } from '../lib/aiPipeline';
import './AIChat.css';

interface Props {
  project: ADFProject;
  onApplyLayout: (layout: Record<string, unknown>) => void;
  onApplyLayoutAsVariant: (layout: Record<string, unknown>) => void;
  onClose: () => void;
  onStatusChange: (s: string) => void;
}

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  layout?: Record<string, unknown>;
  timestamp: Date;
}

const EXAMPLE_PROMPTS = [
  'A 2-bedroom apartment, 80 sqm, modern style, Mumbai',
  'Small office space 120 sqm with open plan and 2 meeting rooms',
  'Brutalist museum in Goa near the beach, 3 floors, 3000 sqm',
  'A cozy café with indoor and outdoor seating, 60 sqm',
  'Contemporary house with courtyard, 4 bedrooms, Delhi',
];

const DEFAULT_OPENROUTER_MODEL = 'openrouter/hunter-alpha';

interface OptionConstraintBadge {
  label: string;
  severity: 'ok' | 'warning' | 'error' | 'info';
}

interface GeneratedOption {
  id: string;
  strategy: string;
  confidence: number;
  score: number;
  layout: Record<string, unknown>;
  badges: OptionConstraintBadge[];
}

function scoreLayout(layout: Record<string, unknown>, confidence: number): number {
  const entities = Array.isArray(layout.entities) ? layout.entities.length : 0;
  const area = typeof layout.total_area === 'number' ? layout.total_area : 0;
  const compactnessPenalty = area > 0 ? Math.min(20, Math.abs(area - 1800) / 120) : 10;
  const richness = Math.min(40, entities / 4);
  const confidenceScore = confidence * 50;
  return Math.max(0, Math.min(100, confidenceScore + richness - compactnessPenalty));
}

function summarizeConversation(messages: Message[]): string {
  const recent = messages.filter(m => m.role === 'user').slice(-3).map(m => m.content.trim()).filter(Boolean);
  if (recent.length === 0) return '';
  return `Conversation context: ${recent.join(' | ')}`;
}

function countEntityTypes(layout: Record<string, unknown>): Record<string, number> {
  const counts: Record<string, number> = {};
  const entities = Array.isArray(layout.entities) ? layout.entities as Array<Record<string, unknown>> : [];
  entities.forEach(entity => {
    const type = String(entity.type || 'unknown');
    counts[type] = (counts[type] || 0) + 1;
  });
  return counts;
}

function evaluateConstraintBadges(
  layout: Record<string, unknown>,
  intent: Record<string, unknown>
): OptionConstraintBadge[] {
  const counts = countEntityTypes(layout);
  const badges: OptionConstraintBadge[] = [];
  const doors = counts.door || 0;
  const windows = counts.window || 0;
  const walls = counts.wall || 0;
  const totalArea = typeof layout.total_area === 'number' ? layout.total_area : 0;
  const capacity = typeof intent.capacity === 'number' ? intent.capacity : 0;

  if (doors <= 0) badges.push({ label: 'No entry door detected', severity: 'error' });
  else badges.push({ label: 'Entry access detected', severity: 'ok' });

  if (windows <= 0) badges.push({ label: 'Low daylight openings', severity: 'warning' });
  else badges.push({ label: `Windows ${windows}`, severity: 'ok' });

  if (walls < 4) badges.push({ label: 'Envelope may be incomplete', severity: 'warning' });
  else badges.push({ label: `Walls ${walls}`, severity: 'ok' });

  if (capacity > 0) {
    const areaPerPerson = totalArea > 0 ? totalArea / capacity : 0;
    if (areaPerPerson > 0 && areaPerPerson < 1.2) badges.push({ label: 'High occupancy density', severity: 'warning' });
    else badges.push({ label: 'Occupancy density acceptable', severity: 'ok' });
  }

  const explicitRules = Array.isArray(intent.explicit_rules) ? intent.explicit_rules as Array<Record<string, unknown>> : [];
  if (explicitRules.length > 0) {
    badges.push({ label: `${explicitRules.length} explicit rule(s) require simulation validation`, severity: 'info' });
  }

  return badges;
}

export default function AIChat({ project, onApplyLayout, onApplyLayoutAsVariant, onClose, onStatusChange }: Props) {
  const [messages, setMessages] = useState<Message[]>([{
    id: 'welcome',
    role: 'assistant',
    content: `I'm your **ArchFlow AI assistant**.\n\nThis workspace now runs a deterministic design pipeline:\n- State Analysis\n- Context Understanding\n- Constraint Evaluation\n- Action Generation\n- Proposal Validation\n- Execution\n\nSupported intelligence modules:\n- Environmental\n- Spatial\n- Behavioral\n- Operational\n- Reflective\n\nDescribe your design intent and optional explicit rules (example: TargetTemperature = 23C).`,
    timestamp: new Date(),
  }]);
  const [inputText, setInputText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [modelName, setModelName] = useState(DEFAULT_OPENROUTER_MODEL);
  const [showSettings, setShowSettings] = useState(false);
  const [generatedOptions, setGeneratedOptions] = useState<GeneratedOption[]>([]);
  const [compareLeftId, setCompareLeftId] = useState('');
  const [compareRightId, setCompareRightId] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  const compareLeft = generatedOptions.find(option => option.id === compareLeftId);
  const compareRight = generatedOptions.find(option => option.id === compareRightId);
  const optionsDiff = useMemo(() => {
    if (!compareLeft || !compareRight || compareLeft.id === compareRight.id) return null;
    const leftArea = typeof compareLeft.layout.total_area === 'number' ? compareLeft.layout.total_area : 0;
    const rightArea = typeof compareRight.layout.total_area === 'number' ? compareRight.layout.total_area : 0;
    const leftEntities = Array.isArray(compareLeft.layout.entities) ? compareLeft.layout.entities.length : 0;
    const rightEntities = Array.isArray(compareRight.layout.entities) ? compareRight.layout.entities.length : 0;
    const leftTypes = countEntityTypes(compareLeft.layout);
    const rightTypes = countEntityTypes(compareRight.layout);
    const keys = Array.from(new Set([...Object.keys(leftTypes), ...Object.keys(rightTypes)])).sort((a, b) => a.localeCompare(b));
    const typeDelta = keys
      .map(key => ({ type: key, delta: (rightTypes[key] || 0) - (leftTypes[key] || 0) }))
      .filter(entry => entry.delta !== 0)
      .slice(0, 6);
    return {
      areaDelta: rightArea - leftArea,
      entityDelta: rightEntities - leftEntities,
      scoreDelta: compareRight.score - compareLeft.score,
      typeDelta,
    };
  }, [compareLeft, compareRight]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const addMessage = (msg: Omit<Message, 'id' | 'timestamp'>) => {
    setMessages(prev => [...prev, { ...msg, id: crypto.randomUUID(), timestamp: new Date() }]);
  };

  const handleSend = async () => {
    const text = inputText.trim();
    if (!text || isGenerating) return;
    setInputText('');
    addMessage({ role: 'user', content: text });
    setIsGenerating(true);
    onStatusChange('AI pipeline is processing design intent…');

    try {
      const locationHintMatch = text.match(/(?:in|near|at)\s+([a-zA-Z\s,]+?)(?:\.|,|for|with|on|$)/i);
      const locationHint = locationHintMatch?.[1]?.trim();
      let buildingCodes: Record<string, unknown> | undefined;

      if (locationHint) {
        addMessage({ role: 'assistant', content: `Detected location context: **${locationHint}**\nRetrieving code references for hard-constraint seeding.` });
        try {
          const codes = await invoke<Record<string, unknown>>('get_building_codes', { location: locationHint });
          buildingCodes = (codes?.codes as Record<string, unknown>) || codes;
          const keys = Object.keys(buildingCodes || {}).slice(0, 8);
          if (keys.length > 0) {
            addMessage({ role: 'assistant', content: `Building-code context loaded: ${keys.join(', ')}` });
          }
        } catch {
          addMessage({ role: 'assistant', content: 'Building-code retrieval unavailable for this location; using default constraint set.' });
        }
      }

      const pipeline = runArchflowAIPipeline({
        prompt: `${summarizeConversation(messages)}\nCurrent request: ${text}`.trim(),
        project,
        buildingCodes,
      });

      const stageSummary = pipeline.stages
        .map(stage => `${stage.phase} [${stage.module}] -> ${stage.summary}`)
        .join('\n');

      addMessage({
        role: 'assistant',
        content: `Pipeline audit trail:\n${stageSummary}`,
      });

      const toolNames = pipeline.activatedToolIds
        .map(id => pipeline.toolRegistry.find(tool => tool.id === id)?.name || id)
        .join(', ');
      addMessage({
        role: 'assistant',
        content: `Activated AI tools: ${toolNames}`,
      });

      const designSpecPreview = JSON.stringify(pipeline.designSpec, null, 2).slice(0, 900);
      addMessage({
        role: 'assistant',
        content: `Structured design specification:\n${designSpecPreview}`,
      });

      const selectedProposals: CandidateProposal[] = (apiKey ? pipeline.proposals : pipeline.proposals.slice(0, 1));
      addMessage({ role: 'assistant', content: `Execution phase: generating ${selectedProposals.length} design option(s) and ranking them.` });

      const generated: Array<{
        proposal: CandidateProposal;
        layout: Record<string, unknown>;
        wrappedLayout: Record<string, unknown>;
        score: number;
      }> = [];

      for (const proposal of selectedProposals) {
        try {
          const layout = await invoke<Record<string, unknown>>('generate_floor_plan_ai', {
            prompt: proposal.prompt,
            apiKey: apiKey || null,
            model: modelName || DEFAULT_OPENROUTER_MODEL,
          });

          const score = scoreLayout(layout, proposal.confidence);
          const wrappedLayout: Record<string, unknown> = {
            ...layout,
            ai_pipeline: {
              audit_id: pipeline.auditId,
              stages: pipeline.stages,
              design_spec: pipeline.designSpec,
              execution_prompt: proposal.prompt,
              proposal,
              score,
            },
          };
          generated.push({ proposal, layout, wrappedLayout, score });
        } catch {
          addMessage({ role: 'assistant', content: `Option failed for strategy: ${proposal.strategy}. Continuing with remaining proposals.` });
        }
      }

      if (generated.length === 0) {
        throw new Error('All candidate proposal generations failed.');
      }

      generated.sort((a, b) => b.score - a.score);
      const enrichedOptions: GeneratedOption[] = generated.map(option => ({
        id: option.proposal.id,
        strategy: option.proposal.strategy,
        confidence: option.proposal.confidence,
        score: option.score,
        layout: option.wrappedLayout,
        badges: evaluateConstraintBadges(option.layout, pipeline.intent as unknown as Record<string, unknown>),
      }));
      setGeneratedOptions(enrichedOptions);
      if (enrichedOptions.length > 0) {
        setCompareLeftId(enrichedOptions[0].id);
        setCompareRightId(enrichedOptions[Math.min(1, enrichedOptions.length - 1)].id);
      }

      generated.forEach((option, index) => {
        const entityCount = (option.layout.entities as unknown[])?.length ?? 0;
        const area = typeof option.layout.total_area === 'number' ? option.layout.total_area.toFixed(0) : '?';
        const recommendation = index === 0 ? ' (recommended)' : '';
        const badges = evaluateConstraintBadges(option.layout, pipeline.intent as unknown as Record<string, unknown>);
        const badgeLine = badges.map(b => `[${b.severity.toUpperCase()}] ${b.label}`).join(' | ');
        addMessage({
          role: 'assistant',
          content: `Option ${index + 1}${recommendation}\n- Strategy: ${option.proposal.strategy}\n- Score: ${option.score.toFixed(1)}\n- Entities: ${entityCount}\n- Area: ${area} m2\n- Confidence: ${option.proposal.confidence}\n- Constraint badges: ${badgeLine}\n\nUse Apply for direct update, or Apply as Variant to branch this option in the Design Graph.`,
          layout: option.wrappedLayout,
        });
      });

      onStatusChange(`AI copilot complete — ${generated.length} ranked option(s) ready`);
    } catch (err) {
      addMessage({ role: 'assistant', content: `❌ Error generating floor plan: ${err}\n\nPlease try again or simplify your prompt.` });
      onStatusChange('AI generation failed');
    }
    setIsGenerating(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const renderMessageContent = (content: string) => {
    // Basic markdown-like rendering
    return content.split('\n').map((line, i) => {
      if (line.startsWith('**') && line.endsWith('**')) {
        return <p key={i} style={{ fontWeight: 700, margin: '4px 0' }}>{line.replace(/\*\*/g, '')}</p>;
      }
      if (line.startsWith('- ')) {
        return <div key={i} style={{ display:'flex', gap:6, margin:'2px 0' }}>
          <span style={{ color:'var(--accent)' }}>•</span>
          <span dangerouslySetInnerHTML={{ __html: line.slice(2).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>') }}/>
        </div>;
      }
      if (line.startsWith('```')) return <div key={i} />;
      if (line.startsWith('*') && line.endsWith('*')) {
        return <p key={i} style={{ fontStyle:'italic', color:'var(--text-secondary)', margin:'2px 0' }}>{line.replace(/\*/g, '')}</p>;
      }
      return <p key={i} dangerouslySetInnerHTML={{ __html: line.replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>').replace(/`(.+?)`/g,'<code style="background:var(--bg-overlay);padding:1px 4px;border-radius:3px;font-size:11px">$1</code>') }} style={{ margin: '2px 0' }} />;
    });
  };

  return (
    <div className="ai-chat-panel">
      {/* Header */}
      <div className="ai-chat-header">
        <div className="ai-chat-title">
          <div className="ai-badge"><Sparkles size={11}/></div>
          <span>AI Design Assistant</span>
        </div>
        <div style={{ display:'flex', gap:4 }}>
          <button className="btn ghost icon-only" title="Settings" onClick={() => setShowSettings(v => !v)}>
            <ChevronDown size={12}/>
          </button>
          <button className="btn ghost icon-only" onClick={onClose}><X size={13}/></button>
        </div>
      </div>

      {/* Settings panel */}
      {showSettings && (
        <div className="ai-settings slide-in">
          <div className="label">OpenAI API Key (optional)</div>
          <input type="password" placeholder="sk-…" value={apiKey}
            onChange={e => setApiKey(e.target.value)}
          />
          <div className="label" style={{ marginTop: 8 }}>Model</div>
          <input type="text" placeholder="openrouter/hunter-alpha" value={modelName}
            onChange={e => setModelName(e.target.value)}
          />
          <div style={{ fontSize: 10, color:'var(--text-muted)', marginTop: 4 }}>
            Without a key, ArchFlow uses its built-in layout engine. Add an OpenAI key for more sophisticated AI-generated plans.
          </div>
        </div>
      )}

      {/* Example prompts */}
      {messages.length <= 1 && (
        <div className="ai-examples">
          {EXAMPLE_PROMPTS.map(p => (
            <button key={p} className="ai-example-chip" onClick={() => setInputText(p)}>
              {p}
            </button>
          ))}
        </div>
      )}

      {/* Messages */}
      <div className="ai-messages">
        {generatedOptions.length > 1 && (
          <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10, marginBottom: 8, background: 'var(--bg-overlay)' }}>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 6 }}>
              Diff view between AI options
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 6 }}>
              <select value={compareLeftId} onChange={e => setCompareLeftId(e.target.value)}>
                {generatedOptions.map(option => (
                  <option key={`left-${option.id}`} value={option.id}>
                    {option.strategy} · score {option.score.toFixed(1)}
                  </option>
                ))}
              </select>
              <select value={compareRightId} onChange={e => setCompareRightId(e.target.value)}>
                {generatedOptions.map(option => (
                  <option key={`right-${option.id}`} value={option.id}>
                    {option.strategy} · score {option.score.toFixed(1)}
                  </option>
                ))}
              </select>
            </div>
            {optionsDiff ? (
              <div style={{ fontSize: 10, color: 'var(--text-muted)', display: 'grid', gap: 4 }}>
                <div>Score delta: {optionsDiff.scoreDelta > 0 ? '+' : ''}{optionsDiff.scoreDelta.toFixed(1)}</div>
                <div>Entity delta: {optionsDiff.entityDelta > 0 ? '+' : ''}{optionsDiff.entityDelta}</div>
                <div>Area delta: {optionsDiff.areaDelta > 0 ? '+' : ''}{optionsDiff.areaDelta.toFixed(1)} m2</div>
                <div>Type delta: {optionsDiff.typeDelta.length ? optionsDiff.typeDelta.map(entry => `${entry.type} ${entry.delta > 0 ? '+' : ''}${entry.delta}`).join(', ') : 'no significant change'}</div>
              </div>
            ) : (
              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Pick two different options for diff insights.</div>
            )}
          </div>
        )}

        {messages.map(msg => (
          <div key={msg.id} className={`ai-msg ai-msg-${msg.role}`}>
            <div className="ai-msg-avatar">
              {msg.role === 'assistant' ? <Bot size={13}/> : <User size={13}/>}
            </div>
            <div className="ai-msg-body">
              <div className="ai-msg-content">
                {renderMessageContent(msg.content)}
              </div>
              {msg.layout && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                  <button className="btn primary" style={{ fontSize: 11 }}
                    onClick={() => { onApplyLayout(msg.layout!); onStatusChange('AI layout applied to Plans tab'); }}>
                    <Sparkles size={11}/> Apply to Plans Tab
                  </button>
                  <button className="btn ghost" style={{ fontSize: 11 }}
                    onClick={() => { onApplyLayoutAsVariant(msg.layout!); onStatusChange('AI option applied as a new design graph variant'); }}>
                    <Sparkles size={11}/> Apply as Variant
                  </button>
                </div>
              )}
              <div className="ai-msg-time">
                {msg.timestamp.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })}
              </div>
            </div>
          </div>
        ))}
        {isGenerating && (
          <div className="ai-msg ai-msg-assistant">
            <div className="ai-msg-avatar"><Bot size={13}/></div>
            <div className="ai-msg-body">
              <div className="ai-typing">
                <span/><span/><span/>
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef}/>
      </div>

      {/* Input */}
      <div className="ai-input-area">
        <textarea
          className="ai-input"
          placeholder="Describe your building… (Enter to send)"
          value={inputText}
          onChange={e => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={3}
          disabled={isGenerating}
        />
        <button className="btn primary ai-send-btn" onClick={handleSend} disabled={isGenerating || !inputText.trim()}>
          {isGenerating ? <Loader size={13} className="pulse"/> : <Send size={13}/>}
        </button>
      </div>
    </div>
  );
}
