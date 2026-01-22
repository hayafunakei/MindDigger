/**
 * ボード選択ダイアログ
 * 親フォルダ内のボード一覧を表示
 */
import React, { useEffect, useState } from 'react';
import { useBoardStore } from '../stores/boardStore';
import type { BoardInfo } from '@shared/ipc';

interface BoardSelectorDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * ボード選択ダイアログ
 */
export const BoardSelectorDialog: React.FC<BoardSelectorDialogProps> = ({ isOpen, onClose }) => {
  const { setBoard, setFilePath, setLoading } = useBoardStore();
  const [boards, setBoards] = useState<BoardInfo[]>([]);
  const [parentFolder, setParentFolder] = useState<string | null>(null);
  const [isLoadingList, setIsLoadingList] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadBoardList();
      loadParentFolder();
    }
  }, [isOpen]);

  const loadBoardList = async () => {
    setIsLoadingList(true);
    try {
      const list = await window.electronAPI.getBoardList();
      setBoards(list);
    } catch (error) {
      console.error('Failed to load board list:', error);
    } finally {
      setIsLoadingList(false);
    }
  };

  const loadParentFolder = async () => {
    try {
      const settings = await window.electronAPI.getSettings();
      setParentFolder(settings.parentFolderPath || null);
    } catch (error) {
      console.error('Failed to load parent folder:', error);
    }
  };

  const handleSelectParentFolder = async () => {
    try {
      const folder = await window.electronAPI.selectParentFolder();
      if (folder) {
        setParentFolder(folder);
        await loadBoardList();
      }
    } catch (error) {
      console.error('Failed to select parent folder:', error);
      alert('親フォルダの選択に失敗しました');
    }
  };

  const handleOpenBoard = async (board: BoardInfo) => {
    setLoading(true);
    try {
      const data = await window.electronAPI.loadBoardFromPath(board.folderPath);
      if (data) {
        setBoard(data, board.folderPath);
        onClose();
      } else {
        alert('ボードを開けませんでした');
      }
    } catch (error) {
      console.error('Failed to open board:', error);
      alert('ボードを開けませんでした');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

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
        width: '600px',
        maxWidth: '90%',
        maxHeight: '80vh',
        color: 'white',
        display: 'flex',
        flexDirection: 'column'
      }}
      onClick={(e) => e.stopPropagation()}
      >
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '20px'
        }}>
          <h2 style={{ margin: 0, fontSize: '18px' }}>
            📂 ボードを開く
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              fontSize: '24px',
              cursor: 'pointer',
              padding: '0'
            }}
          >
            ×
          </button>
        </div>

        {/* 親フォルダ設定 */}
        <div style={{
          marginBottom: '16px',
          padding: '12px',
          background: '#0f172a',
          borderRadius: '8px'
        }}>
          <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '8px' }}>
            親フォルダ
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <div style={{
              flex: 1,
              fontSize: '13px',
              color: parentFolder ? '#e2e8f0' : '#64748b',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}>
              {parentFolder || '未設定'}
            </div>
            <button
              onClick={handleSelectParentFolder}
              style={{
                padding: '6px 12px',
                borderRadius: '6px',
                border: 'none',
                background: '#334155',
                color: 'white',
                fontSize: '12px',
                cursor: 'pointer'
              }}
            >
              📁 変更
            </button>
          </div>
        </div>

        {/* ボード一覧 */}
        <div style={{
          flex: 1,
          overflow: 'auto',
          minHeight: '200px'
        }}>
          {isLoadingList ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
              読み込み中...
            </div>
          ) : !parentFolder ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
              親フォルダを選択してください
            </div>
          ) : boards.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
              ボードが見つかりません
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {boards.map((board) => (
                <div
                  key={board.id}
                  onClick={() => handleOpenBoard(board)}
                  style={{
                    padding: '12px 16px',
                    background: '#0f172a',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    transition: 'background 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#1e293b';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = '#0f172a';
                  }}
                >
                  <div style={{
                    fontSize: '15px',
                    fontWeight: 'bold',
                    marginBottom: '4px'
                  }}>
                    {board.title}
                  </div>
                  {board.description && (
                    <div style={{
                      fontSize: '12px',
                      color: '#94a3b8',
                      marginBottom: '6px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}>
                      {board.description}
                    </div>
                  )}
                  <div style={{ fontSize: '11px', color: '#64748b' }}>
                    更新: {new Date(board.updatedAt).toLocaleString('ja-JP')}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
