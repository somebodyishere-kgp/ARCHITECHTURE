import React, { useMemo } from 'react';
import { ADFProject } from '../lib/adf';

interface Props {
  project: ADFProject;
  onActivateNode: (nodeId: string) => void;
  onCreateVariant: () => void;
  onPromoteNode: (nodeId: string) => void;
  onEditObjective: (nodeId: string) => void;
}

export default function GraphTab({ project, onActivateNode, onCreateVariant, onPromoteNode, onEditObjective }: Props) {
  const graph = project.designGraph;

  const incomingByNode = useMemo(() => {
    const map = new Map<string, string[]>();
    (graph?.edges || []).forEach(edge => {
      const list = map.get(edge.toNodeId) || [];
      list.push(edge.fromNodeId);
      map.set(edge.toNodeId, list);
    });
    return map;
  }, [graph]);

  if (!graph) {
    return <div style={{ padding: 16, color: 'var(--text-muted)' }}>Design graph not initialized.</div>;
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 0, width: '100%', height: '100%' }}>
      <aside style={{ borderRight: '1px solid var(--border)', background: 'var(--bg-surface)', padding: 12, overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <strong style={{ fontSize: 13, color: 'var(--text-primary)' }}>Infinite Design Graph</strong>
          <button className="btn ghost" onClick={onCreateVariant}>Variant+</button>
        </div>

        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10 }}>
          Nodes {graph.nodes.length} · Edges {graph.edges.length}
        </div>

        <div style={{ display: 'grid', gap: 8 }}>
          {graph.nodes.map(node => {
            const active = node.id === graph.activeNodeId;
            const parents = incomingByNode.get(node.id) || [];
            return (
              <div key={node.id}
                style={{
                  border: active ? '1px solid rgba(88,166,255,0.7)' : '1px solid var(--border)',
                  background: active ? 'rgba(88,166,255,0.08)' : 'var(--bg-overlay)',
                  borderRadius: 8,
                  padding: 8,
                  display: 'grid',
                  gap: 6,
                }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <div>
                    <div style={{ fontSize: 12, color: 'var(--text-primary)' }}>{node.name}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Branch {node.branchId}</div>
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{active ? 'ACTIVE' : ''}</div>
                </div>

                <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
                  Objective: {node.objective || 'Unspecified'}
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {node.tags.map(tag => (
                    <span key={`${node.id}-${tag}`} style={{ fontSize: 9, color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: 4, padding: '1px 4px' }}>
                      {tag}
                    </span>
                  ))}
                </div>

                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                  Parents: {parents.length}
                </div>

                {node.metrics && (
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                    Warnings {node.metrics.constraintWarnings} · Adjust {node.metrics.adjustments} · Iters {node.metrics.iterations}
                  </div>
                )}

                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn ghost" onClick={() => onActivateNode(node.id)}>Open</button>
                  <button className="btn ghost" onClick={() => onPromoteNode(node.id)}>Promote</button>
                  <button className="btn ghost" onClick={() => onEditObjective(node.id)}>Objective</button>
                </div>
              </div>
            );
          })}
        </div>
      </aside>

      <section style={{ padding: 14, overflow: 'auto' }}>
        <h3 style={{ margin: '0 0 8px 0', fontSize: 13 }}>Graph Relations</h3>
        <div style={{ display: 'grid', gap: 8 }}>
          {graph.edges.length === 0 && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>No lineage edges yet. Create a variant to start the graph.</div>
          )}
          {graph.edges.map(edge => (
            <div key={edge.id} style={{ border: '1px solid var(--border)', background: 'var(--bg-overlay)', borderRadius: 6, padding: '6px 8px', fontSize: 11, color: 'var(--text-secondary)' }}>
              <div>
                {edge.fromNodeId} -&gt; {edge.toNodeId}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                {edge.relation} · {new Date(edge.createdAt).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
