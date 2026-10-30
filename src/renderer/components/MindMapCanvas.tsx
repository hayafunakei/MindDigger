/**
 * マインドマップキャンバスコンポーネント
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  ViewportPortal,
  Controls,
  MiniMap,
  Background,
  BackgroundVariant,
  useReactFlow,
  useStore,
  ReactFlowState,
  Node,
  Edge,
  NodeChange,
  NodeTypes
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useBoardStore } from '../stores/boardStore';
import { RootNode } from './nodes/RootNode';
import { MessageNode } from './nodes/MessageNode';
import { NoteNode } from './nodes/NoteNode';
import { TopicNode } from './nodes/TopicNode';
import { TopicCollectionNode } from './nodes/TopicCollectionNode';
import type { MindNode } from '@shared/types';

/** カスタムノードタイプの定義 */
const nodeTypes: NodeTypes = {
  root: RootNode,
  message: MessageNode,
  note: NoteNode,
  topic: TopicNode,
  topicCollection: TopicCollectionNode
};

/** ドラッグ中に表示する仮の枠 */
interface DragGhost {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * ノード同士の重なりを解消した位置を返す
 */
function resolveNodeOverlaps(
  nodes: Node[],
  getSize: (id: string) => { width?: number; height?: number }
): Array<{ id: string; x: number; y: number }> {
  const gap = 24;
  const positionedNodes = nodes.flatMap((node) => {
    const { width, height } = getSize(node.id);
    if (width === undefined || height === undefined) return [];

    return [{
      id: node.id,
      position: { ...node.position },
      width,
      height
    }];
  });

  /**
   * 2つのノードの表示領域が交差しているか判定する
   */
  const overlaps = (a: typeof positionedNodes[number], b: typeof positionedNodes[number]) => {
    return (
      a.position.x < b.position.x + b.width &&
      a.position.x + a.width > b.position.x &&
      a.position.y < b.position.y + b.height &&
      a.position.y + a.height > b.position.y
    );
  };

  for (let iteration = 0; iteration < positionedNodes.length ** 2 * 4; iteration += 1) {
    let foundOverlap = false;

    for (let i = 0; i < positionedNodes.length; i += 1) {
      for (let j = i + 1; j < positionedNodes.length; j += 1) {
        const a = positionedNodes[i];
        const b = positionedNodes[j];
        const overlapX = Math.min(a.position.x + a.width, b.position.x + b.width)
          - Math.max(a.position.x, b.position.x);
        const overlapY = Math.min(a.position.y + a.height, b.position.y + b.height)
          - Math.max(a.position.y, b.position.y);

        if (overlapX <= 0 || overlapY <= 0) continue;
        foundOverlap = true;

        if (overlapX <= overlapY) {
          const centerA = a.position.x + a.width / 2;
          const centerB = b.position.x + b.width / 2;
          const direction = centerA === centerB
            ? (a.id < b.id ? -1 : 1)
            : (centerA < centerB ? -1 : 1);
          const movement = overlapX + gap;
          a.position.x += direction * movement / 2;
          b.position.x -= direction * movement / 2;
        } else {
          const centerA = a.position.y + a.height / 2;
          const centerB = b.position.y + b.height / 2;
          const direction = centerA === centerB
            ? (a.id < b.id ? -1 : 1)
            : (centerA < centerB ? -1 : 1);
          const movement = overlapY + gap;
          a.position.y += direction * movement / 2;
          b.position.y -= direction * movement / 2;
        }
      }
    }

    if (!foundOverlap) break;
  }

  // 密集している場合に残った衝突を確実に解消する。
  for (let i = 0; i < positionedNodes.length; i += 1) {
    const node = positionedNodes[i];
    let blockers = positionedNodes.slice(0, i).filter((other) => overlaps(node, other));

    while (blockers.length > 0) {
      node.position.x = Math.max(
        node.position.x,
        ...blockers.map((other) => other.position.x + other.width + gap)
      );
      blockers = positionedNodes.slice(0, i).filter((other) => overlaps(node, other));
    }
  }

  return positionedNodes.map(({ id, position }) => ({
    id,
    x: position.x,
    y: position.y
  }));
}

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
 * React Flowのコンテキストを提供するマインドマップキャンバス
 */
export const MindMapCanvas: React.FC = () => {
  return (
    <ReactFlowProvider>
      <MindMapCanvasContent />
    </ReactFlowProvider>
  );
};

/**
 * マインドマップキャンバス
 */
const MindMapCanvasContent: React.FC = () => {
  const { getNodes, getInternalNode } = useReactFlow();
  const [dragGhosts, setDragGhosts] = useState<Record<string, DragGhost>>({});
  const { 
    nodes: mindNodes, 
    selectedNodeId, 
    selectNode, 
    updateNodePosition,
    updateNodePositions,
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
  // 内部の実測サイズから変化検知用のシグネチャを生成
  const dimensionsSignature = useStore((state: ReactFlowState) => {
    const parts: string[] = [];
    state.nodeLookup.forEach((node, id) => {
      parts.push(`${id}:${node.measured.width ?? ''}:${node.measured.height ?? ''}`);
    });
    return parts.join('|');
  });
  const previousDimensionsSignature = useRef<string | null>(null);

  /**
   * ノード位置を解決し、変更がある場合だけストアへ反映する
   */
  const updateOverlappingNodePositions = useCallback((nodes: Node[]) => {
    const currentPositions = new Map(
      nodes.map((node) => [node.id, node.position])
    );
    const resolvedPositions = resolveNodeOverlaps(nodes, (id) => getInternalNode(id)?.measured ?? {}).filter(({ id, x, y }) => {
      const position = currentPositions.get(id);
      return position && (position.x !== x || position.y !== y);
    });
    updateNodePositions(resolvedPositions);
  }, [updateNodePositions, getInternalNode]);

  useEffect(() => {
    if (previousDimensionsSignature.current === dimensionsSignature) return;
    previousDimensionsSignature.current = dimensionsSignature;
    updateOverlappingNodePositions(getNodes());
  }, [dimensionsSignature, getNodes, updateOverlappingNodePositions]);

  /**
   * ノードの変更を処理
   */
  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      changes.forEach((change) => {
        if (change.type === 'position' && change.position && change.id) {
          if (change.dragging) {
            // ドラッグ中はノード本体を動かさず、仮の枠のみ追従させる
            const size = getInternalNode(change.id)?.measured;
            const { x, y } = change.position;
            setDragGhosts((prev) => ({
              ...prev,
              [change.id]: {
                x,
                y,
                width: size?.width ?? 0,
                height: size?.height ?? 0
              }
            }));
          } else {
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
    [updateNodePosition, selectNode, isConnectingParent, getInternalNode]
  );

  /**
   * ノードクリック時の処理
   */
  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      // 親ノード接続モードの場合は接続処理
      if (isConnectingParent && connectingFromNodeId) {
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
        onNodeDragStop={(_, __, draggedNodes) => {
          setDragGhosts({});
          const droppedPositions = new Map(draggedNodes.map((n) => [n.id, n.position]));
          const nodes = getNodes().map((node) => {
            const position = droppedPositions.get(node.id);
            return position ? { ...node, position } : node;
          });
          updateOverlappingNodePositions(nodes);
        }}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        nodeTypes={nodeTypes}
        fitView
        attributionPosition="bottom-left"
      >
        <ViewportPortal>
          {Object.entries(dragGhosts).map(([id, ghost]) => (
            <div
              key={id}
              style={{
                position: 'absolute',
                transform: `translate(${ghost.x}px, ${ghost.y}px)`,
                width: ghost.width,
                height: ghost.height,
                border: '2px dashed rgba(99, 102, 241, 0.9)',
                background: 'rgba(99, 102, 241, 0.12)',
                borderRadius: '12px',
                pointerEvents: 'none',
                zIndex: 1000
              }}
            />
          ))}
        </ViewportPortal>
        <Controls />
        <MiniMap 
          nodeColor={(node) => {
            switch (node.type) {
              case 'root': return '#6366f1';
              case 'message': return '#10b981';
              case 'note': return '#f59e0b';
              case 'topic': return '#8b5cf6';
              case 'topicCollection': return '#14b8a6';
              default: return '#64748b';
            }
          }}
        />
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
      </ReactFlow>
    </div>
  );
};
