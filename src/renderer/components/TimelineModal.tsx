/**
 * タイムラインモーダルコンポーネント
 * 選択ノードからルートまでの会話履歴を表示
 */
import React, { useCallback, useMemo, useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { MindNode, NodeType } from '@shared/types';

interface TimelineModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedNode: MindNode | null;
  selectedNodeId: string | null;
  getNodeById: (id: string) => MindNode | undefined;
  selectNode: (id: string) => void;
}

/**
 * タイムラインモーダル
 */
export const TimelineModal: React.FC<TimelineModalProps> = ({
  isOpen,
  onClose,
  selectedNode,
  selectedNodeId,
  getNodeById,
  selectNode
}) => {
  // モーダル内でハイライトされているノードID（実際の選択とは別）
  const [highlightedNodeId, setHighlightedNodeId] = useState<string | null>(null);

  // モーダルが開いたときにハイライトをリセット
  useEffect(() => {
    if (isOpen) {
      setHighlightedNodeId(null);
    }
  }, [isOpen]);

  /**
   * タイムラインノードを収集（メイン親チェーンをrootまで辿る）
   */
  const timelineNodes = useMemo((): MindNode[] => {
    if (!selectedNode) return [];
    
    const timeline: MindNode[] = [];
    const visited = new Set<string>();
    let current: MindNode | undefined = selectedNode;
    
    while (current && !visited.has(current.id)) {
      visited.add(current.id);
      timeline.unshift(current);
      
      const mainParentId = current.parentIds[0];
      if (mainParentId) {
        current = getNodeById(mainParentId);
      } else {
        break;
      }
    }
    
    return timeline;
  }, [selectedNode, getNodeById]);

  /**
   * ノードをクリックしてハイライト（まだ実際の選択はしない）
   */
  const handleNodeClick = useCallback((nodeId: string) => {
    setHighlightedNodeId(nodeId);
  }, []);

  /**
   * ハイライト中のノードに移動（実際の選択＋モーダルを閉じる）
   */
  const handleNavigateToNode = useCallback(() => {
    if (highlightedNodeId) {
      selectNode(highlightedNodeId);
      onClose();
    }
  }, [highlightedNodeId, selectNode, onClose]);

  /**
   * モーダル背景クリックで閉じる
   */
  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }, [onClose]);

  /**
   * ESCキーで閉じる
   */
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div style={backdropStyle} onClick={handleBackdropClick}>
      <div style={modalStyle}>
        {/* ヘッダー */}
        <div style={headerStyle}>
          <h2 style={{ margin: 0, fontSize: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            🕒 タイムライン
          </h2>
          <button onClick={onClose} style={closeButtonStyle}>
            ✕
          </button>
        </div>

        {/* コンテンツ */}
        <div style={contentStyle}>
          {timelineNodes.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#64748b', padding: '40px' }}>
              ノードを選択してください
            </div>
          ) : (
            <div style={timelineContainerStyle}>
              {timelineNodes.map((node, index) => {
                const isCurrentNode = node.id === selectedNodeId;
                const isHighlighted = node.id === highlightedNodeId;
                return (
                <div
                  key={node.id}
                  style={{
                    ...nodeItemStyle,
                    background: isHighlighted ? '#3b4d6b' : isCurrentNode ? '#334155' : '#1e293b',
                    borderLeft: `4px solid ${getNodeColor(node.type, node.role)}`,
                    cursor: 'pointer',
                    outline: isHighlighted ? '2px solid #6366f1' : 'none',
                    outlineOffset: '-2px'
                  }}
                  onClick={() => handleNodeClick(node.id)}
                >
                  {/* ノードヘッダー */}
                  <div style={nodeHeaderStyle}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '16px' }}>{getNodeTypeIcon(node.type)}</span>
                      <span style={{ color: '#94a3b8', fontSize: '13px' }}>
                        {getNodeTypeLabel(node.type)}
                      </span>
                      {node.role && (
                        <span style={{
                          padding: '2px 8px',
                          background: node.role === 'user' ? '#1e40af' : '#065f46',
                          borderRadius: '4px',
                          fontSize: '11px',
                          fontWeight: 500
                        }}>
                          {node.role === 'user' ? 'ユーザー' : 'AI'}
                        </span>
                      )}
                    </div>
                    <span style={{ color: '#475569', fontSize: '12px' }}>
                      #{index + 1}
                    </span>
                  </div>

                  {/* タイトル */}
                  {node.title && (
                    <div style={nodeTitleStyle}>
                      {node.title}
                    </div>
                  )}

                  {/* 内容 */}
                  <div style={nodeContentStyle}>
                    {node.role === 'assistant' ? (
                      <div className="markdown-content">
                        <ReactMarkdown 
                          remarkPlugins={[remarkGfm]}
                          components={{
                            p: ({children}) => <p style={{ marginBottom: '0.75em' }}>{children}</p>,
                            ul: ({children}) => <ul style={{ marginLeft: '1.5em', marginBottom: '0.75em' }}>{children}</ul>,
                            ol: ({children}) => <ol style={{ marginLeft: '1.5em', marginBottom: '0.75em' }}>{children}</ol>,
                            li: ({children}) => <li style={{ marginBottom: '0.25em' }}>{children}</li>,
                            h1: ({children}) => <h1 style={{ fontSize: '1.3em', fontWeight: 600, marginTop: '0.75em', marginBottom: '0.5em', color: '#f1f5f9' }}>{children}</h1>,
                            h2: ({children}) => <h2 style={{ fontSize: '1.2em', fontWeight: 600, marginTop: '0.75em', marginBottom: '0.5em', color: '#f1f5f9' }}>{children}</h2>,
                            h3: ({children}) => <h3 style={{ fontSize: '1.1em', fontWeight: 600, marginTop: '0.75em', marginBottom: '0.5em', color: '#f1f5f9' }}>{children}</h3>,
                            strong: ({children}) => <strong style={{ fontWeight: 600, color: '#f1f5f9' }}>{children}</strong>,
                            code: ({children}) => <code style={{ background: '#334155', padding: '0.15em 0.4em', borderRadius: '4px', fontFamily: 'monospace', fontSize: '0.9em' }}>{children}</code>,
                          }}
                        >
                          {node.content}
                        </ReactMarkdown>
                      </div>
                    ) : (
                      <div style={{ whiteSpace: 'pre-wrap' }}>
                        {node.content || '(内容なし)'}
                      </div>
                    )}
                  </div>

                  {/* 接続線（最後のノード以外） */}
                  {index < timelineNodes.length - 1 && (
                    <div style={connectorStyle}>
                      <div style={connectorLineStyle} />
                      <span style={{ color: '#475569', fontSize: '12px' }}>↓</span>
                    </div>
                  )}
                </div>
              );})}
            </div>
          )}
        </div>

        {/* フッター */}
        <div style={footerStyle}>
          <span style={{ color: '#64748b', fontSize: '13px' }}>
            {timelineNodes.length} ノード
            {highlightedNodeId && ' • ノードを選択中'}
          </span>
          <div style={{ display: 'flex', gap: '8px' }}>
            {highlightedNodeId && (
              <button 
                onClick={handleNavigateToNode} 
                style={{
                  ...footerButtonStyle,
                  background: '#6366f1'
                }}
              >
                📍 ノードに移動
              </button>
            )}
            <button onClick={onClose} style={footerButtonStyle}>
              閉じる
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

/**
 * ノードタイプに応じたアイコンを返す
 */
function getNodeTypeIcon(type: NodeType): string {
  switch (type) {
    case 'root': return '📌';
    case 'message': return '💬';
    case 'note': return '📝';
    case 'topic': return '💡';
    default: return '📄';
  }
}

/**
 * ノードタイプに応じたラベルを返す
 */
function getNodeTypeLabel(type: NodeType): string {
  switch (type) {
    case 'root': return 'ルート';
    case 'message': return 'メッセージ';
    case 'note': return 'メモ';
    case 'topic': return 'トピック';
    default: return 'ノード';
  }
}

/**
 * ノードタイプとロールに応じた色を返す
 */
function getNodeColor(type: NodeType, role?: string): string {
  switch (type) {
    case 'root': return '#f59e0b';
    case 'message': return role === 'user' ? '#3b82f6' : '#10b981';
    case 'note': return '#a855f7';
    case 'topic': return '#f59e0b';
    default: return '#64748b';
  }
}

// スタイル定義
const backdropStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  background: 'rgba(0, 0, 0, 0.7)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000
};

const modalStyle: React.CSSProperties = {
  background: '#0f172a',
  borderRadius: '12px',
  border: '1px solid #334155',
  width: '90%',
  maxWidth: '800px',
  maxHeight: '85vh',
  display: 'flex',
  flexDirection: 'column',
  boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '16px 20px',
  borderBottom: '1px solid #334155',
  color: 'white'
};

const closeButtonStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: '#94a3b8',
  fontSize: '20px',
  cursor: 'pointer',
  padding: '4px 8px',
  borderRadius: '4px'
};

const contentStyle: React.CSSProperties = {
  flex: 1,
  overflow: 'auto',
  padding: '20px'
};

const timelineContainerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0'
};

const nodeItemStyle: React.CSSProperties = {
  padding: '16px',
  borderRadius: '8px',
  marginBottom: '8px',
  transition: 'background 0.2s'
};

const nodeHeaderStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: '8px'
};

const nodeTitleStyle: React.CSSProperties = {
  fontSize: '15px',
  fontWeight: 600,
  color: '#e2e8f0',
  marginBottom: '8px'
};

const nodeContentStyle: React.CSSProperties = {
  fontSize: '14px',
  color: '#cbd5e1',
  lineHeight: '1.6',
  wordBreak: 'break-word'
};

const connectorStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  padding: '8px 0',
  marginTop: '8px'
};

const connectorLineStyle: React.CSSProperties = {
  width: '2px',
  height: '16px',
  background: '#334155'
};

const footerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '12px 20px',
  borderTop: '1px solid #334155'
};

const footerButtonStyle: React.CSSProperties = {
  padding: '8px 16px',
  borderRadius: '6px',
  border: 'none',
  background: '#334155',
  color: 'white',
  fontSize: '14px',
  cursor: 'pointer'
};
