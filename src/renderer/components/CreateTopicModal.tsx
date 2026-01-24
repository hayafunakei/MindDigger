/**
 * トピック作成モーダルコンポーネント
 * 回答ノードからトピックを手動で作成する
 */
import React, { useState, useEffect, useCallback } from 'react';
import type { NodeMetadata } from '@shared/types';

interface TopicFormData {
  title: string;
  content: string;
  importance: 1 | 2 | 3 | 4 | 5;
  tags: string[];
}

interface CreateTopicModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: TopicFormData) => void;
  /** 選択テキスト（モーダル起動時に設定） */
  initialContent?: string;
}

/**
 * トピック作成モーダル
 */
export const CreateTopicModal: React.FC<CreateTopicModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  initialContent = ''
}) => {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [importance, setImportance] = useState<1 | 2 | 3 | 4 | 5>(3);
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>([]);

  // モーダルが開いたときに初期化
  useEffect(() => {
    if (isOpen) {
      setTitle('');
      setContent(initialContent);
      setImportance(3);
      setTagInput('');
      setTags([]);
    }
  }, [isOpen, initialContent]);

  /**
   * タグを追加
   */
  const handleAddTag = useCallback(() => {
    const trimmedTag = tagInput.trim();
    if (trimmedTag && !tags.includes(trimmedTag)) {
      setTags([...tags, trimmedTag]);
      setTagInput('');
    }
  }, [tagInput, tags]);

  /**
   * Enterキーでタグを追加
   */
  const handleTagKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddTag();
    }
  }, [handleAddTag]);

  /**
   * タグを削除
   */
  const handleRemoveTag = useCallback((tagToRemove: string) => {
    setTags(tags.filter(tag => tag !== tagToRemove));
  }, [tags]);

  /**
   * フォーム送信
   */
  const handleSubmit = useCallback(() => {
    if (!title.trim()) {
      alert('タイトルを入力してください');
      return;
    }

    onSubmit({
      title: title.trim(),
      content: content.trim() || title.trim(),
      importance,
      tags
    });

    onClose();
  }, [title, content, importance, tags, onSubmit, onClose]);

  /**
   * キーボードショートカット
   */
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      handleSubmit();
    }
  }, [onClose, handleSubmit]);

  if (!isOpen) return null;

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 12px',
    borderRadius: '8px',
    border: '1px solid #475569',
    background: '#0f172a',
    color: 'white',
    fontSize: '14px',
    boxSizing: 'border-box'
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '12px',
    color: '#94a3b8',
    marginBottom: '6px'
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000
      }}
      onClick={onClose}
      onKeyDown={handleKeyDown}
    >
      <div
        style={{
          background: '#1e293b',
          borderRadius: '12px',
          padding: '24px',
          width: '480px',
          maxWidth: '90%',
          maxHeight: '80vh',
          overflow: 'auto',
          color: 'white',
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ヘッダー */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '20px'
        }}>
          <h2 style={{ margin: 0, fontSize: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>💡</span>
            <span>トピックを作成</span>
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

        {/* タイトル入力 */}
        <div style={{ marginBottom: '16px' }}>
          <label style={labelStyle}>
            タイトル <span style={{ color: '#ef4444' }}>*</span>
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="トピックのタイトル"
            style={inputStyle}
            autoFocus
          />
        </div>

        {/* 内容入力 */}
        <div style={{ marginBottom: '16px' }}>
          <label style={labelStyle}>
            説明
          </label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="トピックの詳細説明（任意）"
            rows={4}
            style={{
              ...inputStyle,
              resize: 'vertical'
            }}
          />
        </div>

        {/* 重要度 */}
        <div style={{ marginBottom: '16px' }}>
          <label style={labelStyle}>
            重要度
          </label>
          <div style={{ display: 'flex', gap: '8px' }}>
            {([1, 2, 3, 4, 5] as const).map((level) => (
              <button
                key={level}
                onClick={() => setImportance(level)}
                style={{
                  flex: 1,
                  padding: '8px',
                  borderRadius: '6px',
                  border: importance === level ? '2px solid #8b5cf6' : '1px solid #475569',
                  background: importance === level ? '#8b5cf620' : '#0f172a',
                  color: importance === level ? '#c4b5fd' : '#94a3b8',
                  cursor: 'pointer',
                  fontSize: '14px',
                  transition: 'all 0.2s'
                }}
              >
                {level}
                {level >= 4 && <span style={{ marginLeft: '2px' }}>{'★'.repeat(level - 3)}</span>}
              </button>
            ))}
          </div>
          <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
            1: 低 ～ 5: 高（重要度4以上は★マークが表示されます）
          </div>
        </div>

        {/* タグ入力 */}
        <div style={{ marginBottom: '20px' }}>
          <label style={labelStyle}>
            タグ
          </label>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
            <input
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={handleTagKeyDown}
              placeholder="タグを入力..."
              style={{ ...inputStyle, flex: 1 }}
            />
            <button
              onClick={handleAddTag}
              disabled={!tagInput.trim()}
              style={{
                padding: '8px 16px',
                borderRadius: '6px',
                border: 'none',
                background: '#8b5cf6',
                color: 'white',
                cursor: tagInput.trim() ? 'pointer' : 'not-allowed',
                opacity: tagInput.trim() ? 1 : 0.5,
                fontSize: '14px'
              }}
            >
              追加
            </button>
          </div>
          {tags.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {tags.map((tag) => (
                <span
                  key={tag}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '4px 8px',
                    background: '#8b5cf630',
                    color: '#c4b5fd',
                    borderRadius: '4px',
                    fontSize: '12px'
                  }}
                >
                  {tag}
                  <button
                    onClick={() => handleRemoveTag(tag)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: '#94a3b8',
                      cursor: 'pointer',
                      padding: '0',
                      fontSize: '14px',
                      lineHeight: 1
                    }}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* アクションボタン */}
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{
              padding: '10px 20px',
              borderRadius: '8px',
              border: '1px solid #475569',
              background: 'transparent',
              color: '#94a3b8',
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            キャンセル
          </button>
          <button
            onClick={handleSubmit}
            disabled={!title.trim()}
            style={{
              padding: '10px 24px',
              borderRadius: '8px',
              border: 'none',
              background: '#8b5cf6',
              color: 'white',
              cursor: title.trim() ? 'pointer' : 'not-allowed',
              opacity: title.trim() ? 1 : 0.5,
              fontSize: '14px',
              fontWeight: 'bold'
            }}
          >
            作成
          </button>
        </div>

        {/* ショートカットヒント */}
        <div style={{
          marginTop: '16px',
          fontSize: '11px',
          color: '#64748b',
          textAlign: 'center'
        }}>
          <kbd style={{ 
            background: '#0f172a', 
            padding: '2px 6px', 
            borderRadius: '4px',
            border: '1px solid #334155'
          }}>⌘/Ctrl + Enter</kbd> で作成 ・ 
          <kbd style={{ 
            background: '#0f172a', 
            padding: '2px 6px', 
            borderRadius: '4px',
            border: '1px solid #334155'
          }}>Esc</kbd> でキャンセル
        </div>
      </div>
    </div>
  );
};
