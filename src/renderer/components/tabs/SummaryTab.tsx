/**
 * サマリータブコンポーネント
 * サマリーの生成・表示を担当
 */
import React, { useState, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useBoardStore } from '../../stores/boardStore';
import type { MindNode, NodeId } from '@shared/types';

interface SummaryTabProps {
  /** AI応答中フラグ（外部からの制御用） */
  isAiResponding: boolean;
  /** AI応答中フラグを設定 */
  setIsAiResponding: (responding: boolean) => void;
}

/**
 * サマリータブ
 * ボード全体または選択ノード配下のサマリーを生成・表示する
 */
export const SummaryTab: React.FC<SummaryTabProps> = ({
  isAiResponding,
  setIsAiResponding
}) => {
  const { 
    board, 
    nodes, 
    selectedNodeId,
    getNodeById, 
    addSummary 
  } = useBoardStore();

  const [summary, setSummary] = useState<string>('');
  const [showSummary, setShowSummary] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const selectedNode = selectedNodeId ? getNodeById(selectedNodeId) : null;

  /**
   * サマリーを生成
   */
  const handleGenerateSummary = useCallback(async (scope: 'board' | 'nodeSubtree') => {
    if (!board) return;

    setIsLoading(true);
    setIsAiResponding(true);
    try {
      // ノード情報を収集
      let targetNodes: MindNode[] = [];
      
      if (scope === 'board') {
        targetNodes = nodes.filter(n => n.type !== 'root');
      } else if (scope === 'nodeSubtree' && selectedNode) {
        // 選択ノード配下を収集（DFS）
        const collectSubtree = (nodeId: string, visited = new Set<string>()): MindNode[] => {
          if (visited.has(nodeId)) return [];
          visited.add(nodeId);
          
          const node = getNodeById(nodeId);
          if (!node) return [];
          
          const result = [node];
          node.childrenIds.forEach(childId => {
            result.push(...collectSubtree(childId, visited));
          });
          
          return result;
        };
        
        targetNodes = collectSubtree(selectedNode.id);
      }

      const summaryRequest = {
        boardId: board.id,
        scope,
        targetNodeId: scope === 'nodeSubtree' ? selectedNode?.id : undefined,
        nodes: targetNodes.map(n => ({
          id: n.id,
          type: n.type,
          role: n.role,
          title: n.title,
          content: n.content,
          importance: n.metadata?.importance,
          pin: n.metadata?.pin,
          tags: n.metadata?.tags
        }))
      };

      // デバッグ用: LLMに渡すサマリーリクエストをログ出力
      console.group('📋 Summary Generation Request');
      console.log('Scope:', scope);
      console.log('Target Node ID:', summaryRequest.targetNodeId);
      console.log('Total Nodes:', summaryRequest.nodes.length);
      console.table(summaryRequest.nodes.map(n => ({
        id: n.id.substring(0, 8) + '...',
        type: n.type,
        role: n.role || '-',
        title: n.title?.substring(0, 30) || '-',
        content: n.content.substring(0, 50) + (n.content.length > 50 ? '...' : ''),
        importance: n.importance ?? '-',
        pin: n.pin ? '📌' : '-',
        tags: n.tags?.join(',') || '-'
      })));
      console.log('Full Request:', summaryRequest);
      console.groupEnd();

      const summaryContent = await window.electronAPI.generateSummary(summaryRequest);

      setSummary(summaryContent);
      setShowSummary(true);

      // サマリーをストアに保存
      addSummary({
        boardId: board.id,
        scope,
        targetNodeId: scope === 'nodeSubtree' ? selectedNode?.id : undefined,
        content: summaryContent,
        provider: board.settings.defaultProvider,
        model: board.settings.defaultModel
      });
    } catch (error) {
      console.error('Failed to generate summary:', error);
      alert(`サマリー生成に失敗しました: ${error instanceof Error ? error.message : '不明なエラー'}`);
    } finally {
      setIsLoading(false);
      setIsAiResponding(false);
    }
  }, [board, nodes, selectedNode, getNodeById, addSummary, setIsAiResponding]);

  if (!board) {
    return (
      <div style={{ textAlign: 'center', color: '#64748b', padding: '20px' }}>
        <p>ボードを開いてください</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* サマリー表示 */}
      {showSummary && (
        <div>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '8px'
          }}>
            <h3 style={{ margin: 0, fontSize: '14px', color: '#94a3b8' }}>
              📊 サマリー
            </h3>
            <button
              onClick={() => setShowSummary(false)}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#64748b',
                fontSize: '18px',
                cursor: 'pointer',
                padding: '0'
              }}
            >
              ×
            </button>
          </div>
          <div style={{
            padding: '12px',
            background: '#1e293b',
            borderRadius: '8px',
            fontSize: '13px',
            maxHeight: '500px',
            overflow: 'auto',
            lineHeight: '1.6'
          }}>
            <div className="markdown-content" style={{ color: '#e2e8f0' }}>
              <ReactMarkdown 
                remarkPlugins={[remarkGfm]}
                components={{
                  p: ({children}) => <p style={{ marginBottom: '0.75em' }}>{children}</p>,
                  ul: ({children}) => <ul style={{ marginLeft: '1.5em', marginBottom: '0.75em' }}>{children}</ul>,
                  ol: ({children}) => <ol style={{ marginLeft: '1.5em', marginBottom: '0.75em' }}>{children}</ol>,
                  li: ({children}) => <li style={{ marginBottom: '0.25em' }}>{children}</li>,
                  h1: ({children}) => <h1 style={{ fontSize: '1.5em', fontWeight: 600, marginTop: '1em', marginBottom: '0.5em', color: '#f1f5f9' }}>{children}</h1>,
                  h2: ({children}) => <h2 style={{ fontSize: '1.3em', fontWeight: 600, marginTop: '1em', marginBottom: '0.5em', color: '#f1f5f9' }}>{children}</h2>,
                  h3: ({children}) => <h3 style={{ fontSize: '1.15em', fontWeight: 600, marginTop: '1em', marginBottom: '0.5em', color: '#f1f5f9' }}>{children}</h3>,
                  strong: ({children}) => <strong style={{ fontWeight: 600, color: '#f1f5f9' }}>{children}</strong>,
                  code: ({children}) => <code style={{ background: '#334155', padding: '0.15em 0.4em', borderRadius: '4px', fontFamily: 'monospace', fontSize: '0.9em' }}>{children}</code>,
                }}
              >
                {summary}
              </ReactMarkdown>
            </div>
          </div>
        </div>
      )}

      {/* サマリー生成ボタン */}
      <div>
        <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#94a3b8' }}>
          📊 サマリー生成
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <button
            onClick={() => handleGenerateSummary('board')}
            disabled={isLoading || isAiResponding}
            style={{
              ...actionButtonStyle,
              width: '100%',
              justifyContent: 'center',
              padding: '12px',
              opacity: (isLoading || isAiResponding) ? 0.5 : 1
            }}
          >
            {isLoading ? '⏳ 生成中...' : '📋 ボード全体のサマリー'}
          </button>
          <button
            onClick={() => handleGenerateSummary('nodeSubtree')}
            disabled={isLoading || isAiResponding || !selectedNode}
            style={{
              ...actionButtonStyle,
              width: '100%',
              justifyContent: 'center',
              padding: '12px',
              opacity: (isLoading || isAiResponding || !selectedNode) ? 0.5 : 1
            }}
          >
            {isLoading ? '⏳ 生成中...' : '🌳 選択ノード配下のサマリー'}
          </button>
          {!selectedNode && (
            <div style={{
              fontSize: '12px',
              color: '#64748b',
              textAlign: 'center',
              padding: '8px'
            }}>
              ノードを選択すると、その配下のサマリーを生成できます
            </div>
          )}
        </div>
      </div>

      {/* 使い方ガイド */}
      <div style={{
        padding: '12px',
        background: '#1e293b',
        borderRadius: '8px',
        fontSize: '12px',
        color: '#94a3b8',
        lineHeight: '1.6'
      }}>
        <h4 style={{ margin: '0 0 8px 0', color: '#e2e8f0', fontSize: '13px' }}>💡 サマリー機能について</h4>
        <ul style={{ margin: 0, paddingLeft: '16px' }}>
          <li><strong>ボード全体</strong>: 全ノードから重要な論点・決定事項・課題を抽出</li>
          <li><strong>ノード配下</strong>: 選択ノード以下の議論を要約</li>
        </ul>
        <div style={{ marginTop: '8px', color: '#64748b' }}>
          ※ ピン留め・重要度の高いノードが優先的にサマリーに含まれます
        </div>
      </div>
    </div>
  );
};

const actionButtonStyle: React.CSSProperties = {
  padding: '8px 12px',
  borderRadius: '6px',
  border: 'none',
  background: '#334155',
  color: 'white',
  fontSize: '13px',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: '4px'
};
