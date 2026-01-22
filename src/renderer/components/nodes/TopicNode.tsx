/**
 * トピックノードコンポーネント
 * まだ質問にしていない論点や検討すべき観点を表示
 */
import React, { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import type { MindNode } from '@shared/types';

interface TopicNodeData extends MindNode {
  label: string;
}

/**
 * トピックノード - 検討すべき論点を表示
 */
export const TopicNode: React.FC<NodeProps> = memo(({ data, selected }) => {
  const nodeData = data as TopicNodeData;
  const importance = nodeData.metadata?.importance || 3;

  return (
    <div
      className={`topic-node ${selected ? 'selected' : ''}`}
      style={{
        padding: '10px 14px',
        borderRadius: '20px',
        background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
        color: 'white',
        fontSize: '13px',
        boxShadow: selected 
          ? '0 0 0 3px #ddd6fe, 0 4px 12px rgba(139, 92, 246, 0.3)'
          : '0 4px 12px rgba(139, 92, 246, 0.2)',
        minWidth: '80px',
        maxWidth: '200px',
        cursor: 'pointer',
        transition: 'box-shadow 0.2s ease',
        textAlign: 'center'
      }}
    >
      <Handle
        type="target"
        position={Position.Top}
        style={{ background: '#ddd6fe', width: 8, height: 8 }}
      />
      
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        gap: '6px',
        marginBottom: '4px',
        fontSize: '11px',
        opacity: 0.9
      }}>
        <span>💡</span>
        <span>トピック</span>
        {importance >= 4 && (
          <span style={{ color: '#fde68a' }}>
            {'★'.repeat(importance - 3)}
          </span>
        )}
      </div>
      
      <div style={{ 
        fontWeight: 'bold',
        lineHeight: '1.3',
        wordBreak: 'break-word'
      }}>
        {nodeData.title || nodeData.content}
      </div>

      {nodeData.metadata?.tags && nodeData.metadata.tags.length > 0 && (
        <div style={{
          marginTop: '6px',
          display: 'flex',
          flexWrap: 'wrap',
          gap: '4px',
          justifyContent: 'center'
        }}>
          {nodeData.metadata.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              style={{
                fontSize: '10px',
                background: 'rgba(255,255,255,0.2)',
                padding: '2px 6px',
                borderRadius: '4px'
              }}
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      <Handle
        type="source"
        position={Position.Bottom}
        style={{ background: '#ddd6fe', width: 8, height: 8 }}
      />
    </div>
  );
});

TopicNode.displayName = 'TopicNode';
