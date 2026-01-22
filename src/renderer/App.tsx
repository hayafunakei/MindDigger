/**
 * アプリケーションのメインコンポーネント
 */
import React, { useEffect } from 'react';
import { Toolbar } from './components/Toolbar';
import { MindMapCanvas } from './components/MindMapCanvas';
import { SidePanel } from './components/SidePanel';
import { useSettingsStore } from './stores/settingsStore';

/**
 * メインアプリケーション
 */
export const App: React.FC = () => {
  const { loadSettings } = useSettingsStore();

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
        overflow: 'hidden'
      }}>
        {/* マインドマップキャンバス */}
        <div style={{ flex: 1, position: 'relative' }}>
          <MindMapCanvas />
        </div>

        {/* サイドパネル */}
        <SidePanel />
      </div>
    </div>
  );
};
