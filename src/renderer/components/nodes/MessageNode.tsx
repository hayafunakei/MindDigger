/**
 * メッセージノードコンポーネント
 * ユーザーの質問とAIの回答を表示
 */
import React, { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import type { MindNode } from '@shared/types';

interface MessageNodeData extends MindNode {
  label: string;
}

/**
 * メッセージノード - 質問と回答を表示
 */
export const MessageNode: React.FC<NodeProps> = memo(({ data, selected }) => {
  const nodeData = data as MessageNodeData;
  const isUser = nodeData.role === 'user';

  return (
    <div
      className={`message-node ${selected ? 'selected' : ''}`}
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

      <Handle
        type="source"
        position={Position.Bottom}
        style={{ background: isUser ? '#bfdbfe' : '#a7f3d0', width: 8, height: 8 }}
      />
    </div>
  );
});

MessageNode.displayName = 'MessageNode';
