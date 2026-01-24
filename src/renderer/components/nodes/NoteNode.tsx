/**
 * ノートノードコンポーネント
 * 決定事項やメモを表示
 */
import React, { memo, useState } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import type { MindNode } from '@shared/types';

interface NoteNodeData extends MindNode {
  label: string;
}

/**
 * ノートノード - 決定事項やメモを表示
 */
export const NoteNode: React.FC<NodeProps> = memo(({ data, selected }) => {
  const nodeData = data as unknown as NoteNodeData;
  const isPinned = nodeData.metadata?.pin;
  const importance = nodeData.metadata?.importance || 3;
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      className={`note-node ${selected ? 'selected' : ''}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        padding: '12px 16px',
        borderRadius: '8px',
        background: isPinned 
          ? 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)'
          : 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)',
        color: '#78350f',
        fontSize: '14px',
        boxShadow: selected 
          ? '0 0 0 3px #fde68a, 0 4px 12px rgba(245, 158, 11, 0.3)'
          : '0 4px 12px rgba(245, 158, 11, 0.2)',
        minWidth: '100px',
        maxWidth: '250px',
        cursor: 'pointer',
        transition: 'box-shadow 0.2s ease',
        position: 'relative'
      }}
    >
      <Handle
        type="target"
        position={Position.Top}
        style={{ background: '#fde68a', width: 8, height: 8 }}
      />
      
      {isPinned && (
        <div style={{
          position: 'absolute',
          top: '-8px',
          right: '-8px',
          background: '#dc2626',
          color: 'white',
          borderRadius: '50%',
          width: '20px',
          height: '20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '10px'
        }}>
          📌
        </div>
      )}
      
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: '6px',
        marginBottom: '6px',
        fontSize: '12px',
        fontWeight: 'bold'
      }}>
        <span>📝</span>
        <span>メモ</span>
        {importance >= 4 && (
          <span style={{ color: '#78350f' }}>
            {'★'.repeat(importance - 3)}
          </span>
        )}
        {nodeData.metadata?.tags?.includes('decision') && (
          <span style={{ 
            fontSize: '10px', 
            background: 'rgba(0,0,0,0.1)', 
            padding: '2px 6px', 
            borderRadius: '4px' 
          }}>
            決定事項
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
        {nodeData.content.length > 120 
          ? nodeData.content.slice(0, 120) + '...' 
          : nodeData.content}
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        style={{ background: '#fde68a', width: 8, height: 8 }}
      />
    </div>
  );
});

NoteNode.displayName = 'NoteNode';
