// src/pages/SettingsPage.jsx
import React, { useEffect, useState } from 'react';
import api from '../api/axiosConfig';
import { useToast } from '../context/ToastContext';
import BackupsPanel from '../components/settings/BackupsPanel';
import AgentConfigPanel from '../components/settings/AgentConfigPanel';

// Toggle Switch Component
const ToggleSwitch = ({ checked, onChange, disabled, label }) => (
  <label className="settings-toggle">
    <div className={`toggle-track ${checked ? 'toggle-active' : ''} ${disabled ? 'toggle-disabled' : ''}`}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        className="toggle-input"
      />
      <div className="toggle-thumb" />
    </div>
    {label && <span className="toggle-label">{label}</span>}
  </label>
);

// Section Header Component
const SectionHeader = ({ icon, title, description, badge }) => (
  <div className="settings-section-header">
    <div className="settings-section-icon">{icon}</div>
    <div className="settings-section-info">
      <h3 className="settings-section-title">{title}</h3>
      {description && <p className="settings-section-desc">{description}</p>}
    </div>
    {badge && <div className="settings-section-badge">{badge}</div>}
  </div>
);

// Status Card Component
const StatusCard = ({ icon, label, value, status }) => (
  <div className={`settings-status-card settings-status-${status}`}>
    <span className="settings-status-icon">{icon}</span>
    <div className="settings-status-content">
      <span className="settings-status-label">{label}</span>
      <span className="settings-status-value">{value}</span>
    </div>
  </div>
);

const SettingsPage = () => {
  const toast = useToast();
  
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState(null);
  const [error, setError] = useState('');

  const [botToken, setBotToken] = useState('');
  const [savingToken, setSavingToken] = useState(false);
  const [showToken, setShowToken] = useState(false);

  const [enabledBusy, setEnabledBusy] = useState(false);

  const [newChatId, setNewChatId] = useState('');
  const [newChatLabel, setNewChatLabel] = useState('');
  const [addingChat, setAddingChat] = useState(false);

  const [labelDraft, setLabelDraft] = useState({});
  const [savingLabelId, setSavingLabelId] = useState(null);

  const [deletingId, setDeletingId] = useState(null);

  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState('');

  const getErrMsg = (err, fallback) =>
    err?.response?.data?.message || err?.message || fallback;

  const loadSettings = async () => {
    setLoading(true);
    setError('');
    setTestMsg('');
    try {
      const res = await api.get('/api/notification-settings');
      setSettings(res.data);

      // init draft labels
      const draft = {};
      const list = Array.isArray(res.data?.chatIds) ? res.data.chatIds : [];
      list.forEach((c) => {
        draft[c.id] = c.label || '';
      });
      setLabelDraft(draft);
    } catch (err) {
      setError(getErrMsg(err, 'Failed to load notification settings'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleToggleEnabled = async (checked) => {
    setEnabledBusy(true);
    setError('');
    setTestMsg('');
    try {
      await api.put('/api/notification-settings/telegram/enabled', {
        enabled: checked,
      });
      await loadSettings();
      toast.success(`Telegram notifications ${checked ? 'enabled' : 'disabled'}`);
    } catch (err) {
      setError(getErrMsg(err, 'Failed to update enabled setting'));
    } finally {
      setEnabledBusy(false);
    }
  };

  const handleUpdateToken = async () => {
    if (!botToken.trim()) return;
    setSavingToken(true);
    setError('');
    setTestMsg('');
    try {
      await api.put('/api/notification-settings/telegram/bot-token', {
        botToken: botToken.trim(),
      });
      setBotToken('');
      await loadSettings();
      toast.success('Bot token updated successfully');
    } catch (err) {
      setError(getErrMsg(err, 'Failed to update bot token'));
    } finally {
      setSavingToken(false);
    }
  };

  const handleAddChatId = async () => {
    if (!newChatId.trim()) return;
    setAddingChat(true);
    setError('');
    setTestMsg('');
    try {
      await api.post('/api/notification-settings/telegram/chat-ids', {
        chatId: newChatId.trim(),
        label: newChatLabel.trim() ? newChatLabel.trim() : undefined,
      });
      setNewChatId('');
      setNewChatLabel('');
      await loadSettings();
      toast.success('Chat ID added successfully');
    } catch (err) {
      toast.error(getErrMsg(err, 'Failed to add chat id'));
    } finally {
      setAddingChat(false);
    }
  };

  const handleSaveLabel = async (id) => {
    setSavingLabelId(id);
    setError('');
    setTestMsg('');
    try {
      await api.put(`/api/notification-settings/telegram/chat-ids/${id}`, {
        label: labelDraft[id] || '',
      });
      await loadSettings();
      toast.success('Label updated');
    } catch (err) {
      toast.error(getErrMsg(err, 'Failed to update label'));
    } finally {
      setSavingLabelId(null);
    }
  };

  const handleDeleteChatId = async (id) => {
    setDeletingId(id);
    setError('');
    setTestMsg('');
    try {
      await api.delete(`/api/notification-settings/telegram/chat-ids/${id}`);
      await loadSettings();
      toast.success('Chat ID removed');
    } catch (err) {
      toast.error(getErrMsg(err, 'Failed to delete chat id'));
    } finally {
      setDeletingId(null);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setError('');
    setTestMsg('');
    try {
      const res = await api.post('/api/notification-settings/telegram/test');
      const msg = res?.data?.message || (res?.data?.success ? 'Success' : 'Failed');
      toast.success(msg);
    } catch (err) {
      toast.error(getErrMsg(err, 'Telegram test failed'));
    } finally {
      setTesting(false);
    }
  };

  const enabled = !!settings?.isTelegramEnabled;
  const hasBotToken = !!settings?.hasBotToken;
  const updatedAt = settings?.updatedAtUtc
    ? new Date(settings.updatedAtUtc).toLocaleString()
    : '';
  const chatCount = settings?.chatIds?.length || 0;

  return (
    <div className="settings-page">
      {/* Page Header */}
      <div className="settings-page-header">
        <div className="settings-page-title-area">
          <h1 className="settings-page-title">
            <span className="settings-page-icon">⚙️</span>
            Settings
          </h1>
          <p className="settings-page-subtitle">Configure your monitoring preferences and integrations</p>
        </div>
        <button className="btn" onClick={loadSettings} disabled={loading}>
          {loading ? '⟳ Refreshing...' : '↻ Refresh'}
        </button>
      </div>

      {error && (
        <div className="settings-error-banner">
          <span className="settings-error-icon">⚠️</span>
          <span>{error}</span>
          <button className="btn btn-ghost" onClick={() => setError('')}>✕</button>
        </div>
      )}
      {testMsg && <div className="notice">{testMsg}</div>}

      {/* Agent Configuration */}
      <AgentConfigPanel />

      {/* Backups Section */}
      <BackupsPanel />

      {/* Telegram Settings Card */}
      <div className="settings-card">
        <div className="settings-card-header">
          <div className="settings-card-title-area">
            <span className="settings-card-icon">📱</span>
            <div>
              <h2 className="settings-card-title">Telegram Notifications</h2>
              <p className="settings-card-subtitle">Connect your Telegram bot to receive real-time alerts</p>
            </div>
          </div>
          {updatedAt && (
            <span className="settings-updated-badge">
              <span>🕐</span> Updated {updatedAt}
            </span>
          )}
        </div>

        {/* Status Overview */}
        <div className="settings-status-grid">
          <StatusCard
            icon={enabled ? '✓' : '○'}
            label="Notifications"
            value={enabled ? 'Enabled' : 'Disabled'}
            status={enabled ? 'success' : 'muted'}
          />
          <StatusCard
            icon={hasBotToken ? '🔑' : '⚠'}
            label="Bot Token"
            value={hasBotToken ? 'Configured' : 'Not Set'}
            status={hasBotToken ? 'success' : 'warning'}
          />
          <StatusCard
            icon="💬"
            label="Chat Recipients"
            value={`${chatCount} configured`}
            status={chatCount > 0 ? 'success' : 'muted'}
          />
        </div>

        {loading ? (
          <div className="settings-loading">
            <div className="settings-loading-spinner" />
            <span>Loading settings...</span>
          </div>
        ) : (
          <>
            {/* Enable/Disable Section */}
            <div className="settings-section">
              <SectionHeader
                icon="🔔"
                title="Enable Notifications"
                description="Turn Telegram notifications on or off for all alerts"
              />
              <div className="settings-section-content">
                <ToggleSwitch
                  checked={enabled}
                  onChange={handleToggleEnabled}
                  disabled={enabledBusy}
                  label="Enable Telegram notifications"
                />
                {!hasBotToken && (
                  <div className="settings-hint settings-hint-warning">
                    <span>⚠️</span>
                    <span>You need to configure a bot token before enabling notifications</span>
                  </div>
                )}
              </div>
            </div>

            {/* Bot Token Section */}
            <div className="settings-section">
              <SectionHeader
                icon="🔑"
                title="Bot Token"
                description="Your Telegram bot token from @BotFather"
                badge={hasBotToken ? <span className="badge badge-ok">Configured</span> : null}
              />
              <div className="settings-section-content">
                <div className="settings-token-input-group">
                  <div className="settings-input-wrapper">
                    <input
                      type={showToken ? 'text' : 'password'}
                      value={botToken}
                      onChange={(e) => setBotToken(e.target.value)}
                      placeholder={hasBotToken ? '••••••••••••••••••••' : 'Paste your bot token here'}
                      className="settings-input"
                    />
                    <button
                      type="button"
                      className="settings-input-addon"
                      onClick={() => setShowToken(!showToken)}
                      title={showToken ? 'Hide token' : 'Show token'}
                    >
                      {showToken ? '🙈' : '👁️'}
                    </button>
                  </div>
                  <button
                    className="btn btn-primary"
                    onClick={handleUpdateToken}
                    disabled={savingToken || !botToken.trim()}
                  >
                    {savingToken ? '⟳ Saving...' : '💾 Update Token'}
                  </button>
                </div>
                <div className="settings-hint">
                  <span>💡</span>
                  <span>Create a bot via <a href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer">@BotFather</a> on Telegram to get your token</span>
                </div>
              </div>
            </div>

            {/* Chat IDs Section */}
            <div className="settings-section">
              <SectionHeader
                icon="💬"
                title="Chat Recipients"
                description="Add chat IDs to receive notifications"
              />
              <div className="settings-section-content">
                <div className="settings-add-chat-form">
                  <div className="settings-form-field">
                    <label className="settings-form-label">Chat ID</label>
                    <input
                      value={newChatId}
                      onChange={(e) => setNewChatId(e.target.value)}
                      placeholder="e.g. 123456789"
                      className="settings-input"
                    />
                  </div>
                  <div className="settings-form-field">
                    <label className="settings-form-label">Label <span className="settings-optional">(optional)</span></label>
                    <input
                      value={newChatLabel}
                      onChange={(e) => setNewChatLabel(e.target.value)}
                      placeholder="e.g. Production Alerts"
                      className="settings-input"
                    />
                  </div>
                  <button
                    className="btn btn-primary settings-add-btn"
                    onClick={handleAddChatId}
                    disabled={addingChat || !newChatId.trim()}
                  >
                    {addingChat ? '⟳ Adding...' : '+ Add Recipient'}
                  </button>
                </div>

                {(settings?.chatIds || []).length === 0 ? (
                  <div className="settings-empty-state">
                    <div className="settings-empty-icon">📭</div>
                    <div className="settings-empty-title">No recipients configured</div>
                    <div className="settings-empty-desc">Add a chat ID to start receiving notifications</div>
                  </div>
                ) : (
                  <div className="settings-chat-list">
                    {(settings.chatIds || []).map((c) => (
                      <div key={c.id} className="settings-chat-item">
                        <div className="settings-chat-info">
                          <span className="settings-chat-avatar">💬</span>
                          <div className="settings-chat-details">
                            <span className="settings-chat-id">{c.chatId}</span>
                            <input
                              value={labelDraft[c.id] ?? ''}
                              onChange={(e) =>
                                setLabelDraft((prev) => ({ ...prev, [c.id]: e.target.value }))
                              }
                              placeholder="Add a label..."
                              className="settings-chat-label-input"
                            />
                          </div>
                        </div>
                        <div className="settings-chat-actions">
                          <button
                            className="btn btn-muted"
                            onClick={() => handleSaveLabel(c.id)}
                            disabled={savingLabelId === c.id}
                          >
                            {savingLabelId === c.id ? '⟳' : '💾'} Save
                          </button>
                          <button
                            className="btn btn-danger"
                            onClick={() => handleDeleteChatId(c.id)}
                            disabled={deletingId === c.id}
                          >
                            {deletingId === c.id ? '⟳' : '🗑️'} Remove
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Test Connection Section */}
            <div className="settings-section settings-section-highlight">
              <SectionHeader
                icon="🧪"
                title="Test Connection"
                description="Send a test message to verify your configuration"
              />
              <div className="settings-section-content">
                <div className="settings-test-area">
                  <button
                    className="btn btn-warning btn-lg"
                    onClick={handleTest}
                    disabled={testing || !enabled || !hasBotToken}
                  >
                    {testing ? '⟳ Sending Test...' : '📤 Send Test Message'}
                  </button>
                  {(!enabled || !hasBotToken) && (
                    <div className="settings-hint settings-hint-warning">
                      <span>⚠️</span>
                      <span>Enable notifications and configure bot token to test</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default SettingsPage;
