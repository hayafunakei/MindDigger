/**
 * サイドパネルコンポーネント
 * ノード詳細、質問入力、サマリー表示などを提供
 */
import React, { useState, useCallback, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useBoardStore } from '../stores/boardStore';
import { TimelineModal } from './TimelineModal';
import { CreateTopicModal } from './CreateTopicModal';
import type { MindNode, NodeType, Role, NodeId } from '@shared/types';

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
 * サイドパネル
 */
export const SidePanel: React.FC = () => {
  const { 
    board, 
    nodes, 
    selectedNodeId, 
    getNodeById, 
    addNode, 
    updateNode, 
    addSummary, 
    deleteNode,
    selectNode,
    isConnectingParent,
    startConnectingParent,
    cancelConnectingParent,
    removeParentChild,
    setMainParent
  } = useBoardStore();
  const [questionInput, setQuestionInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [summary, setSummary] = useState<string>('');
  const [showSummary, setShowSummary] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [showTimelineModal, setShowTimelineModal] = useState(false);
  const [showCreateTopicModal, setShowCreateTopicModal] = useState(false);
  const [panelWidth, setPanelWidth] = useState(320);
  const [isResizing, setIsResizing] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const questionInputRef = useRef<HTMLTextAreaElement>(null);
  const [pendingFocusNodeId, setPendingFocusNodeId] = useState<NodeId | null>(null);

  const selectedNode = selectedNodeId ? getNodeById(selectedNodeId) : null;

  // 質問ノードの編集状態を判定
  const questionEditState = selectedNode ? getQuestionEditState(selectedNode, nodes) : 'editable';

  /**
   * リサイズハンドルのマウスダウン
   */
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  /**
   * リサイズ中のマウス移動
   */
  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = window.innerWidth - e.clientX;
      setPanelWidth(Math.max(280, Math.min(600, newWidth)));
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

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
  }, [selectedNode]);

  // 複製後のフォーカス制御
  useEffect(() => {
    if (pendingFocusNodeId && selectedNodeId === pendingFocusNodeId) {
      // 少し待ってからフォーカス（レンダリング完了を待つ）
      const timer = setTimeout(() => {
        questionInputRef.current?.focus();
        setPendingFocusNodeId(null);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [pendingFocusNodeId, selectedNodeId]);

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

      // コンテキストを収集（メイン親チェーン + サブ親チェーン）
      // selectedNodeから収集開始し、selectedNode自身は後で追加するので除外
      const contextResult = collectContextWithSubParents(nodes, selectedNode);
      // selectedNode自身をメインコンテキストから除外（最後の要素）
      const mainContextWithoutSelf = contextResult.mainContext.slice(0, -1);
      const contextMessages = formatContextForLLM({
        mainContext: mainContextWithoutSelf,
        subContexts: contextResult.subContexts
      });
      
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
        model: board.settings.defaultModel,
        messages: llmMessages,
        temperature: board.settings.temperature
      });
      
      const response = await window.electronAPI.sendLLMRequest({
        provider: board.settings.defaultProvider,
        model: board.settings.defaultModel,
        messages: llmMessages,
        temperature: board.settings.temperature
      });

      // 回答ノードを作成
      const qaPairId = `qa-${Date.now()}`;
      addNode({
        boardId: board.id,
        type: 'message',
        role: 'assistant',
        title: '',
        content: response.content,
        parentIds: [selectedNode.id],
        provider: board.settings.defaultProvider,
        model: board.settings.defaultModel,
        usage: response.usage,
        createdBy: 'ai',
        position: {
          x: selectedNode.position.x,
          y: selectedNode.position.y + 150
        },
        qaPairId
      });

      // 質問ノードにもqaPairIdを設定
      updateNode(selectedNode.id, { qaPairId });

      setQuestionInput('');
    } catch (error) {
      console.error('Failed to send question:', error);
      alert(`エラーが発生しました: ${error instanceof Error ? error.message : '不明なエラー'}`);
    } finally {
      setIsLoading(false);
    }
  }, [questionInput, selectedNode, board, nodes, getNodeById, addNode, updateNode, deleteNode]);

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
      }
    });
  }, [selectedNode, board, addNode]);

  /**
   * AIでノートを生成
   */
  const handleGenerateNote = useCallback(async () => {
    if (!selectedNode || !board) return;

    setIsLoading(true);
    try {
      // コンテキストを収集
      const contextMessages = collectContext(nodes, selectedNode);
      const context = contextMessages.map(m => `${m.role}: ${m.content}`).join('\n\n');

      const noteContent = await window.electronAPI.generateNote({
        content: selectedNode.content,
        context
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
          importance: 4
        }
      });
    } catch (error) {
      console.error('Failed to generate note:', error);
      alert(`ノート生成に失敗しました: ${error instanceof Error ? error.message : '不明なエラー'}`);
    } finally {
      setIsLoading(false);
    }
  }, [selectedNode, board, nodes, addNode]);

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
    setQuestionInput('');
    setIsEditing(false);
  }, [selectedNode, board, addNode, selectNode]);

  /**
   * トピックを生成
   */
  const handleGenerateTopics = useCallback(async () => {
    if (!selectedNode || !board) return;

    setIsLoading(true);
    try {
      // コンテキストを収集
      const contextMessages = collectContext(nodes, selectedNode);
      const context = contextMessages.map(m => `${m.role}: ${m.content}`).join('\n\n');

      const topics = await window.electronAPI.generateTopics({
        content: selectedNode.content,
        context,
        maxTopics: 5
      });

      // 生成されたトピックをノードとして追加
      topics.forEach((topic, index) => {
        addNode({
          boardId: board.id,
          type: 'topic',
          role: 'system',
          title: topic.title,
          content: topic.description || topic.title,
          parentIds: [selectedNode.id],
          createdBy: 'ai',
          position: {
            x: selectedNode.position.x + (index - Math.floor(topics.length / 2)) * 150,
            y: selectedNode.position.y + 200
          },
          metadata: {
            importance: topic.importance,
            tags: topic.tags
          }
        });
      });
    } catch (error) {
      console.error('Failed to generate topics:', error);
      alert(`トピック生成に失敗しました: ${error instanceof Error ? error.message : '不明なエラー'}`);
    } finally {
      setIsLoading(false);
    }
  }, [selectedNode, board, nodes, addNode]);

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
   * サマリーを生成
   */
  const handleGenerateSummary = useCallback(async (scope: 'board' | 'nodeSubtree') => {
    if (!board) return;

    setIsLoading(true);
    try {
      // ノード情報を収集
      let targetNodes: MindNode[] = [];
      
      if (scope === 'board') {
        targetNodes = nodes.filter(n => n.type !== 'root');
      } else if (scope === 'nodeSubtree' && selectedNode) {
        // 選択ノード配下を収集（DFS）
        const collectSubtree = (nodeId: string, visited = new Set<string>()): MindNode[] => {
          if (visited.has(nodeId)) return [];
          visited.add(nodeId);
          
          const node = getNodeById(nodeId);
          if (!node) return [];
          
          const result = [node];
          node.childrenIds.forEach(childId => {
            result.push(...collectSubtree(childId, visited));
          });
          
          return result;
        };
        
        targetNodes = collectSubtree(selectedNode.id);
      }

      const summaryContent = await window.electronAPI.generateSummary({
        boardId: board.id,
        scope,
        targetNodeId: scope === 'nodeSubtree' ? selectedNode?.id : undefined,
        nodes: targetNodes.map(n => ({
          id: n.id,
          type: n.type,
          role: n.role,
          title: n.title,
          content: n.content,
          importance: n.metadata?.importance,
          pin: n.metadata?.pin,
          tags: n.metadata?.tags
        }))
      });

      setSummary(summaryContent);
      setShowSummary(true);

      // サマリーをストアに保存
      addSummary({
        boardId: board.id,
        scope,
        targetNodeId: scope === 'nodeSubtree' ? selectedNode?.id : undefined,
        content: summaryContent,
        provider: board.settings.defaultProvider,
        model: board.settings.defaultModel
      });
    } catch (error) {
      console.error('Failed to generate summary:', error);
      alert(`サマリー生成に失敗しました: ${error instanceof Error ? error.message : '不明なエラー'}`);
    } finally {
      setIsLoading(false);
    }
  }, [board, nodes, selectedNode, getNodeById, addSummary]);

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
  }, [selectedNode, board, addNode, selectNode]);

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
    const confirmed = window.confirm('このノードと配下のノードを削除しますか？');
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
      <div ref={panelRef} style={{ ...basePanelStyle, width: `${panelWidth}px` }}>
        <div
          onMouseDown={handleResizeStart}
          style={resizeHandleStyle}
          onMouseEnter={(e) => (e.currentTarget.style.background = '#6366f1')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        />
        <div style={{ textAlign: 'center', color: '#64748b', padding: '40px 20px' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>🧠</div>
          <h2 style={{ margin: '0 0 8px 0', color: '#e2e8f0' }}>Mind Digger</h2>
          <p style={{ margin: 0, fontSize: '14px' }}>
            ボードを作成または開いて、<br />思考の整理を始めましょう
          </p>
        </div>
      </div>
    );
  }

  return (
    <div ref={panelRef} style={{ ...basePanelStyle, width: `${panelWidth}px` }}>
      {/* リサイズハンドル */}
      <div
        onMouseDown={handleResizeStart}
        style={resizeHandleStyle}
        onMouseEnter={(e) => (e.currentTarget.style.background = '#6366f1')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
      />

      {/* サマリー表示 */}
      {showSummary && (
        <div style={{ marginBottom: '16px' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '8px'
          }}>
            <h3 style={{ margin: 0, fontSize: '14px', color: '#94a3b8' }}>
              📊 サマリー
            </h3>
            <button
              onClick={() => setShowSummary(false)}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#64748b',
                fontSize: '18px',
                cursor: 'pointer',
                padding: '0'
              }}
            >
              ×
            </button>
          </div>
          <div style={{
            padding: '12px',
            background: '#1e293b',
            borderRadius: '8px',
            fontSize: '13px',
            maxHeight: '400px',
            overflow: 'auto',
            lineHeight: '1.6'
          }}>
            <div className="markdown-content" style={{ color: '#e2e8f0' }}>
              <ReactMarkdown 
                remarkPlugins={[remarkGfm]}
                components={{
                  p: ({children}) => <p style={{ marginBottom: '0.75em' }}>{children}</p>,
                  ul: ({children}) => <ul style={{ marginLeft: '1.5em', marginBottom: '0.75em' }}>{children}</ul>,
                  ol: ({children}) => <ol style={{ marginLeft: '1.5em', marginBottom: '0.75em' }}>{children}</ol>,
                  li: ({children}) => <li style={{ marginBottom: '0.25em' }}>{children}</li>,
                  h1: ({children}) => <h1 style={{ fontSize: '1.5em', fontWeight: 600, marginTop: '1em', marginBottom: '0.5em', color: '#f1f5f9' }}>{children}</h1>,
                  h2: ({children}) => <h2 style={{ fontSize: '1.3em', fontWeight: 600, marginTop: '1em', marginBottom: '0.5em', color: '#f1f5f9' }}>{children}</h2>,
                  h3: ({children}) => <h3 style={{ fontSize: '1.15em', fontWeight: 600, marginTop: '1em', marginBottom: '0.5em', color: '#f1f5f9' }}>{children}</h3>,
                  strong: ({children}) => <strong style={{ fontWeight: 600, color: '#f1f5f9' }}>{children}</strong>,
                  code: ({children}) => <code style={{ background: '#334155', padding: '0.15em 0.4em', borderRadius: '4px', fontFamily: 'monospace', fontSize: '0.9em' }}>{children}</code>,
                }}
              >
                {summary}
              </ReactMarkdown>
            </div>
          </div>
        </div>
      )}

      {/* サマリー生成ボタン */}
      {!showSummary && (
        <div style={{ marginBottom: '16px' }}>
          <h3 style={{ margin: '0 0 8px 0', fontSize: '14px', color: '#94a3b8' }}>
            📊 サマリー生成
          </h3>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              onClick={() => handleGenerateSummary('board')}
              disabled={isLoading}
              style={{
                ...actionButtonStyle,
                opacity: isLoading ? 0.5 : 1
              }}
            >
              📋 全体
            </button>
            {selectedNode && (
              <button
                onClick={() => handleGenerateSummary('nodeSubtree')}
                disabled={isLoading}
                style={{
                  ...actionButtonStyle,
                  opacity: isLoading ? 0.5 : 1
                }}
              >
                🌳 配下
              </button>
            )}
          </div>
        </div>
      )}

      <hr style={{ border: 'none', borderTop: '1px solid #334155', margin: '16px 0' }} />

      {/* タイムラインモーダルを開くボタン */}
      {selectedNode && (
        <div style={{ marginBottom: '16px' }}>
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
        </div>
      )}

      {/* タイムラインモーダル */}
      <TimelineModal
        isOpen={showTimelineModal}
        onClose={handleCloseTimelineModal}
        selectedNode={selectedNode ?? null}
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

      <hr style={{ border: 'none', borderTop: '1px solid #334155', margin: '16px 0' }} />

      {/* 選択ノード情報 */}
      {selectedNode ? (
        <>
          <div style={{ marginBottom: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <h3 style={{ margin: 0, fontSize: '14px', color: '#94a3b8' }}>
                {getNodeTypeIcon(selectedNode.type)} 選択中のノード
              </h3>
              <div style={{ display: 'flex', gap: '6px' }}>
                {/* 質問ノードは編集不可、複製ボタンを表示 */}
                {selectedNode.type === 'message' && selectedNode.role === 'user' ? (
                  <button
                    onClick={handleDuplicateQuestion}
                    style={{ ...actionButtonStyle, padding: '6px 10px' }}
                  >
                    📋 複製
                  </button>
                ) : (
                  <button
                    onClick={handleStartEdit}
                    style={{ ...actionButtonStyle, padding: '6px 10px' }}
                    disabled={isEditing}
                  >
                    ✏️ 編集
                  </button>
                )}
                <button
                  onClick={handleDeleteNode}
                  style={{ ...actionButtonStyle, padding: '6px 10px', background: '#7f1d1d' }}
                  disabled={selectedNode.type === 'root'}
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
          </div>

          {/* 親ノード一覧（質問ノードのみ表示） */}
          {selectedNode.type === 'message' && selectedNode.role === 'user' && selectedNode.parentIds.length > 0 && (
            <div style={{ marginBottom: '16px' }}>
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
          <div style={{ marginBottom: '16px' }}>
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
                    onClick={handleGenerateTopics} 
                    disabled={isLoading}
                    style={{
                      ...actionButtonStyle,
                      opacity: isLoading ? 0.5 : 1
                    }}
                  >
                    💡 トピック生成
                  </button>
                  <button 
                    onClick={() => setShowCreateTopicModal(true)}
                    style={actionButtonStyle}
                  >
                    ✏️ トピック作成
                  </button>
                  <button 
                    onClick={handleGenerateNote} 
                    disabled={isLoading}
                    style={{
                      ...actionButtonStyle,
                      opacity: isLoading ? 0.5 : 1
                    }}
                  >
                    ✨ AI下書き
                  </button>
                </>
              )}
            </div>
          </div>

          <hr style={{ border: 'none', borderTop: '1px solid #334155', margin: '16px 0' }} />

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
                    disabled={isLoading}
                  />
                  <button
                    onClick={handleSendQuestion}
                    disabled={!questionInput.trim() || isLoading}
                    style={{
                      ...actionButtonStyle,
                      width: '100%',
                      justifyContent: 'center',
                      background: questionEditState === 'canResend' ? '#f59e0b' : '#6366f1',
                      opacity: questionInput.trim() && !isLoading ? 1 : 0.5
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
        </>
      ) : (
        <div style={{ textAlign: 'center', color: '#64748b', padding: '20px' }}>
          <p>ノードを選択してください</p>
        </div>
      )}
    </div>
  );
};

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
 */
function formatContextForLLM(
  contextResult: ContextResult
): Array<{ role: 'user' | 'assistant' | 'system'; content: string }> {
  const messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> = [];
  
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
 * @deprecated collectContextWithSubParents を使用してください
 */
function collectContext(nodes: MindNode[], startNode: MindNode): Array<{ role: 'user' | 'assistant' | 'system'; content: string }> {
  const result = collectContextWithSubParents(nodes, startNode);
  return formatContextForLLM(result);
}

function getNodeTypeIcon(type: NodeType): string {
  switch (type) {
    case 'root': return '📌';
    case 'message': return '💬';
    case 'note': return '📝';
    case 'topic': return '💡';
    default: return '📄';
  }
}

function getNodeTypeLabel(type: NodeType): string {
  switch (type) {
    case 'root': return 'ルート';
    case 'message': return 'メッセージ';
    case 'note': return 'メモ';
    case 'topic': return 'トピック';
    default: return 'ノード';
  }
}

const basePanelStyle: React.CSSProperties = {
  height: '100%',
  background: '#0f172a',
  borderLeft: '1px solid #334155',
  padding: '16px',
  boxSizing: 'border-box',
  overflow: 'auto',
  color: 'white',
  position: 'relative'
};

const resizeHandleStyle: React.CSSProperties = {
  position: 'absolute',
  left: 0,
  top: 0,
  bottom: 0,
  width: '4px',
  cursor: 'ew-resize',
  background: 'transparent',
  zIndex: 10
};

const resizeHandleHoverStyle: React.CSSProperties = {
  ...resizeHandleStyle,
  background: '#6366f1'
};

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
