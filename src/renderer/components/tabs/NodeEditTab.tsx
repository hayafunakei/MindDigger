/**
 * ノード編集タブコンポーネント
 * ノードの詳細表示・編集・質問送信・アクション機能を担当
 */
import React, { useState, useCallback, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { v4 as uuidv4 } from 'uuid';
import { useBoardStore } from '../../stores/boardStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { TimelineModal } from '../TimelineModal';
import { CreateTopicModal } from '../CreateTopicModal';
import type { MindNode, NodeType, NodeId, TopicCollectionItem } from '@shared/types';

interface NodeEditTabProps {
  /** AI応答中フラグ（外部からの制御用） */
  isAiResponding: boolean;
  /** AI応答中フラグを設定 */
  setIsAiResponding: (responding: boolean) => void;
}

/**
 * 指定ノードの子孫に質問ノード（role === 'user'）が存在するかを判定
 * 末端まで再帰探索する
 */
function hasQuestionInDescendants(nodeId: NodeId, nodes: MindNode[]): boolean {
  const node = nodes.find(n => n.id === nodeId);
  if (!node) return false;

  for (const childId of node.childrenIds) {
    const child = nodes.find(n => n.id === childId);
    if (!child) continue;

    // 子が質問ノードなら true
    if (child.type === 'message' && child.role === 'user') {
      return true;
    }

    // 再帰探索
    if (hasQuestionInDescendants(childId, nodes)) {
      return true;
    }
  }

  return false;
}

/**
 * 指定ノードに回答（role === 'assistant'）の子が存在するかを判定
 */
function hasAnswerChild(node: MindNode, nodes: MindNode[]): boolean {
  return node.childrenIds.some(childId => {
    const child = nodes.find(n => n.id === childId);
    return child && child.type === 'message' && child.role === 'assistant';
  });
}

/**
 * 質問ノードの編集状態を判定
 * @returns 'editable' | 'duplicateOnly' | 'canResend'
 * - editable: 回答なし、自由に編集可能
 * - duplicateOnly: 回答あり＆その先に質問あり、編集不可・複製のみ
 * - canResend: 回答あり＆その先に質問なし、編集→再送信可能（将来実装）
 */
function getQuestionEditState(
  node: MindNode,
  nodes: MindNode[]
): 'editable' | 'duplicateOnly' | 'canResend' {
  if (node.type !== 'message' || node.role !== 'user') {
    return 'editable';
  }

  const hasAnswer = hasAnswerChild(node, nodes);
  if (!hasAnswer) {
    return 'editable';
  }

  // 回答ノードの先に質問があるかチェック
  const answerChildren = node.childrenIds
    .map(id => nodes.find(n => n.id === id))
    .filter((n): n is MindNode => n !== undefined && n.type === 'message' && n.role === 'assistant');

  for (const answerNode of answerChildren) {
    if (hasQuestionInDescendants(answerNode.id, nodes)) {
      return 'duplicateOnly';
    }
  }

  // 回答はあるが、その先に質問がない → 将来の再送信機能
  return 'canResend';
}

/**
 * ノード編集タブ
 * 選択ノードの詳細表示・編集・質問送信・アクション機能を提供する
 */
export const NodeEditTab: React.FC<NodeEditTabProps> = ({
  isAiResponding,
  setIsAiResponding
}) => {
  const { 
    board, 
    nodes, 
    selectedNodeId, 
    getNodeById, 
    addNode, 
    updateNode, 
    deleteNode,
    selectNode,
    isConnectingParent,
    startConnectingParent,
    cancelConnectingParent,
    removeParentChild,
    setMainParent,
    pendingFocusNodeId,
    setPendingFocusNodeId,
    clearPendingFocusNodeId
  } = useBoardStore();

  const [questionInput, setQuestionInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [showTimelineModal, setShowTimelineModal] = useState(false);
  const [showCreateTopicModal, setShowCreateTopicModal] = useState(false);
  const [selectedTopicItemIds, setSelectedTopicItemIds] = useState<Set<string>>(new Set());
  const [editingTopicItemId, setEditingTopicItemId] = useState<string | null>(null);
  const [topicItemTitle, setTopicItemTitle] = useState('');
  const [topicItemDescription, setTopicItemDescription] = useState('');
  const [newTopicItemTitle, setNewTopicItemTitle] = useState('');
  const [newTopicItemDescription, setNewTopicItemDescription] = useState('');
  /** 質問時に使用するモデル */
  const [selectedModel, setSelectedModel] = useState<string>('');
  const questionInputRef = useRef<HTMLTextAreaElement>(null);

  // 設定ストアからモデル一覧と設定を取得
  const { availableModels, loadAvailableModels, getModelsForProvider, settings: appSettings } = useSettingsStore();

  const selectedNode = selectedNodeId ? getNodeById(selectedNodeId) : null;
  const hasTopicCollectionChild = selectedNode?.childrenIds.some((childId) => {
    return getNodeById(childId)?.type === 'topicCollection';
  }) ?? false;

  /**
   * 回答ノードの子としてトピック集を生成する
   * @param answerNode - トピック集の親となる回答ノード
   * @param context - 抽出時に参照する会話文脈
   */
  const generateTopicCollectionForAnswer = useCallback(async (
    answerNode: MindNode,
    context: string
  ): Promise<void> => {
    if (!board) return;

    const hasTopicCollection = answerNode.childrenIds.some((childId) => {
      return getNodeById(childId)?.type === 'topicCollection';
    });
    if (hasTopicCollection) return;

    const loadingNode = addNode({
      boardId: board.id,
      type: 'topicCollection',
      role: 'system',
      title: 'トピック集',
      content: 'トピック項目を抽出中...',
      parentIds: [answerNode.id],
      createdBy: 'ai',
      position: {
        x: answerNode.position.x,
        y: answerNode.position.y + 150
      },
      topicItems: [],
      isLoading: true
    });

    try {
      const items = await window.electronAPI.generateTopicCollection({
        content: answerNode.content,
        context,
        model: appSettings.topicGenerationModel || board.settings.defaultModel
      });

      updateNode(loadingNode.id, {
        content: `${items.length}件のトピック項目`,
        topicItems: items.map((item) => ({
          ...item,
          id: uuidv4()
        })),
        isLoading: false
      });
    } catch (error) {
      deleteNode(loadingNode.id);
      throw error;
    }
  }, [addNode, appSettings.topicGenerationModel, board, deleteNode, getNodeById, updateNode]);

  // 質問ノードの編集状態を判定
  const questionEditState = selectedNode ? getQuestionEditState(selectedNode, nodes) : 'editable';

  // モデル一覧を読み込み
  useEffect(() => {
    if (!availableModels) {
      loadAvailableModels();
    }
  }, [availableModels, loadAvailableModels]);

  // ボードのデフォルトモデルを初期選択モデルとして設定
  useEffect(() => {
    if (board && !selectedModel) {
      setSelectedModel(board.settings.defaultModel);
    }
  }, [board, selectedModel]);

  useEffect(() => {
    if (selectedNode) {
      setEditTitle(selectedNode.title || '');
      setEditContent(selectedNode.content || '');
      if (selectedNode.type === 'message' && selectedNode.role === 'user') {
        setQuestionInput(selectedNode.content || '');
      } else {
        setQuestionInput('');
      }
    } else {
      setEditTitle('');
      setEditContent('');
      setQuestionInput('');
    }
    setIsEditing(false);
    setSelectedTopicItemIds(new Set());
    setEditingTopicItemId(null);
    setTopicItemTitle('');
    setTopicItemDescription('');
    setNewTopicItemTitle('');
    setNewTopicItemDescription('');
  }, [selectedNode]);

  // 質問ノード作成・複製後のフォーカス制御
  useEffect(() => {
    if (pendingFocusNodeId && selectedNodeId === pendingFocusNodeId) {
      // 少し待ってからフォーカス（レンダリング完了を待つ）
      const timer = setTimeout(() => {
        questionInputRef.current?.focus();
        clearPendingFocusNodeId();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [pendingFocusNodeId, selectedNodeId, clearPendingFocusNodeId]);

  /**
   * 質問を送信（新規送信または再送信）
   * canResend状態の場合は既存の回答ノードを削除してから新しい回答を生成
   */
  const handleModelChange = useCallback((newModel: string) => {
    setSelectedModel(newModel);
    // ボードのデフォルトモデルを更新
    if (board) {
      useBoardStore.getState().updateBoardSettings({ defaultModel: newModel });
    }
  }, [board]);

  /**
   * 質問を送信（新規送信または再送信）
   * canResend状態の場合は既存の回答ノードを削除してから新しい回答を生成
   */
  const handleSendQuestion = useCallback(async () => {
    if (!questionInput.trim() || !selectedNode || !board) return;
    if (selectedNode.type !== 'message' || selectedNode.role !== 'user') return;

    // 現在の編集状態を取得
    const currentEditState = getQuestionEditState(selectedNode, nodes);

    setIsLoading(true);
    setIsAiResponding(true);
    try {
      // canResend状態の場合、既存の回答ノードを削除
      if (currentEditState === 'canResend') {
        const answerChildIds = selectedNode.childrenIds.filter(childId => {
          const child = getNodeById(childId);
          return child && child.type === 'message' && child.role === 'assistant';
        });
        
        // 回答ノードを削除（配下のノードも含めて削除される）
        for (const answerChildId of answerChildIds) {
          deleteNode(answerChildId);
        }
      }

      // 質問ノードの内容を更新
      updateNode(selectedNode.id, {
        content: questionInput.trim()
      });

      // 使用するモデル（選択中またはボードデフォルト）
      const modelToUse = selectedModel || board.settings.defaultModel;

      // ローディング中の仮ノードを作成
      const qaPairId = `qa-${Date.now()}`;
      const loadingNode = addNode({
        boardId: board.id,
        type: 'message',
        role: 'assistant',
        title: '',
        content: '回答を生成中...',
        parentIds: [selectedNode.id],
        provider: board.settings.defaultProvider,
        model: modelToUse,
        createdBy: 'ai',
        position: {
          x: selectedNode.position.x,
          y: selectedNode.position.y + 150
        },
        qaPairId,
        isLoading: true
      });

      // 質問ノードにもqaPairIdを設定
      updateNode(selectedNode.id, { qaPairId });

      // コンテキストを収集（メイン親チェーン + サブ親チェーン）
      // selectedNodeから収集開始し、selectedNode自身は後で追加するので除外
      const contextResult = collectContextWithSubParents(nodes, selectedNode);
      // selectedNode自身をメインコンテキストから除外（最後の要素）
      const mainContextWithoutSelf = contextResult.mainContext.slice(0, -1);
      // pin留めノードを含めてコンテキストを生成
      const contextMessages = formatContextForLLM({
        mainContext: mainContextWithoutSelf,
        subContexts: contextResult.subContexts
      }, nodes);
      
      // LLMにリクエスト
      const llmMessages = [
        {
          role: 'system' as const,
          content: `あなたは「${board.title}」というテーマについて、ユーザーの思考を整理する手助けをするアシスタントです。的確で具体的な回答を心がけてください。`
        },
        ...contextMessages,
        {
          role: 'user' as const,
          content: questionInput.trim()
        }
      ];
      
      console.log('[LLM Request] handleSendQuestion:', {
        provider: board.settings.defaultProvider,
        model: modelToUse,
        messages: llmMessages,
        temperature: board.settings.temperature
      });
      
      const response = await window.electronAPI.sendLLMRequest({
        provider: board.settings.defaultProvider,
        model: modelToUse,
        messages: llmMessages,
        temperature: board.settings.temperature
      });

      // ローディングノードを実際の回答で更新
      updateNode(loadingNode.id, {
        content: response.content,
        usage: response.usage,
        isLoading: false
      });

      // 回答からトピック集を自動生成
      try {
        // コンテキストを収集（回答を含む）
        const topicContext = [
          ...contextMessages.map(m => `${m.role}: ${m.content}`),
          `user: ${questionInput.trim()}`,
          `assistant: ${response.content}`
        ].join('\n\n');

        await generateTopicCollectionForAnswer({
          ...loadingNode,
          content: response.content,
          isLoading: false
        }, topicContext);
      } catch (topicError) {
        console.warn('Failed to auto-generate topic collection:', topicError);
      }

      setQuestionInput('');
    } catch (error) {
      console.error('Failed to send question:', error);
      
      // エラー時はローディングノードを削除
      // ローディングノードのIDを取得するために、selectedNodeの子ノードからisLoading=trueのものを探す
      const state = useBoardStore.getState();
      const loadingNodes = state.nodes.filter(n => 
        n.parentIds.includes(selectedNode.id) && 
        n.isLoading === true
      );
      for (const loadingNode of loadingNodes) {
        deleteNode(loadingNode.id);
      }
      
      alert(`エラーが発生しました: ${error instanceof Error ? error.message : '不明なエラー'}`);
    } finally {
      setIsLoading(false);
      setIsAiResponding(false);
    }
  }, [questionInput, selectedNode, board, nodes, getNodeById, addNode, updateNode, deleteNode, setIsAiResponding, generateTopicCollectionForAnswer]);

  /**
   * ノートを作成
   */
  const handleCreateNote = useCallback(() => {
    if (!selectedNode || !board) return;

    addNode({
      boardId: board.id,
      type: 'note',
      role: 'user',
      title: '',
      content: '',
      parentIds: [selectedNode.id],
      createdBy: 'user',
      position: {
        x: selectedNode.position.x + 200,
        y: selectedNode.position.y + 50
      },
      metadata: {
        importance: 3,
        pin: false
      }
    });
  }, [selectedNode, board, addNode]);

  /**
   * AIでノートを生成
   */
  const handleGenerateNote = useCallback(async () => {
    if (!selectedNode || !board) return;

    setIsLoading(true);
    setIsAiResponding(true);
    try {
      // コンテキストを収集
      const contextMessages = collectContext(nodes, selectedNode);
      const context = contextMessages.map(m => `${m.role}: ${m.content}`).join('\n\n');

      const noteContent = await window.electronAPI.generateNote({
        content: selectedNode.content,
        context,
        model: selectedModel || board.settings.defaultModel
      });

      addNode({
        boardId: board.id,
        type: 'note',
        role: 'user',
        title: '決定事項',
        content: noteContent,
        parentIds: [selectedNode.id],
        createdBy: 'ai',
        position: {
          x: selectedNode.position.x + 200,
          y: selectedNode.position.y + 50
        },
        metadata: {
          tags: ['decision'],
          importance: 3,
          pin: true
        }
      });
    } catch (error) {
      console.error('Failed to generate note:', error);
      alert(`ノート生成に失敗しました: ${error instanceof Error ? error.message : '不明なエラー'}`);
    } finally {
      setIsLoading(false);
      setIsAiResponding(false);
    }
  }, [selectedNode, board, nodes, addNode, setIsAiResponding]);

  /**
   * トピックから質問ノードを作成
   */
  const handleCreateQuestionFromTopic = useCallback(() => {
    if (!selectedNode || selectedNode.type !== 'topic' || !board) return;

    const questionNode = addNode({
      boardId: board.id,
      type: 'message',
      role: 'user',
      title: '',
      content: '',
      parentIds: [selectedNode.id],
      createdBy: 'user',
      position: {
        x: selectedNode.position.x + 100,
        y: selectedNode.position.y + 120
      }
    });

    selectNode(questionNode.id);
    setPendingFocusNodeId(questionNode.id);
    setQuestionInput('');
    setIsEditing(false);
  }, [selectedNode, board, addNode, selectNode, setPendingFocusNodeId]);

  /**
   * 回答からトピック集を生成する
   */
  const handleGenerateTopicCollection = useCallback(async () => {
    if (!selectedNode || selectedNode.type !== 'message' || selectedNode.role !== 'assistant' || !board) return;

    const hasTopicCollection = selectedNode.childrenIds.some((childId) => {
      return getNodeById(childId)?.type === 'topicCollection';
    });
    if (hasTopicCollection) return;

    setIsLoading(true);
    setIsAiResponding(true);
    try {
      // コンテキストを収集
      const contextMessages = collectContext(nodes, selectedNode);
      const context = contextMessages.map(m => `${m.role}: ${m.content}`).join('\n\n');

      await generateTopicCollectionForAnswer(selectedNode, context);
    } catch (error) {
      console.error('Failed to generate topic collection:', error);
      alert(`トピック集の生成に失敗しました: ${error instanceof Error ? error.message : '不明なエラー'}`);
    } finally {
      setIsLoading(false);
      setIsAiResponding(false);
    }
  }, [selectedNode, board, nodes, getNodeById, generateTopicCollectionForAnswer, setIsAiResponding]);

  /**
   * 手動でトピックを作成
   */
  const handleCreateTopic = useCallback((data: {
    title: string;
    content: string;
    importance: 1 | 2 | 3 | 4 | 5;
    tags: string[];
  }) => {
    if (!selectedNode || !board) return;

    addNode({
      boardId: board.id,
      type: 'topic',
      role: 'system',
      title: data.title,
      content: data.content,
      parentIds: [selectedNode.id],
      createdBy: 'user',
      position: {
        x: selectedNode.position.x + 180,
        y: selectedNode.position.y + 80
      },
      metadata: {
        importance: data.importance,
        tags: data.tags.length > 0 ? data.tags : undefined
      }
    });
  }, [selectedNode, board, addNode]);

  /**
   * トピック集の選択状態を切り替える
   * @param itemId - 選択を切り替える項目ID
   */
  const handleToggleTopicItem = useCallback((itemId: string) => {
    setSelectedTopicItemIds((currentIds) => {
      const nextIds = new Set(currentIds);
      if (nextIds.has(itemId)) {
        nextIds.delete(itemId);
      } else {
        nextIds.add(itemId);
      }
      return nextIds;
    });
  }, []);

  /**
   * トピック集に手動項目を追加する
   */
  const handleAddTopicItem = useCallback(() => {
    if (!selectedNode || selectedNode.type !== 'topicCollection') return;
    const title = newTopicItemTitle.trim();
    if (!title) return;

    const item: TopicCollectionItem = {
      id: uuidv4(),
      title,
      description: newTopicItemDescription.trim()
    };
    updateNode(selectedNode.id, {
      topicItems: [...(selectedNode.topicItems || []), item],
      content: `${(selectedNode.topicItems?.length || 0) + 1}件のトピック項目`
    });
    setNewTopicItemTitle('');
    setNewTopicItemDescription('');
  }, [newTopicItemDescription, newTopicItemTitle, selectedNode, updateNode]);

  /**
   * トピック集項目の編集を開始する
   * @param item - 編集対象の項目
   */
  const handleStartEditTopicItem = useCallback((item: TopicCollectionItem) => {
    setEditingTopicItemId(item.id);
    setTopicItemTitle(item.title);
    setTopicItemDescription(item.description);
  }, []);

  /**
   * 編集中のトピック集項目を保存する
   */
  const handleSaveTopicItem = useCallback(() => {
    if (!selectedNode || selectedNode.type !== 'topicCollection' || !editingTopicItemId) return;
    const title = topicItemTitle.trim();
    if (!title) return;

    updateNode(selectedNode.id, {
      topicItems: (selectedNode.topicItems || []).map((item) => {
        return item.id === editingTopicItemId
          ? { ...item, title, description: topicItemDescription.trim() }
          : item;
      })
    });
    setEditingTopicItemId(null);
    setTopicItemTitle('');
    setTopicItemDescription('');
  }, [editingTopicItemId, selectedNode, topicItemDescription, topicItemTitle, updateNode]);

  /**
   * トピック集から項目を削除する
   * @param itemId - 削除対象の項目ID
   */
  const handleDeleteTopicItem = useCallback((itemId: string) => {
    if (!selectedNode || selectedNode.type !== 'topicCollection') return;

    const topicItems = (selectedNode.topicItems || []).filter((item) => item.id !== itemId);
    updateNode(selectedNode.id, {
      topicItems,
      content: `${topicItems.length}件のトピック項目`
    });
    setSelectedTopicItemIds((currentIds) => {
      const nextIds = new Set(currentIds);
      nextIds.delete(itemId);
      return nextIds;
    });
    if (editingTopicItemId === itemId) {
      setEditingTopicItemId(null);
    }
  }, [editingTopicItemId, selectedNode, updateNode]);

  /**
   * 選択したトピック集項目から通常のトピックを作成する
   */
  const handleCreateTopicFromSelectedItems = useCallback(() => {
    if (!selectedNode || selectedNode.type !== 'topicCollection' || !board) return;

    const selectedItems = (selectedNode.topicItems || []).filter((item) => {
      return selectedTopicItemIds.has(item.id);
    });
    if (selectedItems.length === 0) return;

    addNode({
      boardId: board.id,
      type: 'topic',
      role: 'system',
      title: selectedItems.map((item) => item.title).join(' / '),
      content: selectedItems.map((item) => {
        return item.description ? `${item.title}: ${item.description}` : item.title;
      }).join('\n'),
      parentIds: [selectedNode.id],
      createdBy: 'user',
      position: {
        x: selectedNode.position.x + 180,
        y: selectedNode.position.y + 100
      },
      metadata: {
        importance: 3
      }
    });
    setSelectedTopicItemIds(new Set());
  }, [addNode, board, selectedNode, selectedTopicItemIds]);

  /**
   * 選択ノードを編集開始
   */
  const handleStartEdit = useCallback(() => {
    if (!selectedNode) return;
    
    // 質問ノードかつ回答が存在する場合はフォークを提案
    if (selectedNode.type === 'message' && selectedNode.role === 'user') {
      const hasAnswers = selectedNode.childrenIds.some(childId => {
        const child = getNodeById(childId);
        return child && child.type === 'message' && child.role === 'assistant';
      });
      
      if (hasAnswers) {
        const shouldFork = window.confirm(
          'この質問には既に回答があります。\n\n'
          + '「新しい質問としてフォーク」すると、同じ親ノードから別の質問ノードを作成します。\n\n'
          + 'フォークしますか？'
        );
        
        if (shouldFork) {
          handleForkQuestion();
        }
        return;
      }
    }
    
    setIsEditing(true);
    setEditTitle(selectedNode.title || '');
    setEditContent(selectedNode.content || '');
  }, [selectedNode, getNodeById]);

  /**
   * 質問ノードをフォーク（新しい質問として作成）
   */
  const handleForkQuestion = useCallback(() => {
    if (!selectedNode || !board) return;
    
    const forkedNode = addNode({
      boardId: board.id,
      type: 'message',
      role: 'user',
      title: selectedNode.title || '',
      content: selectedNode.content,
      parentIds: selectedNode.parentIds, // 同じ親ノード
      createdBy: 'user',
      position: {
        x: selectedNode.position.x + 100,
        y: selectedNode.position.y + 80
      }
    });
    
    // フォークしたノードを選択し、編集モードに
    selectNode(forkedNode.id);
    setTimeout(() => {
      setIsEditing(true);
      setEditTitle(forkedNode.title || '');
      setEditContent(forkedNode.content);
    }, 100);
  }, [selectedNode, board, addNode, selectNode]);

  /**
   * 質問ノードを複製して新しい質問を作成（確認ダイアログなし）
   * 複製後は新ノードを選択し、質問入力欄にフォーカス
   */
  const handleDuplicateQuestion = useCallback(() => {
    if (!selectedNode || !board) return;
    if (selectedNode.type !== 'message' || selectedNode.role !== 'user') return;
    
    const duplicatedNode = addNode({
      boardId: board.id,
      type: 'message',
      role: 'user',
      title: selectedNode.title || '',
      content: selectedNode.content,
      parentIds: selectedNode.parentIds, // 同じ親ノード
      createdBy: 'user',
      position: {
        x: selectedNode.position.x + 120,
        y: selectedNode.position.y + 60
      }
    });
    
    // 複製したノードを選択し、質問入力欄にフォーカス
    selectNode(duplicatedNode.id);
    setPendingFocusNodeId(duplicatedNode.id);
  }, [selectedNode, board, addNode, selectNode, setPendingFocusNodeId]);

  /**
   * 編集をキャンセル
   */
  const handleCancelEdit = useCallback(() => {
    if (!selectedNode) return;
    setIsEditing(false);
    setEditTitle(selectedNode.title || '');
    setEditContent(selectedNode.content || '');
  }, [selectedNode]);

  /**
   * ノード内容を保存
   */
  const handleSaveEdit = useCallback(() => {
    if (!selectedNode) return;
    updateNode(selectedNode.id, {
      title: editTitle.trim(),
      content: editContent.trim()
    });
    setIsEditing(false);
  }, [selectedNode, editTitle, editContent, updateNode]);

  /**
   * ノードを削除
   */
  const handleDeleteNode = useCallback(() => {
    if (!selectedNode) return;
    if (selectedNode.type === 'root') {
      alert('ルートノードは削除できません');
      return;
    }
    // ノードタイプの日本語ラベル
    const typeLabels: Record<string, string> = {
      question: '質問',
      answer: '回答',
      topic: 'トピック',
      note: 'メモ'
    };
    const typeLabel = typeLabels[selectedNode.type] || selectedNode.type;
    
    // 削除確認メッセージの作成
    const title = selectedNode.title || '(無題)';
    const contentPreview = selectedNode.content
      ? selectedNode.content.slice(0, 30) + (selectedNode.content.length > 30 ? '...' : '')
      : '';
    const nodeDescription = contentPreview ? `${title}（${contentPreview}）` : title;
    const confirmMessage = `（${typeLabel}）「${nodeDescription}」ノードを削除します。\n\n⚠️ 注意：この配下にあるノードも全て削除されます！`;
    
    const confirmed = window.confirm(confirmMessage);
    if (!confirmed) return;
    deleteNode(selectedNode.id);
    setIsEditing(false);
    setEditTitle('');
    setEditContent('');
  }, [selectedNode, deleteNode]);

  /**
   * 親ノード接続モードを開始
   */
  const handleStartConnectParent = useCallback(() => {
    if (!selectedNode) return;
    startConnectingParent(selectedNode.id);
    alert('接続したい親ノードをキャンバス上でクリックしてください');
  }, [selectedNode, startConnectingParent]);

  /**
   * 親ノード接続モードをキャンセル
   */
  const handleCancelConnectParent = useCallback(() => {
    cancelConnectingParent();
  }, [cancelConnectingParent]);

  /**
   * タイムラインモーダルを開く
   */
  const handleOpenTimelineModal = useCallback(() => {
    setShowTimelineModal(true);
  }, []);

  /**
   * タイムラインモーダルを閉じる
   */
  const handleCloseTimelineModal = useCallback(() => {
    setShowTimelineModal(false);
  }, []);

  if (!board) {
    return (
      <div style={{ textAlign: 'center', color: '#64748b', padding: '20px' }}>
        <p>ボードを開いてください</p>
      </div>
    );
  }

  if (!selectedNode) {
    return (
      <div style={{ textAlign: 'center', color: '#64748b', padding: '20px' }}>
        <p>ノードを選択してください</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* タイムラインボタン */}
      <button
        onClick={handleOpenTimelineModal}
        style={{
          ...actionButtonStyle,
          width: '100%',
          justifyContent: 'center',
          padding: '10px 12px'
        }}
      >
        🕒 タイムラインを表示
      </button>

      {/* タイムラインモーダル */}
      <TimelineModal
        isOpen={showTimelineModal}
        onClose={handleCloseTimelineModal}
        selectedNode={selectedNode}
        selectedNodeId={selectedNodeId}
        getNodeById={getNodeById}
        selectNode={selectNode}
      />

      {/* トピック作成モーダル */}
      <CreateTopicModal
        isOpen={showCreateTopicModal}
        onClose={() => setShowCreateTopicModal(false)}
        onSubmit={handleCreateTopic}
      />

      <hr style={{ border: 'none', borderTop: '1px solid #334155', margin: '0' }} />

      {/* 選択ノード情報 */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
          <h3 style={{ margin: 0, fontSize: '14px', color: '#94a3b8' }}>
            {getNodeTypeIcon(selectedNode.type)} 選択中のノード
          </h3>
          <div style={{ display: 'flex', gap: '6px' }}>
            {/* 質問ノードは編集不可、複製ボタンを表示 */}
            {selectedNode.type === 'message' && selectedNode.role === 'user' ? (
              <button
                onClick={handleDuplicateQuestion}
                style={{ 
                  ...actionButtonStyle, 
                  padding: '6px 10px',
                  opacity: isAiResponding ? 0.5 : 1,
                  cursor: isAiResponding ? 'not-allowed' : 'pointer'
                }}
                disabled={isAiResponding}
              >
                📋 複製
              </button>
            ) : selectedNode.type === 'message' && selectedNode.role === 'assistant' ? (
              // AI回答ノードは編集不可
              null
            ) : (
              <button
                onClick={handleStartEdit}
                style={{ 
                  ...actionButtonStyle, 
                  padding: '6px 10px',
                  opacity: (isEditing || isAiResponding) ? 0.5 : 1,
                  cursor: (isEditing || isAiResponding) ? 'not-allowed' : 'pointer'
                }}
                disabled={isEditing || isAiResponding}
              >
                ✏️ 編集
              </button>
            )}
            <button
              onClick={handleDeleteNode}
              style={{ 
                ...actionButtonStyle, 
                padding: '6px 10px', 
                background: '#7f1d1d',
                opacity: (selectedNode.type === 'root' || isAiResponding) ? 0.5 : 1,
                cursor: (selectedNode.type === 'root' || isAiResponding) ? 'not-allowed' : 'pointer'
              }}
              disabled={selectedNode.type === 'root' || isAiResponding}
            >
              🗑️ 削除
            </button>
          </div>
        </div>

        {isEditing ? (
          <div style={{
            padding: '12px',
            background: '#1e293b',
            borderRadius: '8px',
            fontSize: '14px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px'
          }}>
            <input
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              placeholder="タイトル"
              style={{
                width: '100%',
                padding: '8px 10px',
                borderRadius: '6px',
                border: '1px solid #475569',
                background: '#0f172a',
                color: 'white',
                fontSize: '14px'
              }}
            />
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              placeholder="内容"
              rows={5}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '6px',
                border: '1px solid #475569',
                background: '#0f172a',
                color: 'white',
                fontSize: '14px',
                resize: 'vertical',
                boxSizing: 'border-box'
              }}
            />
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button onClick={handleCancelEdit} style={{ ...actionButtonStyle, padding: '6px 12px' }}>
                キャンセル
              </button>
              <button onClick={handleSaveEdit} style={{ ...actionButtonStyle, padding: '6px 12px', background: '#22c55e' }}>
                保存
              </button>
            </div>
          </div>
        ) : selectedNode.type === 'message' && selectedNode.role === 'user' ? (
          // 質問ノードはメッセージ表示欄を非表示（質問欄と内容が同じため）
          null
        ) : (
          <div style={{
            padding: '12px',
            background: '#1e293b',
            borderRadius: '8px',
            fontSize: '14px'
          }}>
            <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>
              {selectedNode.title || getNodeTypeLabel(selectedNode.type)}
            </div>
            <div style={{ 
              color: '#94a3b8', 
              fontSize: '13px',
              maxHeight: '400px',
              overflow: 'auto'
            }}>
              {selectedNode.role === 'assistant' ? (
                <div className="markdown-content">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {selectedNode.content}
                  </ReactMarkdown>
                </div>
              ) : (
                <div style={{ whiteSpace: 'pre-wrap' }}>
                  {selectedNode.content || '(内容なし)'}
                </div>
              )}
            </div>
          </div>
        )}

        {/* メタデータ編集セクション（note/topicノードのみ） */}
        {(selectedNode.type === 'note' || selectedNode.type === 'topic') && !isEditing && (
          <div style={{
            marginTop: '12px',
            padding: '12px',
            background: '#1e293b',
            borderRadius: '8px',
            fontSize: '13px'
          }}>
            <h4 style={{ margin: '0 0 12px 0', fontSize: '13px', color: '#94a3b8' }}>
              ⚙️ メタデータ
            </h4>
            
            {/* ピン留め */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '12px'
            }}>
              <label style={{ color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: '6px' }}>
                📌 決定事項としてピン留め
              </label>
              <input
                type="checkbox"
                checked={selectedNode.metadata?.pin || false}
                onChange={(e) => {
                  updateNode(selectedNode.id, {
                    metadata: {
                      ...selectedNode.metadata,
                      pin: e.target.checked
                    }
                  });
                }}
                style={{
                  width: '18px',
                  height: '18px',
                  cursor: 'pointer',
                  accentColor: '#f59e0b'
                }}
              />
            </div>

            {/* 重要度 */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <label style={{ color: '#e2e8f0' }}>
                ⭐ 重要度
              </label>
              <select
                value={selectedNode.metadata?.importance ?? 3}
                onChange={(e) => {
                  const importance = parseInt(e.target.value) as 1 | 2 | 3 | 4 | 5;
                  updateNode(selectedNode.id, {
                    metadata: {
                      ...selectedNode.metadata,
                      importance
                    }
                  });
                }}
                style={{
                  padding: '6px 10px',
                  borderRadius: '6px',
                  border: '1px solid #475569',
                  background: '#0f172a',
                  color: 'white',
                  fontSize: '13px',
                  cursor: 'pointer'
                }}
              >
                <option value={1}>1 - 低</option>
                <option value={2}>2</option>
                <option value={3}>3 - 中</option>
                <option value={4}>4</option>
                <option value={5}>5 - 高</option>
              </select>
            </div>

            {/* タグ */}
            <div style={{ marginTop: '12px' }}>
              <label style={{ color: '#e2e8f0', display: 'block', marginBottom: '8px' }}>
                🏷️ タグ
              </label>
              
              {/* 既存タグの表示 */}
              <div style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '6px',
                marginBottom: '8px'
              }}>
                {(selectedNode.metadata?.tags || []).map((tag, index) => (
                  <span
                    key={index}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '4px 8px',
                      background: '#3b82f6',
                      borderRadius: '12px',
                      fontSize: '12px',
                      color: 'white'
                    }}
                  >
                    {tag}
                    <button
                      onClick={() => {
                        const currentTags = selectedNode.metadata?.tags || [];
                        const newTags = currentTags.filter((_, i) => i !== index);
                        updateNode(selectedNode.id, {
                          metadata: {
                            ...selectedNode.metadata,
                            tags: newTags.length > 0 ? newTags : undefined
                          }
                        });
                      }}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'white',
                        cursor: 'pointer',
                        padding: '0',
                        fontSize: '14px',
                        lineHeight: '1',
                        opacity: 0.7
                      }}
                      title="タグを削除"
                    >
                      ×
                    </button>
                  </span>
                ))}
                {(!selectedNode.metadata?.tags || selectedNode.metadata.tags.length === 0) && (
                  <span style={{ color: '#64748b', fontSize: '12px' }}>タグなし</span>
                )}
              </div>
              
              {/* 新規タグ追加 */}
              <div style={{ display: 'flex', gap: '6px' }}>
                <input
                  type="text"
                  placeholder="新しいタグを入力..."
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const input = e.currentTarget;
                      const newTag = input.value.trim();
                      if (newTag) {
                        const currentTags = selectedNode.metadata?.tags || [];
                        if (!currentTags.includes(newTag)) {
                          updateNode(selectedNode.id, {
                            metadata: {
                              ...selectedNode.metadata,
                              tags: [...currentTags, newTag]
                            }
                          });
                        }
                        input.value = '';
                      }
                    }
                  }}
                  style={{
                    flex: 1,
                    padding: '6px 10px',
                    borderRadius: '6px',
                    border: '1px solid #475569',
                    background: '#0f172a',
                    color: 'white',
                    fontSize: '12px'
                  }}
                />
                <button
                  onClick={(e) => {
                    const input = e.currentTarget.previousElementSibling as HTMLInputElement;
                    const newTag = input.value.trim();
                    if (newTag) {
                      const currentTags = selectedNode.metadata?.tags || [];
                      if (!currentTags.includes(newTag)) {
                        updateNode(selectedNode.id, {
                          metadata: {
                            ...selectedNode.metadata,
                            tags: [...currentTags, newTag]
                          }
                        });
                      }
                      input.value = '';
                    }
                  }}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '6px',
                    border: 'none',
                    background: '#3b82f6',
                    color: 'white',
                    fontSize: '12px',
                    cursor: 'pointer'
                  }}
                >
                  追加
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* トピック集の項目管理 */}
      {selectedNode.type === 'topicCollection' && !isEditing && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div>
            <h3 style={{ margin: '0 0 8px 0', fontSize: '14px', color: '#94a3b8' }}>
              トピック項目 ({selectedNode.topicItems?.length || 0})
            </h3>
            {selectedNode.isLoading ? (
              <div style={{ padding: '12px', background: '#1e293b', borderRadius: '8px', color: '#94a3b8', fontSize: '13px' }}>
                項目を抽出しています...
              </div>
            ) : (selectedNode.topicItems?.length || 0) === 0 ? (
              <div style={{ padding: '12px', background: '#1e293b', borderRadius: '8px', color: '#94a3b8', fontSize: '13px' }}>
                項目がありません。下のフォームから追加できます。
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {selectedNode.topicItems?.map((item) => {
                  const isEditingItem = editingTopicItemId === item.id;
                  return (
                    <div key={item.id} style={{ padding: '10px', background: '#1e293b', borderRadius: '8px', fontSize: '13px' }}>
                      {isEditingItem ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          <input
                            value={topicItemTitle}
                            onChange={(event) => setTopicItemTitle(event.target.value)}
                            placeholder="項目名"
                            style={topicItemInputStyle}
                          />
                          <textarea
                            value={topicItemDescription}
                            onChange={(event) => setTopicItemDescription(event.target.value)}
                            placeholder="短い概要"
                            rows={2}
                            style={{ ...topicItemInputStyle, resize: 'vertical' }}
                          />
                          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
                            <button onClick={() => setEditingTopicItemId(null)} style={{ ...actionButtonStyle, padding: '5px 9px' }}>
                              キャンセル
                            </button>
                            <button onClick={handleSaveTopicItem} style={{ ...actionButtonStyle, padding: '5px 9px', background: '#0f766e' }}>
                              保存
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                          <input
                            type="checkbox"
                            checked={selectedTopicItemIds.has(item.id)}
                            onChange={() => handleToggleTopicItem(item.id)}
                            aria-label={`${item.title}を選択`}
                            style={{ marginTop: '3px', accentColor: '#14b8a6' }}
                          />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ color: '#f1f5f9', fontWeight: 700 }}>{item.title}</div>
                            {item.description && (
                              <div style={{ marginTop: '3px', color: '#94a3b8', whiteSpace: 'pre-wrap' }}>{item.description}</div>
                            )}
                          </div>
                          <div style={{ display: 'flex', gap: '4px' }}>
                            <button onClick={() => handleStartEditTopicItem(item)} title="項目を編集" style={{ ...actionButtonStyle, padding: '4px 7px' }}>
                              編集
                            </button>
                            <button onClick={() => handleDeleteTopicItem(item.id)} title="項目を削除" style={{ ...actionButtonStyle, padding: '4px 7px', background: '#7f1d1d' }}>
                              削除
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div style={{ padding: '10px', background: '#1e293b', borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <h4 style={{ margin: 0, color: '#94a3b8', fontSize: '13px' }}>項目を追加</h4>
            <input
              value={newTopicItemTitle}
              onChange={(event) => setNewTopicItemTitle(event.target.value)}
              placeholder="項目名"
              style={topicItemInputStyle}
            />
            <textarea
              value={newTopicItemDescription}
              onChange={(event) => setNewTopicItemDescription(event.target.value)}
              placeholder="短い概要（任意）"
              rows={2}
              style={{ ...topicItemInputStyle, resize: 'vertical' }}
            />
            <button
              onClick={handleAddTopicItem}
              disabled={!newTopicItemTitle.trim()}
              style={{ ...actionButtonStyle, justifyContent: 'center', background: '#0f766e', opacity: newTopicItemTitle.trim() ? 1 : 0.5 }}
            >
              項目を追加
            </button>
          </div>

          <button
            onClick={handleCreateTopicFromSelectedItems}
            disabled={selectedTopicItemIds.size === 0 || selectedNode.isLoading}
            style={{
              ...actionButtonStyle,
              justifyContent: 'center',
              background: '#7c3aed',
              opacity: selectedTopicItemIds.size > 0 && !selectedNode.isLoading ? 1 : 0.5
            }}
          >
            選択した項目からトピックを生成
          </button>
        </div>
      )}

      {/* 親ノード一覧（質問ノードのみ表示） */}
      {selectedNode.type === 'message' && selectedNode.role === 'user' && selectedNode.parentIds.length > 0 && (
        <div>
          <h3 style={{ margin: '0 0 8px 0', fontSize: '14px', color: '#94a3b8' }}>
            🔗 親ノード ({selectedNode.parentIds.length})
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {selectedNode.parentIds.map((parentId, index) => {
              const parent = getNodeById(parentId);
              if (!parent) return null;
              const isMainParent = index === 0;
              return (
                <div 
                  key={parentId} 
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 10px',
                    background: isMainParent ? '#1e3a5f' : '#1e293b',
                    borderRadius: '6px',
                    fontSize: '13px',
                    border: isMainParent ? '1px solid #3b82f6' : '1px solid transparent'
                  }}
                >
                  <span 
                    style={{ 
                      flex: 1, 
                      overflow: 'hidden', 
                      textOverflow: 'ellipsis', 
                      whiteSpace: 'nowrap',
                      cursor: 'pointer'
                    }}
                    onClick={() => selectNode(parentId)}
                    title={parent.title || parent.content}
                  >
                    {isMainParent && <span style={{ color: '#fbbf24' }}>⭐ </span>}
                    {getNodeTypeIcon(parent.type)} {parent.title || parent.content.slice(0, 30)}
                  </span>
                  <div style={{ display: 'flex', gap: '4px', marginLeft: '8px' }}>
                    {!isMainParent && (
                      <button 
                        onClick={() => setMainParent(selectedNode.id, parentId)} 
                        title="メイン親に設定"
                        style={{
                          background: '#475569',
                          border: 'none',
                          borderRadius: '4px',
                          padding: '4px 6px',
                          cursor: 'pointer',
                          fontSize: '12px',
                          color: 'white'
                        }}
                      >
                        ⬆️
                      </button>
                    )}
                    {selectedNode.parentIds.length > 1 && (
                      <button 
                        onClick={() => removeParentChild(parentId, selectedNode.id)} 
                        title="接続を削除"
                        style={{
                          background: '#7f1d1d',
                          border: 'none',
                          borderRadius: '4px',
                          padding: '4px 6px',
                          cursor: 'pointer',
                          fontSize: '12px',
                          color: 'white'
                        }}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* アクション */}
      <div>
        <h3 style={{ margin: '0 0 8px 0', fontSize: '14px', color: '#94a3b8' }}>
          ⚡ アクション
        </h3>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {isConnectingParent ? (
            <button 
              onClick={handleCancelConnectParent} 
              style={{
                ...actionButtonStyle,
                background: '#dc2626'
              }}
            >
              ❌ 親接続をキャンセル
            </button>
          ) : (
            <>
              {selectedNode.type === 'topic' && (
                <button onClick={handleCreateQuestionFromTopic} style={actionButtonStyle}>
                  ❓ 質問ノードを作成
                </button>
              )}
              <button onClick={handleCreateNote} style={actionButtonStyle}>
                📝 メモを追加
              </button>
              {/* 親ノード追加はeditableとcanResendの時のみ */}
              {selectedNode.type === 'message' && selectedNode.role === 'user' && questionEditState !== 'duplicateOnly' && (
                <button onClick={handleStartConnectParent} style={actionButtonStyle}>
                  🔗 親ノード追加
                </button>
              )}
            </>
          )}
          {selectedNode.type === 'message' && selectedNode.role === 'assistant' && (
            <>
              <button 
                onClick={handleGenerateTopicCollection}
                disabled={isLoading || isAiResponding || hasTopicCollectionChild}
                style={{
                  ...actionButtonStyle,
                  opacity: (isLoading || isAiResponding || hasTopicCollectionChild) ? 0.5 : 1
                }}
              >
                💡 トピック集を作成
              </button>
              <button 
                onClick={() => setShowCreateTopicModal(true)}
                style={actionButtonStyle}
              >
                ✏️ トピック作成
              </button>
              <button 
                onClick={handleGenerateNote} 
                disabled={isLoading || isAiResponding}
                style={{
                  ...actionButtonStyle,
                  opacity: (isLoading || isAiResponding) ? 0.5 : 1
                }}
              >
                ✨ AI下書き
              </button>
            </>
          )}
        </div>
      </div>

      <hr style={{ border: 'none', borderTop: '1px solid #334155', margin: '0' }} />

      {/* 質問入力（質問ノード選択時のみ） */}
      {selectedNode.type === 'message' && selectedNode.role === 'user' ? (
        <div>
          {questionEditState === 'duplicateOnly' ? (
            // 回答あり＆その先に質問あり → 編集不可、複製のみ
            <>
              <h3 style={{ margin: '0 0 8px 0', fontSize: '14px', color: '#94a3b8' }}>
                💬 質問（編集不可）
              </h3>
              <div style={{
                padding: '12px',
                background: '#1e293b',
                borderRadius: '8px',
                fontSize: '13px',
                color: '#94a3b8',
                marginBottom: '8px',
                border: '1px solid #475569'
              }}>
                <div style={{ whiteSpace: 'pre-wrap' }}>
                  {selectedNode.content || '(内容なし)'}
                </div>
              </div>
              <div style={{
                padding: '10px 12px',
                background: '#1e3a5f',
                borderRadius: '8px',
                fontSize: '12px',
                color: '#93c5fd',
                marginBottom: '12px'
              }}>
                この質問には回答があり、さらにその先に質問が続いています。<br />
                別の質問をしたい場合は「複製して質問」を使用してください。
              </div>
              <button
                onClick={handleDuplicateQuestion}
                style={{
                  ...actionButtonStyle,
                  width: '100%',
                  justifyContent: 'center',
                  background: '#6366f1'
                }}
              >
                📋 複製して質問
              </button>
            </>
          ) : (
            // editable または canResend → 編集可能
            <>
              <h3 style={{ margin: '0 0 8px 0', fontSize: '14px', color: '#94a3b8' }}>
                💬 質問する
                {questionEditState === 'canResend' && (
                  <span style={{ 
                    fontSize: '11px', 
                    color: '#fbbf24', 
                    marginLeft: '8px',
                    fontWeight: 'normal'
                  }}>
                    (再送信時は既存の回答が削除されます)
                  </span>
                )}
              </h3>
              {/* モデル選択ドロップダウン */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginBottom: '8px'
              }}>
                <label style={{ fontSize: '12px', color: '#94a3b8' }}>
                  🤖 モデル:
                </label>
                <select
                  value={selectedModel || board?.settings.defaultModel || ''}
                  onChange={(e) => handleModelChange(e.target.value)}
                  disabled={isLoading || isAiResponding}
                  style={{
                    flex: 1,
                    padding: '6px 10px',
                    borderRadius: '6px',
                    border: '1px solid #475569',
                    background: '#0f172a',
                    color: 'white',
                    fontSize: '13px',
                    cursor: 'pointer'
                  }}
                >
                  {getModelsForProvider(board?.settings.defaultProvider || 'openai').map(model => (
                    <option key={model.id} value={model.id}>
                      {model.name}
                    </option>
                  ))}
                </select>
              </div>
              <textarea
                ref={questionInputRef}
                value={questionInput}
                onChange={(e) => setQuestionInput(e.target.value)}
                placeholder="この質問を入力..."
                rows={4}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  border: '1px solid #475569',
                  background: '#0f172a',
                  color: 'white',
                  fontSize: '14px',
                  resize: 'vertical',
                  boxSizing: 'border-box',
                  marginBottom: '8px'
                }}
                disabled={isLoading || isAiResponding}
              />
              <button
                onClick={handleSendQuestion}
                disabled={!questionInput.trim() || isLoading || isAiResponding}
                style={{
                  ...actionButtonStyle,
                  width: '100%',
                  justifyContent: 'center',
                  background: questionEditState === 'canResend' ? '#f59e0b' : '#6366f1',
                  opacity: questionInput.trim() && !isLoading && !isAiResponding ? 1 : 0.5
                }}
              >
                {isLoading 
                  ? '⏳ 送信中...' 
                  : questionEditState === 'canResend' 
                    ? '🔄 再送信' 
                    : '🚀 送信'}
              </button>
            </>
          )}
        </div>
      ) : (
        <div style={{ textAlign: 'center', color: '#64748b', padding: '12px', background: '#0f172a', borderRadius: '8px' }}>
          <div style={{ fontSize: '13px' }}>
            トピックを選択して「質問ノードを作成」した後、その質問ノードを選択して入力してください。
          </div>
        </div>
      )}
    </div>
  );
};

// ========================================
// ヘルパー関数
// ========================================

/**
 * コンテキストメッセージを収集する（サブ親を含む）
 * メイン親チェーン + サブ親チェーン（メイン親と合流するまで）を取得
 * topic/noteも含める
 */
interface ContextResult {
  mainContext: Array<{ role: 'user' | 'assistant' | 'system'; content: string; nodeType: string }>;
  subContexts: Array<{
    parentNodeId: string;
    messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string; nodeType: string }>;
  }>;
}

/**
 * ボード全体からpin留めノードを収集する
 * @param allNodes - ボード内の全ノード
 * @param excludeIds - 除外するノードID（既にコンテキストに含まれているもの）
 * @returns pin留めノードの配列
 */
function collectPinnedNodes(allNodes: MindNode[], excludeIds: Set<string>): MindNode[] {
  return allNodes.filter(node => 
    node.type !== 'topicCollection' && node.metadata?.pin === true && !excludeIds.has(node.id)
  );
}

/**
 * ノードからコンテキストメッセージを生成
 */
function nodeToContextMessage(node: MindNode): { role: 'user' | 'assistant' | 'system'; content: string; nodeType: string } | null {
  if (node.type === 'message') {
    return {
      role: node.role,
      content: node.content,
      nodeType: 'message'
    };
  } else if (node.type === 'topic') {
    return {
      role: 'system' as const,
      content: `[トピック] ${node.title || node.content}`,
      nodeType: 'topic'
    };
  } else if (node.type === 'note') {
    return {
      role: 'system' as const,
      content: `[メモ] ${node.title ? node.title + ': ' : ''}${node.content}`,
      nodeType: 'note'
    };
  } else if (node.type === 'topicCollection') {
    return null;
  }
  return null;
}

/**
 * メイン親チェーンを収集（rootまで）
 */
function collectMainChain(nodes: MindNode[], startNode: MindNode): { messages: ContextResult['mainContext']; visitedIds: Set<string> } {
  const messages: ContextResult['mainContext'] = [];
  const visitedIds = new Set<string>();
  
  let current: MindNode | undefined = startNode;
  
  while (current && !visitedIds.has(current.id)) {
    visitedIds.add(current.id);
    
    const msg = nodeToContextMessage(current);
    if (msg) {
      messages.unshift(msg);
    }
    
    // メイン親を辿る
    const mainParentId: string | undefined = current.parentIds[0];
    if (mainParentId) {
      current = nodes.find((n) => n.id === mainParentId);
    } else {
      break;
    }
  }
  
  return { messages, visitedIds };
}

/**
 * サブ親チェーンを収集（メイン親チェーンと合流するまで）
 */
function collectSubChain(
  nodes: MindNode[], 
  subParentId: string, 
  mainChainIds: Set<string>
): ContextResult['subContexts'][0]['messages'] {
  const messages: ContextResult['subContexts'][0]['messages'] = [];
  const visited = new Set<string>();
  
  let current: MindNode | undefined = nodes.find((n) => n.id === subParentId);
  
  while (current && !visited.has(current.id)) {
    // メイン親チェーンと合流したら終了
    if (mainChainIds.has(current.id)) {
      break;
    }
    
    visited.add(current.id);
    
    const msg = nodeToContextMessage(current);
    if (msg) {
      messages.unshift(msg);
    }
    
    // メイン親を辿る
    const mainParentId: string | undefined = current.parentIds[0];
    if (mainParentId) {
      current = nodes.find((n) => n.id === mainParentId);
    } else {
      break;
    }
  }
  
  return messages;
}

/**
 * コンテキストを収集（メイン親 + サブ親）
 */
function collectContextWithSubParents(nodes: MindNode[], startNode: MindNode): ContextResult {
  // メイン親チェーンを収集
  const { messages: mainContext, visitedIds: mainChainIds } = collectMainChain(nodes, startNode);
  
  // サブ親チェーンを収集
  const subContexts: ContextResult['subContexts'] = [];
  
  // startNodeのサブ親（parentIds[1]以降）を処理
  for (let i = 1; i < startNode.parentIds.length; i++) {
    const subParentId = startNode.parentIds[i];
    const subMessages = collectSubChain(nodes, subParentId, mainChainIds);
    
    if (subMessages.length > 0) {
      subContexts.push({
        parentNodeId: subParentId,
        messages: subMessages
      });
    }
  }
  
  return { mainContext, subContexts };
}

/**
 * コンテキストをLLM用のメッセージ配列に変換
 * @param contextResult - メイン・サブコンテキスト
 * @param allNodes - ボード全体のノード（pin留めノード収集用、省略可）
 */
function formatContextForLLM(
  contextResult: ContextResult,
  allNodes?: MindNode[]
): Array<{ role: 'user' | 'assistant' | 'system'; content: string }> {
  const messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> = [];
  
  // メインコンテキストに含まれるノードIDを収集（重複除外用）
  const includedNodeIds = new Set<string>();
  // ※ contextResultにはnodeIdが含まれていないため、contentベースでは判別できない
  // ここではnodeTypeを頼りに判別し、別途allNodesからpin留めを検索する
  
  // pin留めノードを収集してコンテキストに追加（決定事項・重要な前提）
  if (allNodes && allNodes.length > 0) {
    // メイン・サブコンテキストで既に含まれているノードを特定するため、
    // collectContextWithSubParentsでvisitedIdsを返すよう拡張が必要だが、
    // 現状はシンプルにpin留めノードすべてを追加（重複は許容）
    const pinnedNodes = collectPinnedNodes(allNodes, includedNodeIds);
    
    if (pinnedNodes.length > 0) {
      const pinnedTexts = pinnedNodes.map(node => {
        const typeLabel = node.type === 'note' ? 'メモ' : 
                         node.type === 'topic' ? 'トピック' : 
                         node.type === 'root' ? 'テーマ' : 'メッセージ';
        const title = node.title ? `${node.title}: ` : '';
        return `📌 [${typeLabel}] ${title}${node.content}`;
      });
      
      messages.push({
        role: 'system',
        content: `--- 決定事項・重要な前提 ---\n${pinnedTexts.join('\n\n')}\n--- 決定事項ここまで ---`
      });
    }
  }
  
  // メイン親チェーンを追加
  for (const msg of contextResult.mainContext) {
    messages.push({ role: msg.role, content: msg.content });
  }
  
  // サブ親チェーンを追加（関連文脈として）
  if (contextResult.subContexts.length > 0) {
    let subContextText = '--- 関連する別の議論 ---\n';
    for (const sub of contextResult.subContexts) {
      for (const msg of sub.messages) {
        subContextText += `[${msg.role}] ${msg.content}\n\n`;
      }
    }
    subContextText += '--- 関連議論ここまで ---';
    
    messages.push({
      role: 'system',
      content: subContextText
    });
  }
  
  return messages;
}

/**
 * 旧API互換: コンテキストメッセージを収集する
 * @param nodes - ノード一覧
 * @param startNode - 開始ノード
 * @deprecated collectContextWithSubParents + formatContextForLLM を使用してください
 */
function collectContext(nodes: MindNode[], startNode: MindNode): Array<{ role: 'user' | 'assistant' | 'system'; content: string }> {
  const result = collectContextWithSubParents(nodes, startNode);
  // pin留めノードも含めてコンテキストを生成
  return formatContextForLLM(result, nodes);
}

function getNodeTypeIcon(type: NodeType): string {
  switch (type) {
    case 'root': return '📌';
    case 'message': return '💬';
    case 'note': return '📝';
    case 'topic': return '💡';
    case 'topicCollection': return '🗂️';
    default: return '📄';
  }
}

function getNodeTypeLabel(type: NodeType): string {
  switch (type) {
    case 'root': return 'ルート';
    case 'message': return 'メッセージ';
    case 'note': return 'メモ';
    case 'topic': return 'トピック';
    case 'topicCollection': return 'トピック集';
    default: return 'ノード';
  }
}

const actionButtonStyle: React.CSSProperties = {
  padding: '8px 12px',
  borderRadius: '6px',
  border: 'none',
  background: '#334155',
  color: 'white',
  fontSize: '13px',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: '4px'
};

const topicItemInputStyle: React.CSSProperties = {
  width: '100%',
  padding: '7px 9px',
  borderRadius: '6px',
  border: '1px solid #475569',
  background: '#0f172a',
  color: 'white',
  fontSize: '13px',
  boxSizing: 'border-box'
};
