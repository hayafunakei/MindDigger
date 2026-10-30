/**
 * アプリケーションのメインコンポーネント
 */
import React, { useEffect, useRef, useState } from 'react';
import { Toolbar } from './components/Toolbar';
import { MindMapCanvas } from './components/MindMapCanvas';
import { SidePanel } from './components/SidePanel';
import { BoardInfoModal } from './components/BoardInfoModal';
import { useSettingsStore } from './stores/settingsStore';
import { useBoardStore } from './stores/boardStore';

/**
 * メインアプリケーション
 */
export const App: React.FC = () => {
  const { loadSettings } = useSettingsStore();
  const { board, setBoard, setLoading } = useBoardStore();
  const [showBoardInfo, setShowBoardInfo] = useState(false);
  const hasRestoredBoard = useRef(false);

  // 前回開いていたボードを復元
  useEffect(() => {
    if (hasRestoredBoard.current) return;
    hasRestoredBoard.current = true;

    const restoreLastBoard = async () => {
      await loadSettings();
      const lastOpenedBoardPath = useSettingsStore.getState().settings.lastOpenedBoardPath;
      if (!lastOpenedBoardPath) return;

      setLoading(true);
      try {
        const data = await window.electronAPI.loadBoardFromPath(lastOpenedBoardPath);
        if (data) {
          setBoard(data, lastOpenedBoardPath);
        } else {
          alert('前回のボードを開けませんでした。保存先を確認し、「開く」から再度選択してください。');
        }
      } catch (error) {
        console.error('Failed to restore last opened board:', error);
        alert('前回のボードを開けませんでした。保存先を確認し、「開く」から再度選択してください。');
      } finally {
        setLoading(false);
      }
    };

    void restoreLastBoard();
  }, [loadSettings, setBoard, setLoading]);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      background: '#0f172a'
    }}>
      {/* ツールバー */}
      <Toolbar />

      {/* メインコンテンツ */}
      <div style={{
        display: 'flex',
        flex: 1,
        overflow: 'hidden',
        position: 'relative'
      }}>
        {/* マインドマップキャンバス */}
        <div style={{ flex: 1, position: 'relative' }}>
          <MindMapCanvas />

          {/* ボード情報フローティングボタン */}
          {board && (
            <button
              onClick={() => setShowBoardInfo(true)}
              style={{
                position: 'absolute',
                bottom: '20px',
                left: '20px',
                width: '56px',
                height: '56px',
                borderRadius: '50%',
                border: 'none',
                background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                color: 'white',
                fontSize: '24px',
                cursor: 'pointer',
                boxShadow: '0 4px 20px rgba(99, 102, 241, 0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 10,
                transition: 'transform 0.2s, box-shadow 0.2s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'scale(1.1)';
                e.currentTarget.style.boxShadow = '0 6px 30px rgba(99, 102, 241, 0.6)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'scale(1)';
                e.currentTarget.style.boxShadow = '0 4px 20px rgba(99, 102, 241, 0.4)';
              }}
              title="ボード情報"
            >
              📋
            </button>
          )}
        </div>

        {/* サイドパネル */}
        <SidePanel />
      </div>

      {/* ボード情報モーダル */}
      <BoardInfoModal
        isOpen={showBoardInfo}
        onClose={() => setShowBoardInfo(false)}
      />
    </div>
  );
};
