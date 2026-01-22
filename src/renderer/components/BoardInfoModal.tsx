/**
 * ボード情報モーダルコンポーネント
 * フローティングボタンから表示される
 */
import React from 'react';
import { useBoardStore } from '../stores/boardStore';

interface BoardInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * ボード情報モーダル
 */
export const BoardInfoModal: React.FC<BoardInfoModalProps> = ({ isOpen, onClose }) => {
  const { board } = useBoardStore();

  if (!isOpen || !board) return null;

  return (
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
    }}
    onClick={onClose}
    >
      <div style={{
        background: '#1e293b',
        borderRadius: '12px',
        padding: '24px',
        width: '500px',
        maxWidth: '90%',
        color: 'white',
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)'
      }}
      onClick={(e) => e.stopPropagation()}
      >
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '20px'
        }}>
          <h2 style={{ margin: 0, fontSize: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>📋</span>
            <span>ボード情報</span>
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              fontSize: '24px',
              cursor: 'pointer',
              padding: '0',
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            ×
          </button>
        </div>

        {/* タイトル */}
        <div style={{ marginBottom: '16px' }}>
          <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '6px' }}>
            タイトル
          </div>
          <div style={{ fontSize: '18px', fontWeight: 'bold' }}>
            {board.title}
          </div>
        </div>

        {/* 説明 */}
        {board.description && (
          <div style={{ marginBottom: '16px' }}>
            <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '6px' }}>
              説明
            </div>
            <div style={{
              fontSize: '14px',
              color: '#e2e8f0',
              padding: '12px',
              background: '#0f172a',
              borderRadius: '8px',
              whiteSpace: 'pre-wrap'
            }}>
              {board.description}
            </div>
          </div>
        )}

        {/* 設定 */}
        <div style={{ marginBottom: '16px' }}>
          <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '6px' }}>
            デフォルト設定
          </div>
          <div style={{
            fontSize: '13px',
            padding: '12px',
            background: '#0f172a',
            borderRadius: '8px'
          }}>
            <div style={{ marginBottom: '4px' }}>
              <span style={{ color: '#94a3b8' }}>プロバイダ:</span> {board.settings.defaultProvider}
            </div>
            <div style={{ marginBottom: '4px' }}>
              <span style={{ color: '#94a3b8' }}>モデル:</span> {board.settings.defaultModel}
            </div>
            <div>
              <span style={{ color: '#94a3b8' }}>温度:</span> {board.settings.temperature}
            </div>
          </div>
        </div>

        {/* 作成・更新日時 */}
        <div style={{ fontSize: '12px', color: '#64748b' }}>
          <div>作成: {new Date(board.createdAt).toLocaleString('ja-JP')}</div>
          <div>更新: {new Date(board.updatedAt).toLocaleString('ja-JP')}</div>
        </div>
      </div>
    </div>
  );
};
