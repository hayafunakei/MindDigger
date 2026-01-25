/**
 * トピックノードコンポーネント
 * まだ質問にしていない論点や検討すべき観点を表示
 */
import React, { memo, useState } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import type { MindNode } from '@shared/types';

interface TopicNodeData extends MindNode {
  label: string;
}

/**
 * ローディングインジケーターコンポーネント
 */
const LoadingIndicator: React.FC = () => (
  <div className="loading-indicator" style={{
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '4px 0'
  }}>
    <div className="loading-dots" style={{
      display: 'flex',
      gap: '3px'
    }}>
      <span className="loading-dot" style={{ animationDelay: '0ms', width: '6px', height: '6px' }} />
      <span className="loading-dot" style={{ animationDelay: '150ms', width: '6px', height: '6px' }} />
      <span className="loading-dot" style={{ animationDelay: '300ms', width: '6px', height: '6px' }} />
    </div>
    <span style={{ fontSize: '11px', opacity: 0.9 }}>トピック抽出中...</span>
  </div>
);

/**
 * トピックノード - 検討すべき論点を表示
 */
export const TopicNode: React.FC<NodeProps> = memo(({ data, selected }) => {
  const nodeData = data as unknown as TopicNodeData;
  const importance = nodeData.metadata?.importance || 3;
  const isPinned = nodeData.metadata?.pin;
  const isLoading = nodeData.isLoading === true;
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      className={`topic-node ${selected ? 'selected' : ''}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        padding: '10px 14px',
        borderRadius: '20px',
        background: isPinned
          ? 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)'
          : 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
        color: 'white',
        fontSize: '13px',
        boxShadow: selected 
          ? '0 0 0 3px #ddd6fe, 0 4px 12px rgba(139, 92, 246, 0.3)'
          : '0 4px 12px rgba(139, 92, 246, 0.2)',
        minWidth: '80px',
        maxWidth: '200px',
        cursor: 'pointer',
        transition: 'box-shadow 0.2s ease',
        textAlign: 'center',
        position: 'relative'
      }}
    >
      <Handle
        type="target"
        position={Position.Top}
        style={{ background: '#ddd6fe', width: 8, height: 8 }}
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
      
      {/* ローディング時はアニメーション表示、それ以外は通常のコンテンツ表示 */}
      {isLoading ? (
        <LoadingIndicator />
      ) : (
        <div style={{ 
          fontWeight: 'bold',
          lineHeight: '1.3',
          wordBreak: 'break-word'
        }}>
          {nodeData.title || nodeData.content}
        </div>
      )}

      {!isLoading && nodeData.metadata?.tags && nodeData.metadata.tags.length > 0 && (
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

      {/* アクションヒント */}
      {isHovered && (
        <div style={{
          position: 'absolute',
          bottom: '-28px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(0, 0, 0, 0.8)',
          color: '#94a3b8',
          padding: '3px 8px',
          borderRadius: '6px',
          fontSize: '10px',
          whiteSpace: 'nowrap',
          zIndex: 1000
        }}>
          サイドパネルで質問
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
