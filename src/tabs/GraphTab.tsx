import React, { useMemo, useState } from 'react';
import { ADFProject } from '../lib/adf';
import { rankDesignNodes } from '../lib/designGraph';

interface Props {
  project: ADFProject;
  onActivateNode: (nodeId: string) => void;
  onCreateVariant: () => void;
  onPromoteNode: (nodeId: string) => void;
  onEditObjective: (nodeId: string) => void;
}

export default function GraphTab({ project, onActivateNode, onCreateVariant, onPromoteNode, onEditObjective }: Props) {
  const graph = project.designGraph;
  const [search, setSearch] = useState('');
  const [tagFilter, setTagFilter] = useState('all');
  const [relationFilter, setRelationFilter] = useState<'all' | 'fork' | 'merge' | 'promote' | 'optimize'>('all');
  const [leftNodeId, setLeftNodeId] = useState<string>('');
  const [rightNodeId, setRightNodeId] = useState<string>('');

  const ranking = useMemo(() => {
    if (!graph) return [];
    return rankDesignNodes(graph);
  }, [graph]);

  const rankingByNode = useMemo(() => {
    return new Map(ranking.map(item => [item.nodeId, item]));
  }, [ranking]);

  const incomingByNode = useMemo(() => {
    const map = new Map<string, string[]>();
    (graph?.edges || []).forEach(edge => {
      const list = map.get(edge.toNodeId) || [];
      list.push(edge.fromNodeId);
      map.set(edge.toNodeId, list);
    });
    return map;
  }, [graph]);

  const relationByNode = useMemo(() => {
    const map = new Map<string, Set<string>>();
    (graph?.edges || []).forEach(edge => {
      const fromSet = map.get(edge.fromNodeId) || new Set<string>();
      fromSet.add(edge.relation);
      map.set(edge.fromNodeId, fromSet);
      const toSet = map.get(edge.toNodeId) || new Set<string>();
      toSet.add(edge.relation);
      map.set(edge.toNodeId, toSet);
    });
    return map;
  }, [graph]);

  const availableTags = useMemo(() => {
    const tags = new Set<string>();
    (graph?.nodes || []).forEach(node => node.tags.forEach(tag => tags.add(tag)));
    return Array.from(tags).sort((a, b) => a.localeCompare(b));
  }, [graph]);

  const filteredNodes = useMemo(() => {
    if (!graph) return [];
    const query = search.trim().toLowerCase();
    return [...graph.nodes]
      .filter(node => {
        const matchesSearch = !query
          || node.name.toLowerCase().includes(query)
          || node.branchId.toLowerCase().includes(query)
          || (node.objective || '').toLowerCase().includes(query)
          || node.tags.some(tag => tag.toLowerCase().includes(query));

        const matchesTag = tagFilter === 'all' || node.tags.includes(tagFilter);
        const matchesRelation = relationFilter === 'all' || (relationByNode.get(node.id)?.has(relationFilter) ?? false);
        return matchesSearch && matchesTag && matchesRelation;
      })
      .sort((a, b) => {
        const aRank = rankingByNode.get(a.id)?.rank || Number.MAX_SAFE_INTEGER;
        const bRank = rankingByNode.get(b.id)?.rank || Number.MAX_SAFE_INTEGER;
        if (aRank !== bRank) return aRank - bRank;
        return a.name.localeCompare(b.name);
      });
  }, [graph, rankingByNode, relationByNode, relationFilter, search, tagFilter]);

  const filteredEdges = useMemo(() => {
    if (!graph) return [];
    const allowedNodes = new Set(filteredNodes.map(node => node.id));
    return graph.edges.filter(edge => {
      const inFilteredSet = allowedNodes.has(edge.fromNodeId) || allowedNodes.has(edge.toNodeId);
      const matchesRelation = relationFilter === 'all' || edge.relation === relationFilter;
      return inFilteredSet && matchesRelation;
    });
  }, [filteredNodes, graph, relationFilter]);

  const nodeDiff = useMemo(() => {
    if (!graph || !leftNodeId || !rightNodeId || leftNodeId === rightNodeId) return null;
    const left = graph.nodes.find(node => node.id === leftNodeId);
    const right = graph.nodes.find(node => node.id === rightNodeId);
    if (!left || !right) return null;

    const leftTags = new Set(left.tags);
    const rightTags = new Set(right.tags);
    const addedTags = right.tags.filter(tag => !leftTags.has(tag));
    const removedTags = left.tags.filter(tag => !rightTags.has(tag));

    const leftMetrics = left.metrics;
    const rightMetrics = right.metrics;
    const warningDelta = (rightMetrics?.constraintWarnings || 0) - (leftMetrics?.constraintWarnings || 0);
    const adjustmentDelta = (rightMetrics?.adjustments || 0) - (leftMetrics?.adjustments || 0);
    const iterationDelta = (rightMetrics?.iterations || 0) - (leftMetrics?.iterations || 0);

    const leftRank = rankingByNode.get(left.id);
    const rightRank = rankingByNode.get(right.id);

    return {
      left,
      right,
      objectiveChanged: (left.objective || '') !== (right.objective || ''),
      addedTags,
      removedTags,
      warningDelta,
      adjustmentDelta,
      iterationDelta,
      scoreDelta: (rightRank?.score || 0) - (leftRank?.score || 0),
      rankDelta: (rightRank?.rank || 0) - (leftRank?.rank || 0),
      leftRank,
      rightRank,
    };
  }, [graph, leftNodeId, rightNodeId, rankingByNode]);

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

        <div style={{ display: 'grid', gap: 6, marginBottom: 10 }}>
          <input
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder="Search by name, objective, branch, tag"
            style={{
              background: 'var(--bg-overlay)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              color: 'var(--text-primary)',
              padding: '6px 8px',
              fontSize: 11,
            }}
          />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            <select
              value={tagFilter}
              onChange={event => setTagFilter(event.target.value)}
              style={{ background: 'var(--bg-overlay)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-primary)', padding: '6px 8px', fontSize: 11 }}
            >
              <option value="all">All Tags</option>
              {availableTags.map(tag => (
                <option key={tag} value={tag}>{tag}</option>
              ))}
            </select>
            <select
              value={relationFilter}
              onChange={event => setRelationFilter(event.target.value as 'all' | 'fork' | 'merge' | 'promote' | 'optimize')}
              style={{ background: 'var(--bg-overlay)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-primary)', padding: '6px 8px', fontSize: 11 }}
            >
              <option value="all">All Relations</option>
              <option value="fork">fork</option>
              <option value="merge">merge</option>
              <option value="promote">promote</option>
              <option value="optimize">optimize</option>
            </select>
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
            Showing {filteredNodes.length} node(s)
          </div>
        </div>

        <div style={{ display: 'grid', gap: 8 }}>
          {filteredNodes.map(node => {
            const active = node.id === graph.activeNodeId;
            const parents = incomingByNode.get(node.id) || [];
            const nodeRank = rankingByNode.get(node.id);
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
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', textAlign: 'right' }}>
                    <div>{active ? 'ACTIVE' : ''}</div>
                    {nodeRank && <div>#{nodeRank.rank} · {Math.round(nodeRank.score)}</div>}
                  </div>
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

                {nodeRank && (
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                    Fitness {Math.round(nodeRank.score)} · Obj {Math.round(nodeRank.objectiveScore)} · Stable {Math.round(nodeRank.stabilityScore)}
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
        <h3 style={{ margin: '0 0 8px 0', fontSize: 13 }}>Graph Diff & Relations</h3>
        <div style={{ border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-overlay)', padding: 10, marginBottom: 12, display: 'grid', gap: 8 }}>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Compare two design nodes</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <select
              value={leftNodeId}
              onChange={event => setLeftNodeId(event.target.value)}
              style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-primary)', padding: '6px 8px', fontSize: 11 }}
            >
              <option value="">Select base node</option>
              {graph.nodes.map(node => (
                <option key={`left-${node.id}`} value={node.id}>{node.name}</option>
              ))}
            </select>
            <select
              value={rightNodeId}
              onChange={event => setRightNodeId(event.target.value)}
              style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-primary)', padding: '6px 8px', fontSize: 11 }}
            >
              <option value="">Select comparison node</option>
              {graph.nodes.map(node => (
                <option key={`right-${node.id}`} value={node.id}>{node.name}</option>
              ))}
            </select>
          </div>

          {!nodeDiff && (
            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
              Select two different nodes to view objective, tags, fitness, and metrics delta.
            </div>
          )}

          {nodeDiff && (
            <div style={{ display: 'grid', gap: 6, fontSize: 10, color: 'var(--text-secondary)' }}>
              <div>{nodeDiff.left.name} -&gt; {nodeDiff.right.name}</div>
              <div>Objective changed: {nodeDiff.objectiveChanged ? 'yes' : 'no'}</div>
              <div>Tags added: {nodeDiff.addedTags.length ? nodeDiff.addedTags.join(', ') : 'none'}</div>
              <div>Tags removed: {nodeDiff.removedTags.length ? nodeDiff.removedTags.join(', ') : 'none'}</div>
              <div>Warnings delta: {nodeDiff.warningDelta > 0 ? '+' : ''}{nodeDiff.warningDelta}</div>
              <div>Adjustments delta: {nodeDiff.adjustmentDelta > 0 ? '+' : ''}{nodeDiff.adjustmentDelta}</div>
              <div>Iterations delta: {nodeDiff.iterationDelta > 0 ? '+' : ''}{nodeDiff.iterationDelta}</div>
              <div>Fitness delta: {nodeDiff.scoreDelta > 0 ? '+' : ''}{Math.round(nodeDiff.scoreDelta)}</div>
              <div>Rank delta: {nodeDiff.rankDelta > 0 ? '+' : ''}{nodeDiff.rankDelta}</div>
            </div>
          )}
        </div>

        <div style={{ display: 'grid', gap: 8 }}>
          {filteredEdges.length === 0 && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>No lineage edges yet. Create a variant to start the graph.</div>
          )}
          {filteredEdges.map(edge => (
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
