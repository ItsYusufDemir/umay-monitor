// src/components/settings/AgentConfigPanel.jsx
import React, { useEffect, useState } from 'react';
import api from '../../api/axiosConfig';
import { useMonitoring } from '../../context/MonitoringContext';
import { useToast } from '../../context/ToastContext';
import ServerSelect from '../common/ServerSelect';

const AgentConfigPanel = () => {
  const toast = useToast();
  const { selectedServerId, setSelectedServerId } = useMonitoring();

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState(null);
  const [metricsInterval, setMetricsInterval] = useState(5);

  const loadConfig = async (serverId) => {
    if (!serverId) {
      setConfig(null);
      return;
    }

    setLoading(true);
    try {
      const res = await api.get(`/api/servers/${serverId}/configuration`);
      const data = res.data;
      setConfig(data);
      setMetricsInterval(data?.metricsInterval || 5);
    } catch (err) {
      // Config might not exist yet, use defaults
      setConfig(null);
      setMetricsInterval(5);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedServerId) {
      loadConfig(selectedServerId);
    }
  }, [selectedServerId]);

  const handleSave = async () => {
    if (!selectedServerId) {
      toast.error('Please select a server first');
      return;
    }

    const interval = Number(metricsInterval);
    if (!Number.isFinite(interval) || interval < 1 || interval > 300) {
      toast.error('Metrics interval must be between 1 and 300 seconds');
      return;
    }

    setSaving(true);
    try {
      await api.put(`/api/servers/${selectedServerId}/configuration`, {
        metricsInterval: interval
      });
      toast.success('Agent configuration saved');
      await loadConfig(selectedServerId);
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || 'Failed to save configuration';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="settings-card">
      <div className="settings-card-header">
        <div className="settings-card-title-area">
          <span className="settings-card-icon">🖥️</span>
          <div>
            <h2 className="settings-card-title">Agent Configuration</h2>
            <p className="settings-card-subtitle">Configure monitoring agent settings for each server</p>
          </div>
        </div>
      </div>

      <div className="settings-section">
        <div className="settings-section-content">
          <div className="form-row" style={{ marginBottom: 16 }}>
            <ServerSelect
              label="Select Server"
              value={selectedServerId}
              onChange={setSelectedServerId}
              minWidth={360}
            />
          </div>

          {!selectedServerId ? (
            <div className="settings-empty-state">
              <div className="settings-empty-icon">🖥️</div>
              <div className="settings-empty-title">No server selected</div>
              <div className="settings-empty-desc">Select a server to configure its agent settings</div>
            </div>
          ) : loading ? (
            <div className="settings-loading">
              <span className="settings-loading-spinner">⟳</span>
              <span>Loading configuration...</span>
            </div>
          ) : (
            <div className="agent-config-form">
              <div className="input-group" style={{ maxWidth: 300 }}>
                <label>Metrics Interval (seconds)</label>
                <input
                  type="number"
                  min="1"
                  max="300"
                  value={metricsInterval}
                  onChange={(e) => setMetricsInterval(e.target.value)}
                  placeholder="5"
                />
                <div className="input-hint">
                  How often the agent sends metrics to the server (1-300 seconds)
                </div>
              </div>

              <div className="settings-info-row" style={{ marginTop: 16 }}>
                <div className="notice">
                  <strong>Note:</strong> Lower intervals provide more real-time data but increase network usage. 
                  Recommended: 5-10 seconds for critical servers, 30-60 seconds for less critical ones.
                </div>
              </div>

              <div style={{ marginTop: 20 }}>
                <button
                  className="btn btn-primary"
                  onClick={handleSave}
                  disabled={saving}
                >
                  {saving ? '⟳ Saving...' : '💾 Save Configuration'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AgentConfigPanel;
