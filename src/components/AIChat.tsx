import React, { useState, useRef, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { X, Send, Bot, User, Sparkles, Loader, ChevronDown } from 'lucide-react';
import { ADFProject } from '../lib/adf';
import { runArchflowAIPipeline } from '../lib/aiPipeline';
import './AIChat.css';

interface Props {
  project: ADFProject;
  onApplyLayout: (layout: Record<string, unknown>) => void;
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

export default function AIChat({ project, onApplyLayout, onClose, onStatusChange }: Props) {
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
  const bottomRef = useRef<HTMLDivElement>(null);

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
        prompt: text,
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

      const designSpecPreview = JSON.stringify(pipeline.designSpec, null, 2).slice(0, 900);
      addMessage({
        role: 'assistant',
        content: `Structured design specification:\n${designSpecPreview}`,
      });

      addMessage({ role: 'assistant', content: 'Execution phase: generating geometry proposal from validated design spec.' });

      const layout = await invoke<Record<string, unknown>>('generate_floor_plan_ai', {
        prompt: pipeline.executionPrompt,
        apiKey: apiKey || null,
        model: modelName || DEFAULT_OPENROUTER_MODEL,
      });

      const wrappedLayout: Record<string, unknown> = {
        ...layout,
        ai_pipeline: {
          stages: pipeline.stages,
          design_spec: pipeline.designSpec,
          execution_prompt: pipeline.executionPrompt,
        },
      };

      const entityCount = (layout.entities as unknown[])?.length ?? 0;
      const area = typeof layout.total_area === 'number' ? layout.total_area.toFixed(0) : '?';

      addMessage({
        role: 'assistant',
        content: `Floor plan generated from the multi-stage pipeline.\n\n- ${entityCount} entities created\n- Approx. area: ${area} m2\n- Building type: ${layout.building_type || 'General'}\n\nReview in the Plans tab, then iterate with targeted prompts (daylight, height, circulation, energy).`,
        layout: wrappedLayout,
      });
      onStatusChange('AI pipeline complete — proposal ready in Plans tab');
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
                <button className="btn primary" style={{ marginTop: 8, fontSize: 11 }}
                  onClick={() => { onApplyLayout(msg.layout!); onStatusChange('AI layout applied to Plans tab'); }}>
                  <Sparkles size={11}/> Apply to Plans Tab
                </button>
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
