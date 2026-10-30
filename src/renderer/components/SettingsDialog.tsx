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
  const { settings, updateSettings, availableModels, loadAvailableModels, getModelsForProvider } = useSettingsStore();
  const [openaiKey, setOpenaiKey] = useState('');
  const [parentFolder, setParentFolder] = useState('');
  const [defaultModel, setDefaultModel] = useState('');
  const [topicModel, setTopicModel] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setOpenaiKey(settings.openaiApiKey || '');
      setParentFolder(settings.parentFolderPath || '');
      setDefaultModel(settings.defaultModel || 'gpt-6-luna');
      setTopicModel(settings.topicGenerationModel || 'gpt-6-luna');
      // モデル一覧を読み込み
      if (!availableModels) {
        loadAvailableModels();
      }
    }
  }, [isOpen, settings.openaiApiKey, settings.parentFolderPath, settings.defaultModel, settings.topicGenerationModel, availableModels, loadAvailableModels]);

  const handleSelectParentFolder = async () => {
    try {
      const folder = await window.electronAPI.selectParentFolder();
      if (folder) {
        setParentFolder(folder);
      }
    } catch (error) {
      console.error('Failed to select parent folder:', error);
      alert('フォルダの選択に失敗しました');
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await updateSettings({
        openaiApiKey: openaiKey || undefined,
        parentFolderPath: parentFolder || undefined,
        defaultProvider: 'openai',
        defaultModel: defaultModel || 'gpt-6-luna',
        topicGenerationModel: topicModel || 'gpt-6-luna'
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

        {/* 親フォルダ設定 */}
        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px' }}>
            ボード管理用の親フォルダ
          </label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <div style={{
              flex: 1,
              padding: '10px 12px',
              borderRadius: '6px',
              border: '1px solid #475569',
              background: '#0f172a',
              color: parentFolder ? 'white' : '#64748b',
              fontSize: '14px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}>
              {parentFolder || '未設定'}
            </div>
            <button
              onClick={handleSelectParentFolder}
              style={{
                padding: '10px 16px',
                borderRadius: '6px',
                border: 'none',
                background: '#334155',
                color: 'white',
                fontSize: '14px',
                cursor: 'pointer'
              }}
            >
              📁 選択
            </button>
          </div>
          <p style={{ fontSize: '12px', color: '#64748b', marginTop: '6px' }}>
            新規ボードはこのフォルダ内に保存されます
          </p>
        </div>

        {/* デフォルトモデル設定 */}
        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px' }}>
            🤖 デフォルトモデル
          </label>
          <select
            value={defaultModel}
            onChange={(e) => setDefaultModel(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: '6px',
              border: '1px solid #475569',
              background: '#0f172a',
              color: 'white',
              fontSize: '14px',
              boxSizing: 'border-box',
              cursor: 'pointer'
            }}
          >
            {getModelsForProvider('openai').map(model => (
              <option key={model.id} value={model.id}>
                {model.name} - {model.description || ''}
              </option>
            ))}
          </select>
          <p style={{ fontSize: '12px', color: '#64748b', marginTop: '6px' }}>
            新規ボード作成時のデフォルトモデルを選択します
          </p>
        </div>

        {/* トピック生成モデル設定 */}
        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px' }}>
            💡 トピック生成用モデル
          </label>
          <select
            value={topicModel}
            onChange={(e) => setTopicModel(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: '6px',
              border: '1px solid #475569',
              background: '#0f172a',
              color: 'white',
              fontSize: '14px',
              boxSizing: 'border-box',
              cursor: 'pointer'
            }}
          >
            {getModelsForProvider('openai').map(model => (
              <option key={model.id} value={model.id}>
                {model.name} - {model.description || ''}
              </option>
            ))}
          </select>
          <p style={{ fontSize: '12px', color: '#64748b', marginTop: '6px' }}>
            回答からトピックを自動抽出する際に使用するモデル
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
