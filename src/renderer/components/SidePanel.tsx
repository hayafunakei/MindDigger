/**
 * サイドパネルコンポーネント
 * ノード詳細、質問入力、サマリー表示などを提供
 */
import React, { useState, useCallback, useEffect } from 'react';
import { useBoardStore } from '../stores/boardStore';
import type { MindNode, NodeType, Role } from '@shared/types';

/**
 * サイドパネル
 */
export const SidePanel: React.FC = () => {
  const { board, nodes, selectedNodeId, getNodeById, addNode, updateNode, addSummary, deleteNode } = useBoardStore();
  const [questionInput, setQuestionInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [summary, setSummary] = useState<string>('');
  const [showSummary, setShowSummary] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');

  const selectedNode = selectedNodeId ? getNodeById(selectedNodeId) : null;

  useEffect(() => {
    if (selectedNode) {
      setEditTitle(selectedNode.title || '');
      setEditContent(selectedNode.content || '');
    } else {
      setEditTitle('');
      setEditContent('');
    }
    setIsEditing(false);
  }, [selectedNode]);

  /**
   * 質問を送信
   */
  const handleSendQuestion = useCallback(async () => {
    if (!questionInput.trim() || !selectedNode || !board) return;

    setIsLoading(true);
    try {
      // 質問ノードを作成
      const questionNode = addNode({
        boardId: board.id,
        type: 'message',
        role: 'user',
        title: '',
        content: questionInput.trim(),
        parentIds: [selectedNode.id],
        createdBy: 'user',
        position: {
          x: selectedNode.position.x + 50,
          y: selectedNode.position.y + 150
        }
      });

      // コンテキストを収集
      const contextMessages = collectContext(nodes, selectedNode);
      
      // LLMにリクエスト
      const response = await window.electronAPI.sendLLMRequest({
        provider: board.settings.defaultProvider,
        model: board.settings.defaultModel,
        messages: [
          {
            role: 'system',
            content: `あなたは「${board.title}」というテーマについて、ユーザーの思考を整理する手助けをするアシスタントです。的確で具体的な回答を心がけてください。`
          },
          ...contextMessages,
          {
            role: 'user',
            content: questionInput.trim()
          }
        ],
        temperature: board.settings.temperature
      });

      // 回答ノードを作成
      const qaPairId = `qa-${Date.now()}`;
      addNode({
        boardId: board.id,
        type: 'message',
        role: 'assistant',
        title: '',
        content: response.content,
        parentIds: [questionNode.id],
        provider: board.settings.defaultProvider,
        model: board.settings.defaultModel,
        usage: response.usage,
        createdBy: 'ai',
        position: {
          x: questionNode.position.x,
          y: questionNode.position.y + 150
        },
        qaPairId
      });

      // 質問ノードにもqaPairIdを設定
      updateNode(questionNode.id, { qaPairId });

      setQuestionInput('');
    } catch (error) {
      console.error('Failed to send question:', error);
      alert(`エラーが発生しました: ${error instanceof Error ? error.message : '不明なエラー'}`);
    } finally {
      setIsLoading(false);
    }
  }, [questionInput, selectedNode, board, nodes, addNode, updateNode]);

  /**
   * ノートを作成
   */
  const handleCreateNote = useCallback(() => {
    if (!selectedNode || !board) return;

    addNode({
      boardId: board.id,
      type: 'note',
      role: 'user',
      title: '',
      content: '',
      parentIds: [selectedNode.id],
      createdBy: 'user',
      position: {
        x: selectedNode.position.x + 200,
        y: selectedNode.position.y + 50
      }
    });
  }, [selectedNode, board, addNode]);

  /**
   * AIでノートを生成
   */
  const handleGenerateNote = useCallback(async () => {
    if (!selectedNode || !board) return;

    setIsLoading(true);
    try {
      // コンテキストを収集
      const contextMessages = collectContext(nodes, selectedNode);
      const context = contextMessages.map(m => `${m.role}: ${m.content}`).join('\n\n');

      const noteContent = await window.electronAPI.generateNote({
        content: selectedNode.content,
        context
      });

      addNode({
        boardId: board.id,
        type: 'note',
        role: 'user',
        title: '決定事項',
        content: noteContent,
        parentIds: [selectedNode.id],
        createdBy: 'ai',
        position: {
          x: selectedNode.position.x + 200,
          y: selectedNode.position.y + 50
        },
        metadata: {
          tags: ['decision'],
          importance: 4
        }
      });
    } catch (error) {
      console.error('Failed to generate note:', error);
      alert(`ノート生成に失敗しました: ${error instanceof Error ? error.message : '不明なエラー'}`);
    } finally {
      setIsLoading(false);
    }
  }, [selectedNode, board, nodes, addNode]);

  /**
   * トピックを生成
   */
  const handleGenerateTopics = useCallback(async () => {
    if (!selectedNode || !board) return;

    setIsLoading(true);
    try {
      // コンテキストを収集
      const contextMessages = collectContext(nodes, selectedNode);
      const context = contextMessages.map(m => `${m.role}: ${m.content}`).join('\n\n');

      const topics = await window.electronAPI.generateTopics({
        content: selectedNode.content,
        context,
        maxTopics: 5
      });

      // 生成されたトピックをノードとして追加
      topics.forEach((topic, index) => {
        addNode({
          boardId: board.id,
          type: 'topic',
          role: 'system',
          title: topic.title,
          content: topic.description || topic.title,
          parentIds: [selectedNode.id],
          createdBy: 'ai',
          position: {
            x: selectedNode.position.x + (index - Math.floor(topics.length / 2)) * 150,
            y: selectedNode.position.y + 200
          },
          metadata: {
            importance: topic.importance,
            tags: topic.tags
          }
        });
      });
    } catch (error) {
      console.error('Failed to generate topics:', error);
      alert(`トピック生成に失敗しました: ${error instanceof Error ? error.message : '不明なエラー'}`);
    } finally {
      setIsLoading(false);
    }
  }, [selectedNode, board, nodes, addNode]);

  /**
   * サマリーを生成
   */
  const handleGenerateSummary = useCallback(async (scope: 'board' | 'nodeSubtree') => {
    if (!board) return;

    setIsLoading(true);
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

      const summaryContent = await window.electronAPI.generateSummary({
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
      });

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
    }
  }, [board, nodes, selectedNode, getNodeById, addSummary]);

  /**
   * 選択ノードを編集開始
   */
  const handleStartEdit = useCallback(() => {
    if (!selectedNode) return;
    setIsEditing(true);
    setEditTitle(selectedNode.title || '');
    setEditContent(selectedNode.content || '');
  }, [selectedNode]);

  /**
   * 編集をキャンセル
   */
  const handleCancelEdit = useCallback(() => {
    if (!selectedNode) return;
    setIsEditing(false);
    setEditTitle(selectedNode.title || '');
    setEditContent(selectedNode.content || '');
  }, [selectedNode]);

  /**
   * ノード内容を保存
   */
  const handleSaveEdit = useCallback(() => {
    if (!selectedNode) return;
    updateNode(selectedNode.id, {
      title: editTitle.trim(),
      content: editContent.trim()
    });
    setIsEditing(false);
  }, [selectedNode, editTitle, editContent, updateNode]);

  /**
   * ノードを削除
   */
  const handleDeleteNode = useCallback(() => {
    if (!selectedNode) return;
    if (selectedNode.type === 'root') {
      alert('ルートノードは削除できません');
      return;
    }
    const confirmed = window.confirm('このノードと配下のノードを削除しますか？');
    if (!confirmed) return;
    deleteNode(selectedNode.id);
    setIsEditing(false);
    setEditTitle('');
    setEditContent('');
  }, [selectedNode, deleteNode]);

  if (!board) {
    return (
      <div style={panelStyle}>
        <div style={{ textAlign: 'center', color: '#64748b', padding: '40px 20px' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>🧠</div>
          <h2 style={{ margin: '0 0 8px 0', color: '#e2e8f0' }}>Mind Digger</h2>
          <p style={{ margin: 0, fontSize: '14px' }}>
            ボードを作成または開いて、<br />思考の整理を始めましょう
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={panelStyle}>
      {/* サマリー表示 */}
      {showSummary && (
        <div style={{ marginBottom: '16px' }}>
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
            maxHeight: '300px',
            overflow: 'auto',
            whiteSpace: 'pre-wrap',
            lineHeight: '1.6'
          }}>
            {summary}
          </div>
        </div>
      )}

      {/* サマリー生成ボタン */}
      {!showSummary && (
        <div style={{ marginBottom: '16px' }}>
          <h3 style={{ margin: '0 0 8px 0', fontSize: '14px', color: '#94a3b8' }}>
            📊 サマリー生成
          </h3>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              onClick={() => handleGenerateSummary('board')}
              disabled={isLoading}
              style={{
                ...actionButtonStyle,
                opacity: isLoading ? 0.5 : 1
              }}
            >
              📋 全体
            </button>
            {selectedNode && (
              <button
                onClick={() => handleGenerateSummary('nodeSubtree')}
                disabled={isLoading}
                style={{
                  ...actionButtonStyle,
                  opacity: isLoading ? 0.5 : 1
                }}
              >
                🌳 配下
              </button>
            )}
          </div>
        </div>
      )}

      <hr style={{ border: 'none', borderTop: '1px solid #334155', margin: '16px 0' }} />

      {/* 選択ノード情報 */}
      {selectedNode ? (
        <>
          <div style={{ marginBottom: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <h3 style={{ margin: 0, fontSize: '14px', color: '#94a3b8' }}>
                {getNodeTypeIcon(selectedNode.type)} 選択中のノード
              </h3>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  onClick={handleStartEdit}
                  style={{ ...actionButtonStyle, padding: '6px 10px' }}
                  disabled={isEditing}
                >
                  ✏️ 編集
                </button>
                <button
                  onClick={handleDeleteNode}
                  style={{ ...actionButtonStyle, padding: '6px 10px', background: '#7f1d1d' }}
                  disabled={selectedNode.type === 'root'}
                >
                  🗑️ 削除
                </button>
              </div>
            </div>

            {isEditing ? (
              <div style={{
                padding: '12px',
                background: '#1e293b',
                borderRadius: '8px',
                fontSize: '14px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px'
              }}>
                <input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  placeholder="タイトル"
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: '6px',
                    border: '1px solid #475569',
                    background: '#0f172a',
                    color: 'white',
                    fontSize: '14px'
                  }}
                />
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  placeholder="内容"
                  rows={5}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '6px',
                    border: '1px solid #475569',
                    background: '#0f172a',
                    color: 'white',
                    fontSize: '14px',
                    resize: 'vertical',
                    boxSizing: 'border-box'
                  }}
                />
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                  <button onClick={handleCancelEdit} style={{ ...actionButtonStyle, padding: '6px 12px' }}>
                    キャンセル
                  </button>
                  <button onClick={handleSaveEdit} style={{ ...actionButtonStyle, padding: '6px 12px', background: '#22c55e' }}>
                    保存
                  </button>
                </div>
              </div>
            ) : (
              <div style={{
                padding: '12px',
                background: '#1e293b',
                borderRadius: '8px',
                fontSize: '14px'
              }}>
                <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>
                  {selectedNode.title || getNodeTypeLabel(selectedNode.type)}
                </div>
                <div style={{ 
                  color: '#94a3b8', 
                  fontSize: '13px',
                  maxHeight: '200px',
                  overflow: 'auto'
                }}>
                  {selectedNode.content || '(内容なし)'}
                </div>
              </div>
            )}
          </div>

          {/* アクション */}
          <div style={{ marginBottom: '16px' }}>
            <h3 style={{ margin: '0 0 8px 0', fontSize: '14px', color: '#94a3b8' }}>
              ⚡ アクション
            </h3>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button onClick={handleCreateNote} style={actionButtonStyle}>
                📝 メモを追加
              </button>
              {selectedNode.type === 'message' && selectedNode.role === 'assistant' && (
                <>
                  <button 
                    onClick={handleGenerateTopics} 
                    disabled={isLoading}
                    style={{
                      ...actionButtonStyle,
                      opacity: isLoading ? 0.5 : 1
                    }}
                  >
                    💡 トピック生成
                  </button>
                  <button 
                    onClick={handleGenerateNote} 
                    disabled={isLoading}
                    style={{
                      ...actionButtonStyle,
                      opacity: isLoading ? 0.5 : 1
                    }}
                  >
                    ✨ AI下書き
                  </button>
                </>
              )}
            </div>
          </div>

          <hr style={{ border: 'none', borderTop: '1px solid #334155', margin: '16px 0' }} />

          {/* 質問入力 */}
          <div>
            <h3 style={{ margin: '0 0 8px 0', fontSize: '14px', color: '#94a3b8' }}>
              💬 質問する
            </h3>
            <textarea
              value={questionInput}
              onChange={(e) => setQuestionInput(e.target.value)}
              placeholder="このノードについて質問..."
              rows={4}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '8px',
                border: '1px solid #475569',
                background: '#0f172a',
                color: 'white',
                fontSize: '14px',
                resize: 'vertical',
                boxSizing: 'border-box',
                marginBottom: '8px'
              }}
              disabled={isLoading}
            />
            <button
              onClick={handleSendQuestion}
              disabled={!questionInput.trim() || isLoading}
              style={{
                ...actionButtonStyle,
                width: '100%',
                justifyContent: 'center',
                background: '#6366f1',
                opacity: questionInput.trim() && !isLoading ? 1 : 0.5
              }}
            >
              {isLoading ? '⏳ 送信中...' : '🚀 送信'}
            </button>
          </div>
        </>
      ) : (
        <div style={{ textAlign: 'center', color: '#64748b', padding: '20px' }}>
          <p>ノードを選択してください</p>
        </div>
      )}
    </div>
  );
};

/**
 * コンテキストメッセージを収集する
 * メイン親を辿ってrootまでのチェーンを取得
 */
function collectContext(nodes: MindNode[], startNode: MindNode): Array<{ role: 'user' | 'assistant' | 'system'; content: string }> {
  const messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> = [];
  const visited = new Set<string>();
  
  let current: MindNode | undefined = startNode;
  
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    
    if (current.type === 'message') {
      messages.unshift({
        role: current.role,
        content: current.content
      });
    }
    
    // メイン親を辿る
    const mainParentId = current.parentIds[0];
    if (mainParentId) {
      current = nodes.find((n) => n.id === mainParentId);
    } else {
      break;
    }
  }
  
  return messages;
}

function getNodeTypeIcon(type: NodeType): string {
  switch (type) {
    case 'root': return '📌';
    case 'message': return '💬';
    case 'note': return '📝';
    case 'topic': return '💡';
    default: return '📄';
  }
}

function getNodeTypeLabel(type: NodeType): string {
  switch (type) {
    case 'root': return 'ルート';
    case 'message': return 'メッセージ';
    case 'note': return 'メモ';
    case 'topic': return 'トピック';
    default: return 'ノード';
  }
}

const panelStyle: React.CSSProperties = {
  width: '320px',
  height: '100%',
  background: '#0f172a',
  borderLeft: '1px solid #334155',
  padding: '16px',
  boxSizing: 'border-box',
  overflow: 'auto',
  color: 'white'
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
