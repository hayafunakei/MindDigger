/**
 * 設定画面コンポーネント
 */
import React, { useState, useEffect } from 'react';
import { useSettingsStore } from '../stores/settingsStore';

interface SettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * 設定ダイアログ
 */
export const SettingsDialog: React.FC<SettingsDialogProps> = ({ isOpen, onClose }) => {
  const { settings, updateSettings } = useSettingsStore();
  const [openaiKey, setOpenaiKey] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setOpenaiKey(settings.openaiApiKey || '');
    }
  }, [isOpen, settings.openaiApiKey]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await updateSettings({
        openaiApiKey: openaiKey || undefined
      });
      onClose();
    } catch (error) {
      console.error('Failed to save settings:', error);
      alert('設定の保存に失敗しました');
    } finally {
      setIsSaving(false);
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
    }}>
      <div style={{
        background: '#1e293b',
        borderRadius: '12px',
        padding: '24px',
        width: '450px',
        color: 'white'
      }}>
        <h2 style={{ margin: '0 0 20px 0', fontSize: '18px' }}>
          ⚙️ 設定
        </h2>

        {/* OpenAI API Key */}
        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px' }}>
            OpenAI API Key
          </label>
          <input
            type="password"
            value={openaiKey}
            onChange={(e) => setOpenaiKey(e.target.value)}
            placeholder="sk-..."
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: '6px',
              border: '1px solid #475569',
              background: '#0f172a',
              color: 'white',
              fontSize: '14px',
              boxSizing: 'border-box'
            }}
          />
          <p style={{ fontSize: '12px', color: '#64748b', marginTop: '6px' }}>
            OpenAI の API キーを入力してください。<br />
            <a 
              href="https://platform.openai.com/api-keys" 
              target="_blank" 
              rel="noopener noreferrer"
              style={{ color: '#6366f1' }}
            >
              APIキーの取得はこちら
            </a>
          </p>
        </div>

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{
              padding: '8px 16px',
              borderRadius: '6px',
              border: 'none',
              background: '#475569',
              color: 'white',
              fontSize: '14px',
              cursor: 'pointer'
            }}
          >
            キャンセル
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            style={{
              padding: '8px 16px',
              borderRadius: '6px',
              border: 'none',
              background: '#6366f1',
              color: 'white',
              fontSize: '14px',
              cursor: 'pointer',
              opacity: isSaving ? 0.5 : 1
            }}
          >
            {isSaving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
};
