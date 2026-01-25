/**
 * メッセージノードコンポーネント
 * ユーザーの質問とAIの回答を表示
 */
import React, { memo, useState, useCallback } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { useBoardStore } from '../../stores/boardStore';
import type { MindNode } from '@shared/types';

interface MessageNodeData extends MindNode {
  label: string;
}

/**
 * 質問ノードかどうかを判定
 */
function isQuestionNode(node: MindNode): boolean {
  return node.type === 'message' && node.role === 'user';
}

/**
 * メッセージノード - 質問と回答を表示
 */
export const MessageNode: React.FC<NodeProps> = memo(({ data, selected }) => {
  const nodeData = data as unknown as MessageNodeData;
  const isUser = nodeData.role === 'user';
  const [isHovered, setIsHovered] = useState(false);
  
  const { board, nodes, addNode, selectNode, setPendingFocusNodeId } = useBoardStore();
  
  // 質問ノードの場合は常に複製ボタンを表示
  const showDuplicateButton = isQuestionNode(nodeData);

  /**
   * 質問ノードを複製（確認ダイアログなし）
   */
  const handleDuplicate = useCallback((e: React.MouseEvent) => {
    e.stopPropagation(); // ノードのクリックイベントを止める
    
    if (!board) return;
    
    const duplicatedNode = addNode({
      boardId: board.id,
      type: 'message',
      role: 'user',
      title: nodeData.title || '',
      content: nodeData.content,
      parentIds: nodeData.parentIds,
      createdBy: 'user',
      position: {
        x: nodeData.position.x + 120,
        y: nodeData.position.y + 60
      }
    });
    
    // 複製したノードを選択し、質問入力欄にフォーカス
    selectNode(duplicatedNode.id);
    setPendingFocusNodeId(duplicatedNode.id);
  }, [board, nodeData, addNode, selectNode, setPendingFocusNodeId]);

  return (
    <div
      className={`message-node ${selected ? 'selected' : ''}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        padding: '12px 16px',
        borderRadius: '12px',
        background: isUser 
          ? 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)'
          : 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
        color: 'white',
        fontSize: '14px',
        boxShadow: selected 
          ? `0 0 0 3px ${isUser ? '#bfdbfe' : '#a7f3d0'}, 0 4px 12px rgba(0, 0, 0, 0.15)`
          : '0 4px 12px rgba(0, 0, 0, 0.1)',
        minWidth: '120px',
        maxWidth: '280px',
        cursor: 'pointer',
        transition: 'box-shadow 0.2s ease'
      }}
    >
      <Handle
        type="target"
        position={Position.Top}
        style={{ background: isUser ? '#bfdbfe' : '#a7f3d0', width: 8, height: 8 }}
      />
      
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: '6px',
        marginBottom: '6px',
        fontSize: '12px',
        opacity: 0.9
      }}>
        <span>{isUser ? '💬' : '🤖'}</span>
        <span>{isUser ? 'あなた' : 'AI'}</span>
        {nodeData.model && (
          <span style={{ 
            fontSize: '10px', 
            background: 'rgba(255,255,255,0.2)', 
            padding: '2px 6px', 
            borderRadius: '4px' 
          }}>
            {nodeData.model}
          </span>
        )}
      </div>
      
      {nodeData.title && (
        <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>
          {nodeData.title}
        </div>
      )}
      
      <div style={{ 
        fontSize: '13px',
        lineHeight: '1.4',
        wordBreak: 'break-word'
      }}>
        {nodeData.content.length > 150 
          ? nodeData.content.slice(0, 150) + '...' 
          : nodeData.content}
      </div>

      {/* アクションボタン - ホバー時に表示 */}
      {isHovered && !isUser && (
        <div style={{
          position: 'absolute',
          bottom: '-32px',
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          gap: '4px',
          background: 'rgba(0, 0, 0, 0.8)',
          padding: '4px 6px',
          borderRadius: '6px',
          fontSize: '11px',
          whiteSpace: 'nowrap',
          zIndex: 1000
        }}>
          <span style={{ color: '#94a3b8' }}>サイドパネルで操作</span>
        </div>
      )}

      {/* 複製ボタン - 質問ノードで回答→質問の連鎖がある場合に表示 */}
      {showDuplicateButton && (
        <button
          onClick={handleDuplicate}
          style={{
            position: 'absolute',
            right: '-44px',
            top: '50%',
            transform: 'translateY(-50%)',
            background: '#6366f1',
            border: 'none',
            borderRadius: '6px',
            padding: '6px 8px',
            cursor: 'pointer',
            fontSize: '14px',
            color: 'white',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)',
            zIndex: 1000,
            transition: 'background 0.2s ease'
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = '#4f46e5')}
          onMouseLeave={(e) => (e.currentTarget.style.background = '#6366f1')}
          title="複製して質問"
        >
          📋
        </button>
      )}

      <Handle
        type="source"
        position={Position.Bottom}
        style={{ background: isUser ? '#bfdbfe' : '#a7f3d0', width: 8, height: 8 }}
      />
    </div>
  );
});

MessageNode.displayName = 'MessageNode';
