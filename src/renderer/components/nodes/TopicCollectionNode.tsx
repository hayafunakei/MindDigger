/**
 * トピック集ノードコンポーネント
 * 回答から抽出した質問候補を1つに集約して表示する
 */
import React, { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { MindNode } from '@shared/types';

interface TopicCollectionNodeData extends MindNode {
  label: string;
}

/**
 * トピック集ノードを表示する
 */
export const TopicCollectionNode: React.FC<NodeProps> = memo(({ data, selected }) => {
  const nodeData = data as unknown as TopicCollectionNodeData;
  const itemCount = nodeData.topicItems?.length ?? 0;

  return (
    <div
      style={{
        minWidth: '150px',
        padding: '12px 14px',
        border: selected ? '2px solid #0f766e' : '1px solid #14b8a6',
        borderRadius: '8px',
        background: '#ccfbf1',
        boxShadow: selected ? '0 0 0 3px #99f6e4' : '0 4px 10px rgba(13, 148, 136, 0.18)',
        color: '#134e4a',
        textAlign: 'center'
      }}
    >
      <Handle
        type="target"
        position={Position.Top}
        style={{ background: '#0f766e', width: 8, height: 8 }}
      />
      <div style={{ fontSize: '12px', fontWeight: 700 }}>トピック集</div>
      <div style={{ marginTop: '4px', fontSize: '13px', fontWeight: 700 }}>
        {nodeData.isLoading ? '項目を抽出中...' : `${itemCount}件の項目`}
      </div>
      {!nodeData.isLoading && itemCount === 0 && (
        <div style={{ marginTop: '4px', fontSize: '11px', color: '#0f766e' }}>
          項目を追加できます
        </div>
      )}
      <Handle
        type="source"
        position={Position.Bottom}
        style={{ background: '#0f766e', width: 8, height: 8 }}
      />
    </div>
  );
});

TopicCollectionNode.displayName = 'TopicCollectionNode';