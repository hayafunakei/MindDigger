/**
 * サイドパネルコンポーネント
 * タブUIでノード編集タブとサマリータブを切り替える
 */
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useBoardStore } from '../stores/boardStore';
import { NodeEditTab } from './tabs/NodeEditTab';
import { SummaryTab } from './tabs/SummaryTab';

/** タブの種類 */
type TabType = 'node' | 'summary';

/**
 * サイドパネル
 * 右ペインとして、ノード編集とサマリー生成の2つのタブを提供
 */
export const SidePanel: React.FC = () => {
  const { 
    board, 
    selectedNodeId,
    isAiResponding,
    setAiResponding
  } = useBoardStore();

  const [activeTab, setActiveTab] = useState<TabType>('node');
  const [panelWidth, setPanelWidth] = useState(320);
  const [isResizing, setIsResizing] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // ノード選択時は「ノード編集タブ」、未選択時は「サマリータブ」を自動表示
  useEffect(() => {
    if (selectedNodeId) {
      setActiveTab('node');
    } else {
      setActiveTab('summary');
    }
  }, [selectedNodeId]);

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

  // ボード未選択時のウェルカム画面
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

      {/* タブヘッダー */}
      <div style={tabHeaderStyle}>
        <button
          onClick={() => setActiveTab('node')}
          style={{
            ...tabButtonStyle,
            ...(activeTab === 'node' ? activeTabButtonStyle : inactiveTabButtonStyle)
          }}
        >
          📝 ノード編集
        </button>
        <button
          onClick={() => setActiveTab('summary')}
          style={{
            ...tabButtonStyle,
            ...(activeTab === 'summary' ? activeTabButtonStyle : inactiveTabButtonStyle)
          }}
        >
          📊 サマリー
        </button>
      </div>

      {/* AI応答中インジケータ */}
      {isAiResponding && (
        <div style={loadingIndicatorStyle}>
          <span style={{ animation: 'pulse 1.5s infinite' }}>⏳</span>
          AI処理中...
        </div>
      )}

      {/* タブコンテンツ */}
      <div style={tabContentStyle}>
        {activeTab === 'node' ? (
          <NodeEditTab 
            isAiResponding={isAiResponding}
            setIsAiResponding={setAiResponding}
          />
        ) : (
          <SummaryTab 
            isAiResponding={isAiResponding}
            setIsAiResponding={setAiResponding}
          />
        )}
      </div>
    </div>
  );
};

// ========================================
// スタイル定義
// ========================================

const basePanelStyle: React.CSSProperties = {
  height: '100%',
  background: '#0f172a',
  borderLeft: '1px solid #334155',
  boxSizing: 'border-box',
  overflow: 'hidden',
  color: 'white',
  position: 'relative',
  display: 'flex',
  flexDirection: 'column'
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

const tabHeaderStyle: React.CSSProperties = {
  display: 'flex',
  borderBottom: '1px solid #334155',
  background: '#1e293b',
  flexShrink: 0
};

const tabButtonStyle: React.CSSProperties = {
  flex: 1,
  padding: '12px 16px',
  border: 'none',
  background: 'transparent',
  color: 'white',
  fontSize: '13px',
  fontWeight: 500,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '6px',
  transition: 'all 0.2s ease'
};

const activeTabButtonStyle: React.CSSProperties = {
  background: '#0f172a',
  borderBottom: '2px solid #6366f1',
  color: '#e2e8f0'
};

const inactiveTabButtonStyle: React.CSSProperties = {
  background: '#1e293b',
  borderBottom: '2px solid transparent',
  color: '#94a3b8'
};

const loadingIndicatorStyle: React.CSSProperties = {
  padding: '8px 16px',
  background: '#1e3a5f',
  color: '#93c5fd',
  fontSize: '12px',
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  borderBottom: '1px solid #334155',
  flexShrink: 0
};

const tabContentStyle: React.CSSProperties = {
  flex: 1,
  overflow: 'auto',
  padding: '16px'
};
