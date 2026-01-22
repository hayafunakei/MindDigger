/**
 * ボード状態管理ストア
 */
import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import type { Board, MindNode, Summary, BoardData, NodeId, BoardId, NodeType, Role } from '@shared/types';

interface BoardState {
  /** 現在のボード */
  board: Board | null;
  /** ノード一覧 */
  nodes: MindNode[];
  /** サマリー一覧 */
  summaries: Summary[];
  /** 選択中のノードID */
  selectedNodeId: NodeId | null;
  /** 保存先パス */
  filePath: string | null;
  /** 未保存の変更があるか */
  isDirty: boolean;
  /** ローディング状態 */
  isLoading: boolean;
  /** 親ノード接続モード */
  isConnectingParent: boolean;
  /** 接続元ノードID */
  connectingFromNodeId: NodeId | null;
}

interface BoardActions {
  /** 新規ボードを作成 */
  createBoard: (title: string, description?: string) => void;
  /** ボードデータをセット */
  setBoard: (data: BoardData, filePath?: string) => void;
  /** ボードをクリア */
  clearBoard: () => void;
  /** ノードを追加 */
  addNode: (node: Omit<MindNode, 'id' | 'createdAt' | 'updatedAt' | 'childrenIds'>) => MindNode;
  /** ノードを更新 */
  updateNode: (nodeId: NodeId, updates: Partial<MindNode>) => void;
  /** ノードを削除 */
  deleteNode: (nodeId: NodeId) => void;
  /** ノードを選択 */
  selectNode: (nodeId: NodeId | null) => void;
  /** ノード位置を更新 */
  updateNodePosition: (nodeId: NodeId, x: number, y: number) => void;
  /** 親子関係を追加 */
  addParentChild: (parentId: NodeId, childId: NodeId) => void;
  /** 保存パスをセット */
  setFilePath: (path: string) => void;
  /** ダーティフラグをリセット */
  markClean: () => void;
  /** ローディング状態をセット */
  setLoading: (loading: boolean) => void;
  /** サマリーを追加 */
  addSummary: (summary: Omit<Summary, 'id' | 'createdAt' | 'updatedAt'>) => void;
  /** ボードデータを取得（保存用） */
  getBoardData: () => BoardData | null;
  /** ノードをIDで取得 */
  getNodeById: (nodeId: NodeId) => MindNode | undefined;
  /** 親ノード接続モードを開始 */
  startConnectingParent: (nodeId: NodeId) => void;
  /** 親ノード接続モードをキャンセル */
  cancelConnectingParent: () => void;
  /** 親ノードを接続 */
  connectToParent: (childId: NodeId, parentId: NodeId) => void;
}

export const useBoardStore = create<BoardState & BoardActions>((set, get) => ({
  // 初期状態
  board: null,
  nodes: [],
  summaries: [],
  selectedNodeId: null,
  filePath: null,
  isDirty: false,
  isLoading: false,
  isConnectingParent: false,
  connectingFromNodeId: null,

  // アクション
  createBoard: (title, description) => {
    const now = new Date().toISOString();
    const boardId = uuidv4();
    const rootNodeId = uuidv4();

    const rootNode: MindNode = {
      id: rootNodeId,
      boardId,
      type: 'root',
      role: 'system',
      title,
      content: description || title,
      parentIds: [],
      childrenIds: [],
      createdBy: 'user',
      createdAt: now,
      updatedAt: now,
      position: { x: 0, y: 0 },
      metadata: {
        importance: 5,
        pin: true
      }
    };

    const board: Board = {
      id: boardId,
      title,
      description,
      rootNodeId,
      createdAt: now,
      updatedAt: now,
      settings: {
        defaultProvider: 'openai',
        defaultModel: 'gpt-4o-mini',
        temperature: 0.7
      }
    };

    set({
      board,
      nodes: [rootNode],
      summaries: [],
      selectedNodeId: null,
      filePath: null,
      isDirty: true
    });
  },

  setBoard: (data, filePath) => {
    set({
      board: data.board,
      nodes: data.nodes,
      summaries: data.summaries,
      filePath: filePath || null,
      isDirty: false,
      selectedNodeId: null
    });
  },

  clearBoard: () => {
    set({
      board: null,
      nodes: [],
      summaries: [],
      selectedNodeId: null,
      filePath: null,
      isDirty: false
    });
  },

  addNode: (nodeData) => {
    const now = new Date().toISOString();
    const node: MindNode = {
      ...nodeData,
      id: uuidv4(),
      childrenIds: [],
      createdAt: now,
      updatedAt: now
    };

    set((state) => {
      // 親ノードのchildrenIdsを更新
      const updatedNodes = state.nodes.map((n) => {
        if (nodeData.parentIds.includes(n.id)) {
          return {
            ...n,
            childrenIds: [...n.childrenIds, node.id],
            updatedAt: now
          };
        }
        return n;
      });

      return {
        nodes: [...updatedNodes, node],
        isDirty: true
      };
    });

    return node;
  },

  updateNode: (nodeId, updates) => {
    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === nodeId
          ? { ...n, ...updates, updatedAt: new Date().toISOString() }
          : n
      ),
      isDirty: true
    }));
  },

  deleteNode: (nodeId) => {
    set((state) => {
      const nodeToDelete = state.nodes.find((n) => n.id === nodeId);
      if (!nodeToDelete) return state;

      // 子孫ノードを収集
      const getDescendants = (id: NodeId): NodeId[] => {
        const node = state.nodes.find((n) => n.id === id);
        if (!node) return [];
        return [id, ...node.childrenIds.flatMap(getDescendants)];
      };

      const nodesToDelete = new Set(getDescendants(nodeId));

      // 親ノードからchildrenIdsを削除
      const updatedNodes = state.nodes
        .filter((n) => !nodesToDelete.has(n.id))
        .map((n) => ({
          ...n,
          childrenIds: n.childrenIds.filter((id) => !nodesToDelete.has(id)),
          parentIds: n.parentIds.filter((id) => !nodesToDelete.has(id))
        }));

      return {
        nodes: updatedNodes,
        selectedNodeId: state.selectedNodeId === nodeId ? null : state.selectedNodeId,
        isDirty: true
      };
    });
  },

  selectNode: (nodeId) => {
    set({ selectedNodeId: nodeId });
  },

  updateNodePosition: (nodeId, x, y) => {
    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === nodeId
          ? { ...n, position: { x, y }, updatedAt: new Date().toISOString() }
          : n
      ),
      isDirty: true
    }));
  },

  addParentChild: (parentId, childId) => {
    set((state) => ({
      nodes: state.nodes.map((n) => {
        if (n.id === parentId && !n.childrenIds.includes(childId)) {
          return { ...n, childrenIds: [...n.childrenIds, childId] };
        }
        if (n.id === childId && !n.parentIds.includes(parentId)) {
          return { ...n, parentIds: [...n.parentIds, parentId] };
        }
        return n;
      }),
      isDirty: true
    }));
  },

  setFilePath: (path) => {
    set({ filePath: path });
  },

  markClean: () => {
    set({ isDirty: false });
  },

  setLoading: (loading) => {
    set({ isLoading: loading });
  },

  addSummary: (summaryData) => {
    const now = new Date().toISOString();
    const summary: Summary = {
      ...summaryData,
      id: uuidv4(),
      createdAt: now,
      updatedAt: now
    };

    set((state) => ({
      summaries: [...state.summaries, summary],
      isDirty: true
    }));
  },

  getBoardData: () => {
    const state = get();
    if (!state.board) return null;
    return {
      board: state.board,
      nodes: state.nodes,
      summaries: state.summaries
    };
  },

  getNodeById: (nodeId) => {
    return get().nodes.find((n) => n.id === nodeId);
  },

  startConnectingParent: (nodeId) => {
    set({
      isConnectingParent: true,
      connectingFromNodeId: nodeId,
      selectedNodeId: nodeId
    });
  },

  cancelConnectingParent: () => {
    set({
      isConnectingParent: false,
      connectingFromNodeId: null
    });
  },

  connectToParent: (childId, parentId) => {
    const state = get();
    const childNode = state.nodes.find((n) => n.id === childId);
    const parentNode = state.nodes.find((n) => n.id === parentId);
    
    if (!childNode || !parentNode) return;
    
    // 既に親として登録されている場合はスキップ
    if (childNode.parentIds.includes(parentId)) return;
    
    // 自分自身を親にしようとしている場合はスキップ
    if (childId === parentId) return;
    
    const now = new Date().toISOString();
    
    set((state) => ({
      nodes: state.nodes.map((n) => {
        if (n.id === childId) {
          return {
            ...n,
            parentIds: [...n.parentIds, parentId],
            updatedAt: now
          };
        }
        if (n.id === parentId) {
          return {
            ...n,
            childrenIds: [...n.childrenIds, childId],
            updatedAt: now
          };
        }
        return n;
      }),
      isDirty: true,
      isConnectingParent: false,
      connectingFromNodeId: null
    }));
  }
}));
