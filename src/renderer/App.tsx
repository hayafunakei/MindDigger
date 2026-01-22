/**
 * アプリケーションのメインコンポーネント
 */
import React, { useEffect, useState } from 'react';
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
  const { board } = useBoardStore();
  const [showBoardInfo, setShowBoardInfo] = useState(false);

  // 初回読み込み時に設定を取得
  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

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
