/**
 * マインドマップキャンバスコンポーネント
 */
import React, { useCallback, useMemo } from 'react';
import {
  ReactFlow,
  Controls,
  MiniMap,
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Node,
  Edge,
  NodeChange,
  EdgeChange,
  applyNodeChanges,
  applyEdgeChanges,
  NodeTypes
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useBoardStore } from '../stores/boardStore';
import { RootNode } from './nodes/RootNode';
import { MessageNode } from './nodes/MessageNode';
import { NoteNode } from './nodes/NoteNode';
import { TopicNode } from './nodes/TopicNode';
import type { MindNode } from '@shared/types';

/** カスタムノードタイプの定義 */
const nodeTypes: NodeTypes = {
  root: RootNode,
  message: MessageNode,
  note: NoteNode,
  topic: TopicNode
};

/**
 * MindNodeをReact FlowのNodeに変換する
 */
function mindNodeToFlowNode(node: MindNode): Node {
  return {
    id: node.id,
    type: node.type,
    position: node.position,
    data: {
      ...node,
      label: node.title || node.content.slice(0, 50)
    },
    selected: false
  };
}

/**
 * MindNode配列からReact FlowのEdge配列を生成する
 */
function createEdges(nodes: MindNode[]): Edge[] {
  const edges: Edge[] = [];

  nodes.forEach((node) => {
    node.parentIds.forEach((parentId, index) => {
      edges.push({
        id: `${parentId}-${node.id}`,
        source: parentId,
        target: node.id,
        // メイン親（index 0）は太線、サブ親は細線
        style: {
          strokeWidth: index === 0 ? 2 : 1,
          stroke: index === 0 ? '#555' : '#aaa'
        },
        animated: index !== 0
      });
    });
  });

  return edges;
}

/**
 * マインドマップキャンバス
 */
export const MindMapCanvas: React.FC = () => {
  const { 
    nodes: mindNodes, 
    selectedNodeId, 
    selectNode, 
    updateNodePosition,
    isConnectingParent,
    connectingFromNodeId,
    connectToParent
  } = useBoardStore();

  // React Flow用のノードとエッジを生成
  const flowNodes = useMemo(() => {
    return mindNodes.map((node) => ({
      ...mindNodeToFlowNode(node),
      selected: node.id === selectedNodeId
    }));
  }, [mindNodes, selectedNodeId]);

  const flowEdges = useMemo(() => createEdges(mindNodes), [mindNodes]);

  /**
   * ノードの変更を処理
   */
  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      changes.forEach((change) => {
        if (change.type === 'position' && change.position && change.id) {
          // ドラッグ終了時に位置を保存
          if (!change.dragging) {
            updateNodePosition(change.id, change.position.x, change.position.y);
          }
        }
        if (change.type === 'select' && change.id) {
          // 親ノード接続モード中は選択変更をスキップ（onNodeClickで処理する）
          if (!isConnectingParent) {
            selectNode(change.selected ? change.id : null);
          }
        }
      });
    },
    [updateNodePosition, selectNode, isConnectingParent]
  );

  /**
   * ノードクリック時の処理
   */
  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      console.log('[onNodeClick] isConnectingParent:', isConnectingParent, 'connectingFromNodeId:', connectingFromNodeId, 'clicked:', node.id);
      // 親ノード接続モードの場合は接続処理
      if (isConnectingParent && connectingFromNodeId) {
        console.log('[onNodeClick] Connecting', connectingFromNodeId, 'to', node.id);
        connectToParent(connectingFromNodeId, node.id);
      } else {
        selectNode(node.id);
      }
    },
    [isConnectingParent, connectingFromNodeId, connectToParent, selectNode]
  );

  /**
   * キャンバスクリック時の処理（選択解除）
   */
  const onPaneClick = useCallback(() => {
    selectNode(null);
  }, [selectNode]);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      {/* 接続モード中のオーバーレイメッセージ */}
      {isConnectingParent && (
        <div style={{
          position: 'absolute',
          top: '20px',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 1000,
          background: 'rgba(99, 102, 241, 0.95)',
          color: 'white',
          padding: '12px 24px',
          borderRadius: '8px',
          fontSize: '14px',
          fontWeight: 'bold',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
          pointerEvents: 'none'
        }}>
          🔗 親ノードをクリックして接続してください
        </div>
      )}
      
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        onNodesChange={onNodesChange}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        nodeTypes={nodeTypes}
        fitView
        attributionPosition="bottom-left"
      >
        <Controls />
        <MiniMap 
          nodeColor={(node) => {
            switch (node.type) {
              case 'root': return '#6366f1';
              case 'message': return '#10b981';
              case 'note': return '#f59e0b';
              case 'topic': return '#8b5cf6';
              default: return '#64748b';
            }
          }}
        />
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
      </ReactFlow>
    </div>
  );
};
