/**
 * サイドパネルコンポーネント
 * ノード詳細、質問入力、サマリー表示などを提供
 */
import React, { useState, useCallback } from 'react';
import { useBoardStore } from '../stores/boardStore';
import type { MindNode, NodeType, Role } from '@shared/types';

/**
 * サイドパネル
 */
export const SidePanel: React.FC = () => {
  const { board, nodes, selectedNodeId, getNodeById, addNode, updateNode } = useBoardStore();
  const [questionInput, setQuestionInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const selectedNode = selectedNodeId ? getNodeById(selectedNodeId) : null;

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
      {/* ボード情報 */}
      <div style={{ marginBottom: '20px' }}>
        <h3 style={{ margin: '0 0 8px 0', fontSize: '14px', color: '#94a3b8' }}>
          📋 ボード情報
        </h3>
        <div style={{ fontSize: '16px', fontWeight: 'bold' }}>{board.title}</div>
        {board.description && (
          <div style={{ fontSize: '13px', color: '#94a3b8', marginTop: '4px' }}>
            {board.description}
          </div>
        )}
      </div>

      <hr style={{ border: 'none', borderTop: '1px solid #334155', margin: '16px 0' }} />

      {/* 選択ノード情報 */}
      {selectedNode ? (
        <>
          <div style={{ marginBottom: '16px' }}>
            <h3 style={{ margin: '0 0 8px 0', fontSize: '14px', color: '#94a3b8' }}>
              {getNodeTypeIcon(selectedNode.type)} 選択中のノード
            </h3>
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
