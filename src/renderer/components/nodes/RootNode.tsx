/**
 * ルートノードコンポーネント
 * ボードの中心に配置されるテーマノード
 */
import React, { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import type { MindNode } from '@shared/types';

interface RootNodeData extends MindNode {
  label: string;
}

/**
 * ルートノード - ボードのテーマを表示
 */
export const RootNode: React.FC<NodeProps> = memo(({ data, selected }) => {
  const nodeData = data as RootNodeData;

  return (
    <div
      className={`root-node ${selected ? 'selected' : ''}`}
      style={{
        padding: '20px 30px',
        borderRadius: '16px',
        background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
        color: 'white',
        fontWeight: 'bold',
        fontSize: '16px',
        boxShadow: selected 
          ? '0 0 0 3px #c7d2fe, 0 4px 20px rgba(99, 102, 241, 0.4)'
          : '0 4px 20px rgba(99, 102, 241, 0.3)',
        minWidth: '150px',
        maxWidth: '300px',
        textAlign: 'center',
        cursor: 'pointer',
        transition: 'box-shadow 0.2s ease'
      }}
    >
      <div style={{ marginBottom: '4px' }}>📌</div>
      <div>{nodeData.title || 'テーマ'}</div>
      {nodeData.content && nodeData.content !== nodeData.title && (
        <div style={{ 
          fontSize: '12px', 
          opacity: 0.8, 
          marginTop: '8px',
          fontWeight: 'normal'
        }}>
          {nodeData.content.length > 100 
            ? nodeData.content.slice(0, 100) + '...' 
            : nodeData.content}
        </div>
      )}
      <Handle
        type="source"
        position={Position.Bottom}
        style={{ background: '#c7d2fe', width: 10, height: 10 }}
      />
    </div>
  );
});

RootNode.displayName = 'RootNode';
