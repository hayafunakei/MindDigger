/**
 * ツールバーコンポーネント
 * ファイル操作やボード作成などのアクションを提供
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useBoardStore } from '../stores/boardStore';
import { useSettingsStore } from '../stores/settingsStore';
import { SettingsDialog } from './SettingsDialog';
import { BoardSelectorDialog } from './BoardSelectorDialog';

/**
 * ツールバー
 */
export const Toolbar: React.FC = () => {
  const { board, nodes, summaries, filePath, isDirty, isLoading, isAiResponding, createBoard, getBoardData, setFilePath, markClean, setLoading } = useBoardStore();
  const [showNewBoardDialog, setShowNewBoardDialog] = useState(false);
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const [showBoardSelector, setShowBoardSelector] = useState(false);
  const [newBoardTitle, setNewBoardTitle] = useState('');
  const [newBoardDescription, setNewBoardDescription] = useState('');
  const [newBoardModel, setNewBoardModel] = useState('');
  const autoSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSavingRef = useRef(false);
  const pendingAutoSaveRef = useRef(false);

  // 設定ストアからモデル一覧を取得
  const { availableModels, loadAvailableModels, getModelsForProvider, getDefaultModelForProvider, settings } = useSettingsStore();

  // モデル一覧を読み込み
  useEffect(() => {
    if (!availableModels) {
      loadAvailableModels();
    }
  }, [availableModels, loadAvailableModels]);

  // デフォルトモデルを初期化
  useEffect(() => {
    if (!newBoardModel && availableModels) {
      const defaultModel = settings.defaultModel || getDefaultModelForProvider('openai');
      setNewBoardModel(defaultModel);
    }
  }, [availableModels, newBoardModel, settings.defaultModel, getDefaultModelForProvider]);

  /**
   * 新規ボードを作成
   */
  const handleCreateBoard = async () => {
    if (!newBoardTitle.trim()) return;

    try {
      // 親フォルダを確認
      const settings = await window.electronAPI.getSettings();
      if (!settings.parentFolderPath) {
        alert('先に親フォルダを選択してください（設定から変更可能）');
        return;
      }

      // ボードを作成（選択されたモデルを使用）
      createBoard(newBoardTitle.trim(), newBoardDescription.trim() || undefined, newBoardModel || undefined);
      setShowNewBoardDialog(false);
      setNewBoardTitle('');
      setNewBoardDescription('');
      setNewBoardModel('');

      await handleSaveBoard();
    } catch (error) {
      console.error('Failed to create board:', error);
      alert('ボードの作成に失敗しました');
    }
  };

  /**
   * ボードを開く
   */
  const handleOpenBoard = () => {
    setShowBoardSelector(true);
  };

  /**
   * ボードを保存
   */
  const handleSaveBoard = useCallback(async (isAutomatic = false) => {
    if (isSavingRef.current) {
      if (isAutomatic) pendingAutoSaveRef.current = true;
      return;
    }

    const data = getBoardData();
    if (!data) return;

    const currentFilePath = useBoardStore.getState().filePath;
    if (isAutomatic && (!currentFilePath || useBoardStore.getState().isAiResponding)) return;

    isSavingRef.current = true;
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
      autoSaveTimeoutRef.current = null;
    }
    setLoading(true);
    try {
      const path = await window.electronAPI.saveBoard(data, currentFilePath || undefined);
      if (path) {
        const currentState = useBoardStore.getState();
        if (currentState.board?.id === data.board.id) {
          setFilePath(path);
          if (
            currentState.board === data.board &&
            currentState.nodes === data.nodes &&
            currentState.summaries === data.summaries
          ) {
            markClean();
          }
        }
      }
    } catch (error) {
      console.error('Failed to save board:', error);
      alert(isAutomatic ? '自動保存に失敗しました。手動で保存してください。' : 'ボードを保存できませんでした');
    } finally {
      isSavingRef.current = false;
      setLoading(false);
      if (pendingAutoSaveRef.current) {
        pendingAutoSaveRef.current = false;
        const currentState = useBoardStore.getState();
        if (currentState.isDirty && currentState.filePath && !currentState.isAiResponding) {
          autoSaveTimeoutRef.current = setTimeout(() => {
            void handleSaveBoard(true);
          }, 500);
        }
      }
    }
  }, [getBoardData, markClean, setFilePath, setLoading]);

  useEffect(() => {
    if (!isDirty || !board || !filePath || isAiResponding) return;

    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }
    autoSaveTimeoutRef.current = setTimeout(() => {
      void handleSaveBoard(true);
    }, 500);

    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
        autoSaveTimeoutRef.current = null;
      }
    };
  }, [board, nodes, summaries, filePath, isDirty, isAiResponding, handleSaveBoard]);

  return (
    <>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '8px 16px',
        background: '#1e293b',
        borderBottom: '1px solid #334155',
        color: 'white'
      }}>
        {/* ロゴ */}
        <div style={{ 
          fontWeight: 'bold', 
          fontSize: '18px',
          marginRight: '24px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <span>🧠</span>
          <span>Mind Digger</span>
        </div>

        {/* アクションボタン */}
        <button
          onClick={() => setShowNewBoardDialog(true)}
          disabled={isAiResponding}
          style={{
            ...buttonStyle,
            opacity: isAiResponding ? 0.5 : 1,
            cursor: isAiResponding ? 'not-allowed' : 'pointer'
          }}
        >
          ➕ 新規ボード
        </button>

        <button
          onClick={handleOpenBoard}
          disabled={isLoading || isAiResponding}
          style={{
            ...buttonStyle,
            opacity: (isLoading || isAiResponding) ? 0.5 : 1,
            cursor: (isLoading || isAiResponding) ? 'not-allowed' : 'pointer'
          }}
        >
          📂 開く
        </button>

        <button
          onClick={() => void handleSaveBoard()}
          disabled={!board || isLoading}
          style={{
            ...buttonStyle,
            opacity: board ? 1 : 0.5
          }}
        >
          💾 保存{isDirty ? '*' : ''}
        </button>

        {/* スペーサー */}
        <div style={{ flex: 1 }} />

        {/* ボード名 */}
        {board && (
          <div style={{ 
            fontSize: '14px', 
            color: '#94a3b8',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <span>📋</span>
            <span>{board.title}</span>
          </div>
        )}

        {/* 設定ボタン */}
        <button
          onClick={() => setShowSettingsDialog(true)}
          style={buttonStyle}
        >
          ⚙️ 設定
        </button>
      </div>

      {/* 設定ダイアログ */}
      <SettingsDialog
        isOpen={showSettingsDialog}
        onClose={() => setShowSettingsDialog(false)}
      />

      {/* ボード選択ダイアログ */}
      <BoardSelectorDialog
        isOpen={showBoardSelector}
        onClose={() => setShowBoardSelector(false)}
      />

      {/* 新規ボードダイアログ */}
      {showNewBoardDialog && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: '#1e293b',
            borderRadius: '12px',
            padding: '24px',
            width: '400px',
            color: 'white'
          }}>
            <h2 style={{ margin: '0 0 16px 0', fontSize: '18px' }}>
              🆕 新規ボードを作成
            </h2>
            
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px' }}>
                タイトル *
              </label>
              <input
                type="text"
                value={newBoardTitle}
                onChange={(e) => setNewBoardTitle(e.target.value)}
                placeholder="例: 新規アプリ構想"
                style={inputStyle}
                autoFocus
              />
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px' }}>
                説明（テーマ・悩み）
              </label>
              <textarea
                value={newBoardDescription}
                onChange={(e) => setNewBoardDescription(e.target.value)}
                placeholder="例: 新しいアプリのアイデアを整理したい..."
                rows={4}
                style={{
                  ...inputStyle,
                  resize: 'vertical'
                }}
              />
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px' }}>
                🤖 デフォルトモデル
              </label>
              <select
                value={newBoardModel || settings.defaultModel || ''}
                onChange={(e) => setNewBoardModel(e.target.value)}
                style={{
                  ...inputStyle,
                  cursor: 'pointer'
                }}
              >
                {getModelsForProvider('openai').map(model => (
                  <option key={model.id} value={model.id}>
                    {model.name}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowNewBoardDialog(false)}
                style={{
                  ...buttonStyle,
                  background: '#475569'
                }}
              >
                キャンセル
              </button>
              <button
                onClick={handleCreateBoard}
                disabled={!newBoardTitle.trim()}
                style={{
                  ...buttonStyle,
                  background: '#6366f1',
                  opacity: newBoardTitle.trim() ? 1 : 0.5
                }}
              >
                作成
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

const buttonStyle: React.CSSProperties = {
  padding: '6px 12px',
  borderRadius: '6px',
  border: 'none',
  background: '#334155',
  color: 'white',
  fontSize: '13px',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  transition: 'background 0.2s'
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: '6px',
  border: '1px solid #475569',
  background: '#0f172a',
  color: 'white',
  fontSize: '14px',
  boxSizing: 'border-box'
};
