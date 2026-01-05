// src/components/settings/BackupsPanel.jsx
import React, { useEffect, useMemo, useState } from 'react';
import api from '../../api/axiosConfig';
import signalRService from '../../services/signalRService';
import { useMonitoring } from '../../context/MonitoringContext';
import { useToast } from '../../context/ToastContext';
import ServerSelect from '../common/ServerSelect';

const bytesToHuman = (bytes) => {
  const n = Number(bytes);
  if (!Number.isFinite(n)) return '-';
  if (n === 0) return '0 B';
  if (n < 0) return '-';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
};

const fmtDateTime = (iso) => {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString();
};

const statusBadgeClass = (s) => {
  const v = String(s || '').toLowerCase();
  if (v === 'success') return 'badge badge-ok';
  if (v === 'error' || v === 'failed') return 'badge badge-bad';
  return 'badge badge-muted';
};

function FilesystemBrowser({ agentId, onSelectPath, onClose }) {
  const [currentPath, setCurrentPath] = useState('/');
  const [parentPath, setParentPath] = useState('');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const browsePath = async (path) => {
    try {
      setLoading(true);
      setError('');
      const res = await api.post(`/api/backups/browse/${agentId}`, {
        path: path || '/'
      });
      setCurrentPath(res.data.currentPath);
      setParentPath(res.data.parentPath);
      setItems(Array.isArray(res.data.items) ? res.data.items : []);
    } catch (err) {
      const msg =
        err?.response?.data?.error ||
        err?.response?.data?.message ||
        err?.message ||
        'Failed to browse filesystem';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (agentId) browsePath('/');
  }, [agentId]);

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" style={{ maxWidth: 720 }} onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">📁 Browse Filesystem</div>
          <button className="btn btn-ghost" onClick={onClose}>Close</button>
        </div>

        <div className="modal-body">
          <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="small">Current Path:</span>
            <code style={{ flex: 1, padding: '6px 10px', background: '#0b1220', borderRadius: 6 }}>
              {currentPath}
            </code>
            {parentPath && (
              <button
                className="btn btn-muted"
                onClick={() => browsePath(parentPath)}
                disabled={loading}
              >
                ⬆️ Parent
              </button>
            )}
          </div>

          {error && <div className="error-box" style={{ marginBottom: 12 }}>{error}</div>}
          {loading && <div className="muted">Loading directories...</div>}

          {!loading && items.length === 0 && (
            <div className="muted">No directories found.</div>
          )}

          {!loading && items.length > 0 && (
            <div style={{ maxHeight: 400, overflowY: 'auto', border: '1px solid #1f2937', borderRadius: 8 }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Directory</th>
                    <th style={{ width: 200 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.path}>
                      <td>
                        <div
                          style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
                          onClick={() => browsePath(item.path)}
                          title="Click to open directory"
                        >
                          <span>📂</span>
                          <span style={{ color: '#60a5fa' }}>{item.name}</span>
                        </div>
                      </td>
                      <td>
                        <div className="action-row" style={{ gap: 6 }}>
                          <button
                            className="btn btn-primary"
                            onClick={() => {
                              onSelectPath?.(item.path);
                              onClose?.();
                            }}
                          >
                            Select
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="notice" style={{ marginTop: 12 }}>
            <div className="small">
              💡 Tip: Navigate to the directory you want to backup, then click "Select" to use that path.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function BackupJobModal({ mode, initial, agentId, agents = [], onClose, onSaved }) {
  const isEdit = mode === 'edit';

  // Allow choosing a different agent/server when creating a job.
  const [targetAgentId, setTargetAgentId] = useState(
    isEdit ? Number(initial?.agentId) : Number(agentId)
  );

  useEffect(() => {
    // When opening the create modal, default to currently selected server.
    if (!isEdit) setTargetAgentId(Number(agentId));
  }, [agentId, isEdit]);

  const agentOptions = useMemo(() => {
    const list = Array.isArray(agents) ? agents : [];
    return list
      .map((a) => {
        const id = Number(a.id ?? a.agentId ?? a.serverId ?? a.agentID);
        if (!Number.isFinite(id)) return null;
        const name = a.name || a.agentName || a.hostname || `Server ${id}`;
        const hostname = a.hostname || '';
        const ip = a.ipAddress || a.ip || '';
        const isOnline = Boolean(a.isOnline);
        const dot = isOnline ? '🟢' : '🔴';
        const parts = [name];
        const meta = [hostname, ip].filter(Boolean).join(' · ');
        if (meta) parts.push(`(${meta})`);
        return { id, label: `${dot} ${parts.join(' ')}` };
      })
      .filter(Boolean)
      .sort((x, y) => x.id - y.id);
  }, [agents]);

  const [name, setName] = useState(initial?.name || '');
  const [sourcePath, setSourcePath] = useState(initial?.sourcePath || '');
  const [repoUrl, setRepoUrl] = useState(initial?.repoUrl || '');
  const [scheduleCron, setScheduleCron] = useState(initial?.scheduleCron || '0 2 * * *');
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);

  // Schedule builder state
  const [scheduleType, setScheduleType] = useState('daily');
  const [scheduleHour, setScheduleHour] = useState('2');
  const [scheduleMinute, setScheduleMinute] = useState('0');
  const [scheduleInterval, setScheduleInterval] = useState('30');
  const [scheduleIntervalUnit, setScheduleIntervalUnit] = useState('minutes');
  const [scheduleDayOfWeek, setScheduleDayOfWeek] = useState('0');
  const [scheduleDayOfMonth, setScheduleDayOfMonth] = useState('1');

  // Initialize schedule builder from existing cron
  useEffect(() => {
    if (initial?.scheduleCron) {
      const cron = initial.scheduleCron;
      // Try to detect schedule type from cron pattern
      if (cron.match(/^\*\/\d+ \* \* \* \*$/)) {
        setScheduleType('interval');
        setScheduleIntervalUnit('minutes');
        setScheduleInterval(cron.split(' ')[0].replace('*/', ''));
      } else if (cron.match(/^0 \*\/\d+ \* \* \*$/)) {
        setScheduleType('interval');
        setScheduleIntervalUnit('hours');
        setScheduleInterval(cron.split(' ')[1].replace('*/', ''));
      } else if (cron.match(/^\d+ \d+ \* \* \d+$/)) {
        setScheduleType('weekly');
        const parts = cron.split(' ');
        setScheduleMinute(parts[0]);
        setScheduleHour(parts[1]);
        setScheduleDayOfWeek(parts[4]);
      } else if (cron.match(/^\d+ \d+ \d+ \* \*$/)) {
        setScheduleType('monthly');
        const parts = cron.split(' ');
        setScheduleMinute(parts[0]);
        setScheduleHour(parts[1]);
        setScheduleDayOfMonth(parts[2]);
      } else if (cron.match(/^\d+ \d+ \* \* \*$/)) {
        setScheduleType('daily');
        const parts = cron.split(' ');
        setScheduleMinute(parts[0]);
        setScheduleHour(parts[1]);
      } else {
        setScheduleType('custom');
      }
    }
  }, [initial]);

  // Build cron from user-friendly inputs
  const buildCron = () => {
    switch (scheduleType) {
      case 'interval':
        if (scheduleIntervalUnit === 'minutes') {
          return `*/${scheduleInterval} * * * *`;
        } else {
          return `0 */${scheduleInterval} * * *`;
        }
      case 'daily':
        return `${scheduleMinute} ${scheduleHour} * * *`;
      case 'weekly':
        return `${scheduleMinute} ${scheduleHour} * * ${scheduleDayOfWeek}`;
      case 'monthly':
        return `${scheduleMinute} ${scheduleHour} ${scheduleDayOfMonth} * *`;
      case 'custom':
      default:
        return scheduleCron;
    }
  };

  // Update cron when builder inputs change
  useEffect(() => {
    if (scheduleType !== 'custom') {
      setScheduleCron(buildCron());
    }
  }, [scheduleType, scheduleHour, scheduleMinute, scheduleInterval, scheduleIntervalUnit, scheduleDayOfWeek, scheduleDayOfMonth]);

  // Credentials are NOT returned by backend. Only send when user provides them.
  const [repoPassword, setRepoPassword] = useState('');
  const [sshPrivateKey, setSshPrivateKey] = useState('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showBrowser, setShowBrowser] = useState(false);

  const validate = () => {
    if (!isEdit && !Number.isFinite(Number(targetAgentId))) return 'Please select a target server.';
    if (!name.trim()) return 'Name is required.';
    if (!sourcePath.trim()) return 'Source path is required.';
    if (!repoUrl.trim()) return 'Repository URL is required.';
    if (!scheduleCron.trim()) return 'Cron schedule is required.';
    if (!isEdit) {
      if (!repoPassword.trim()) return 'Repository password is required.';
      if (!sshPrivateKey.trim()) return 'SSH private key is required.';
    }
    return '';
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    const v = validate();
    if (v) {
      setError(v);
      return;
    }

    try {
      setSaving(true);
      setError('');

      if (isEdit) {
        const payload = {
          name: name.trim(),
          sourcePath: sourcePath.trim(),
          repoUrl: repoUrl.trim(),
          scheduleCron: scheduleCron.trim(),
          isActive: Boolean(isActive),
          ...(repoPassword.trim() ? { repoPassword: repoPassword.trim() } : {}),
          ...(sshPrivateKey.trim() ? { sshPrivateKey: sshPrivateKey.trim() } : {}),
        };

        await api.put(`/api/backups/${initial.id}`, payload);
      } else {
        const payload = {
          agentId: Number(targetAgentId),
          name: name.trim(),
          sourcePath: sourcePath.trim(),
          repoUrl: repoUrl.trim(),
          repoPassword: repoPassword.trim(),
          sshPrivateKey: sshPrivateKey.trim(),
          scheduleCron: scheduleCron.trim(),
          isActive: Boolean(isActive),
        };

        await api.post('/api/backups', payload);
      }

      // Call onSaved which triggers toast notification in parent
      onSaved?.();
      onClose?.();
    } catch (err) {
      const msg =
        err?.response?.data?.error ||
        err?.response?.data?.message ||
        err?.message ||
        'Request failed';
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" style={{ maxWidth: 820 }} onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">{isEdit ? 'Edit Backup Job' : 'Create Backup Job'}</div>
          <button className="btn btn-ghost" onClick={onClose}>Close</button>
        </div>

        <div className="modal-body">
          <div className="notice" style={{ marginBottom: 12 }}>
            <div style={{ fontWeight: 700 }}>Security note</div>
            <div className="small">
              Repository password and SSH key are encrypted on the backend and are never returned in responses.
              {isEdit && ' To change credentials, enter new values below. Leave blank to keep current values.'}
            </div>
          </div>

          {error ? <div className="error-box" style={{ marginBottom: 12 }}>{error}</div> : null}

          <form onSubmit={onSubmit} className="form-grid">
            <div className="input-group">
              <label>{isEdit ? 'Agent ID' : 'Target Server'}</label>
              {isEdit ? (
                <div className="small">{initial?.agentId}</div>
              ) : (
                <select
                  className="input"
                  value={Number.isFinite(Number(targetAgentId)) ? String(targetAgentId) : ''}
                  onChange={(e) => setTargetAgentId(Number(e.target.value))}
                >
                  <option value="" disabled>
                    {agentOptions.length ? 'Select a server…' : 'No servers loaded'}
                  </option>
                  {agentOptions.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.label}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="input-group">
              <label>Name</label>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., Production DB Backup" />
            </div>

            <div className="input-group">
              <label>Source Path</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input 
                  className="input" 
                  value={sourcePath} 
                  onChange={(e) => setSourcePath(e.target.value)} 
                  placeholder="/var/lib/postgresql/data"
                  style={{ flex: 1 }}
                />
                <button
                  type="button"
                  className="btn btn-muted"
                  onClick={() => setShowBrowser(true)}
                  disabled={!targetAgentId || saving}
                  style={{ marginTop: 'auto' }}
                >
                  📁 Browse
                </button>
              </div>
            </div>

            {showBrowser && (
              <FilesystemBrowser
                agentId={targetAgentId}
                onSelectPath={(path) => setSourcePath(path)}
                onClose={() => setShowBrowser(false)}
              />
            )}

            <div className="input-group">
              <label>Repository URL (SFTP)</label>
              <input className="input" value={repoUrl} onChange={(e) => setRepoUrl(e.target.value)} placeholder="sftp:user@host:/path" />
            </div>

            <div style={{ 
              border: '1px solid #1f2937', 
              borderRadius: 8, 
              padding: 16, 
              background: '#0b1220',
              marginBottom: 16 
            }}>
              <label style={{ fontWeight: 600, marginBottom: 10, display: 'block' }}>Schedule Configuration</label>
              
              <div className="input-group" style={{ marginBottom: 0 }}>
                <label>Frequency</label>
                <select 
                  className="input" 
                  value={scheduleType} 
                  onChange={(e) => setScheduleType(e.target.value)}
                  style={{ 
                    padding: '0.55rem 0.7rem',
                    borderRadius: 6,
                    border: '1px solid #334155',
                    background: '#020617',
                    color: '#e5e7eb',
                  }}
                >
                  <option value="interval">Every X minutes/hours</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="custom">Custom (Cron)</option>
                </select>

                {scheduleType === 'interval' && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <div style={{ flex: 1 }}>
                      <label className="small" style={{ display: 'block', marginBottom: 4 }}>Every</label>
                      <input 
                        type="number" 
                        className="input" 
                        value={scheduleInterval} 
                        onChange={(e) => setScheduleInterval(e.target.value)}
                        min="1"
                        style={{ width: '100%' }}
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label className="small" style={{ display: 'block', marginBottom: 4 }}>Unit</label>
                      <select 
                        className="input" 
                        value={scheduleIntervalUnit} 
                        onChange={(e) => setScheduleIntervalUnit(e.target.value)}
                        style={{ 
                          width: '100%',
                          padding: '0.55rem 0.7rem',
                          borderRadius: 6,
                          border: '1px solid #334155',
                          background: '#020617',
                          color: '#e5e7eb',
                        }}
                      >
                        <option value="minutes">Minutes</option>
                        <option value="hours">Hours</option>
                      </select>
                    </div>
                  </div>
                )}

                {scheduleType === 'daily' && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <div style={{ flex: 1 }}>
                      <label className="small" style={{ display: 'block', marginBottom: 4 }}>Hour (0-23)</label>
                      <input 
                        type="number" 
                        className="input" 
                        value={scheduleHour} 
                        onChange={(e) => setScheduleHour(e.target.value)}
                        min="0"
                        max="23"
                        style={{ width: '100%' }}
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label className="small" style={{ display: 'block', marginBottom: 4 }}>Minute (0-59)</label>
                      <input 
                        type="number" 
                        className="input" 
                        value={scheduleMinute} 
                        onChange={(e) => setScheduleMinute(e.target.value)}
                        min="0"
                        max="59"
                        style={{ width: '100%' }}
                      />
                    </div>
                  </div>
                )}

                {scheduleType === 'weekly' && (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ marginBottom: 8 }}>
                      <label className="small" style={{ display: 'block', marginBottom: 4 }}>Day of Week</label>
                      <select 
                        className="input" 
                        value={scheduleDayOfWeek} 
                        onChange={(e) => setScheduleDayOfWeek(e.target.value)}
                        style={{ 
                          width: '100%',
                          padding: '0.55rem 0.7rem',
                          borderRadius: 6,
                          border: '1px solid #334155',
                          background: '#020617',
                          color: '#e5e7eb',
                        }}
                      >
                        <option value="0">Sunday</option>
                        <option value="1">Monday</option>
                        <option value="2">Tuesday</option>
                        <option value="3">Wednesday</option>
                        <option value="4">Thursday</option>
                        <option value="5">Friday</option>
                        <option value="6">Saturday</option>
                      </select>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <div style={{ flex: 1 }}>
                        <label className="small" style={{ display: 'block', marginBottom: 4 }}>Hour (0-23)</label>
                        <input 
                          type="number" 
                          className="input" 
                          value={scheduleHour} 
                          onChange={(e) => setScheduleHour(e.target.value)}
                          min="0"
                          max="23"
                          style={{ width: '100%' }}
                        />
                      </div>
                      <div style={{ flex: 1 }}>
                        <label className="small" style={{ display: 'block', marginBottom: 4 }}>Minute (0-59)</label>
                        <input 
                          type="number" 
                          className="input" 
                          value={scheduleMinute} 
                          onChange={(e) => setScheduleMinute(e.target.value)}
                          min="0"
                          max="59"
                          style={{ width: '100%' }}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {scheduleType === 'monthly' && (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ marginBottom: 8 }}>
                      <label className="small" style={{ display: 'block', marginBottom: 4 }}>Day of Month (1-31)</label>
                      <input 
                        type="number" 
                        className="input" 
                        value={scheduleDayOfMonth} 
                        onChange={(e) => setScheduleDayOfMonth(e.target.value)}
                        min="1"
                        max="31"
                        style={{ width: '100%' }}
                      />
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <div style={{ flex: 1 }}>
                        <label className="small" style={{ display: 'block', marginBottom: 4 }}>Hour (0-23)</label>
                        <input 
                          type="number" 
                          className="input" 
                          value={scheduleHour} 
                          onChange={(e) => setScheduleHour(e.target.value)}
                          min="0"
                          max="23"
                          style={{ width: '100%' }}
                        />
                      </div>
                      <div style={{ flex: 1 }}>
                        <label className="small" style={{ display: 'block', marginBottom: 4 }}>Minute (0-59)</label>
                        <input 
                          type="number" 
                          className="input" 
                          value={scheduleMinute} 
                          onChange={(e) => setScheduleMinute(e.target.value)}
                          min="0"
                          max="59"
                          style={{ width: '100%' }}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {scheduleType === 'custom' && (
                  <div style={{ marginTop: 8 }}>
                    <input 
                      className="input" 
                      value={scheduleCron} 
                      onChange={(e) => setScheduleCron(e.target.value)} 
                      placeholder="0 2 * * *"
                      style={{ width: '100%' }}
                    />
                  </div>
                )}

                <div className="help" style={{ marginTop: 6 }}>
                  Cron expression: <code>{scheduleCron}</code>
                </div>
              </div>
            </div>

            {isEdit && (
              <div className="input-group">
                <label>Enabled</label>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
                  <span className="small">Active</span>
                </label>
              </div>
            )}

            <div className="hr" />

            <div className="input-group">
              <label>Repository Password</label>
              <input className="input" value={repoPassword} onChange={(e) => setRepoPassword(e.target.value)} placeholder={isEdit ? '(leave blank to keep)' : 'required'} />
            </div>

            <div className="input-group">
              <label>SSH Private Key</label>
              <textarea
                className="input"
                rows={6}
                value={sshPrivateKey}
                onChange={(e) => setSshPrivateKey(e.target.value)}
                placeholder={isEdit ? '(leave blank to keep)' : '-----BEGIN ... -----END ...'}
                style={{ width: '100%' }}
              />
            </div>

            <div className="toolbar" style={{ marginTop: 14 }}>
              <button className="btn btn-primary" type="submit" disabled={saving}>
                {saving ? 'Saving…' : (isEdit ? 'Save Changes' : 'Create Job')}
              </button>
              <button className="btn btn-muted" type="button" onClick={onClose} disabled={saving}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

function LogsModal({ job, logs, loading, error, onClose, onRefresh }) {
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" style={{ maxWidth: 980 }} onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">Backup Logs — {job?.name || job?.id}</div>
          <div className="toolbar">
            <button className="btn btn-muted" onClick={onRefresh} disabled={loading}>Refresh</button>
            <button className="btn btn-ghost" onClick={onClose}>Close</button>
          </div>
        </div>

        <div className="modal-body">
          {error ? <div className="error-box" style={{ marginBottom: 12 }}>{error}</div> : null}
          {loading ? <div className="muted">Loading…</div> : null}

          {!loading && (!logs || logs.length === 0) ? (
            <div className="muted">No logs found yet.</div>
          ) : null}

          {!loading && logs && logs.length > 0 ? (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Status</th>
                    <th>Message</th>
                    <th>Snapshot</th>
                    <th>Files</th>
                    <th>Added</th>
                    <th>Duration</th>
                    <th>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((l) => (
                    <tr key={l.id}>
                      <td className="small">{fmtDateTime(l.createdAtUtc)}</td>
                      <td><span className={statusBadgeClass(l.status)}>{l.status}</span></td>
                      <td className="small">{l.message || '—'}</td>
                      <td><code style={{ padding: '2px 6px', background: '#0b1220', borderRadius: 4, fontSize: '0.85rem' }}>{l.snapshotId || '—'}</code></td>
                      <td>{l.filesNew != null ? l.filesNew : '—'}</td>
                      <td>{l.dataAdded != null ? bytesToHuman(l.dataAdded) : '—'}</td>
                      <td>{l.durationSeconds != null ? `${Number(l.durationSeconds).toFixed(1)}s` : '—'}</td>
                      <td style={{ maxWidth: 360 }} className="small">{l.errorMessage || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function SnapshotsModal({ job, snapshots, loading, error, onClose, onRefresh }) {
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" style={{ maxWidth: 980 }} onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">Snapshots — {job?.name || job?.id}</div>
          <div className="toolbar">
            <button className="btn btn-muted" onClick={onRefresh} disabled={loading}>Refresh</button>
            <button className="btn btn-ghost" onClick={onClose}>Close</button>
          </div>
        </div>

        <div className="modal-body">
          {error ? <div className="error-box" style={{ marginBottom: 12 }}>{error}</div> : null}
          {loading ? <div className="muted">Loading…</div> : null}

          {!loading && (!snapshots || snapshots.length === 0) ? (
            <div className="muted">No snapshots found yet.</div>
          ) : null}

          {!loading && snapshots && snapshots.length > 0 ? (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Snapshot ID</th>
                    <th>Time</th>
                    <th>Hostname</th>
                    <th>Paths</th>
                  </tr>
                </thead>
                <tbody>
                  {[...snapshots].reverse().map((s) => (
                    <tr key={s.id}>
                      <td><code style={{ padding: '2px 6px', background: '#0b1220', borderRadius: 4 }}>{s.id}</code></td>
                      <td className="small">{fmtDateTime(s.time)}</td>
                      <td>{s.hostname || '—'}</td>
                      <td style={{ maxWidth: 420 }}>{Array.isArray(s.paths) ? s.paths.join(', ') : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default function BackupsPanel() {
  const { selectedServerId, servers, subscribe } = useMonitoring();
  const toast = useToast();

  // Local server selection for backups (does not affect global selectedServerId)
  const [backupServerId, setBackupServerId] = useState('all');

  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [inlineError, setInlineError] = useState('');
  const [inlineNotice, setInlineNotice] = useState('');

  const [showAllAgents, setShowAllAgents] = useState(false);
  const agentId = useMemo(() => {
    if (backupServerId === 'all') return null;
    const id = Number(backupServerId);
    return Number.isFinite(id) ? id : null;
  }, [backupServerId]);

  const [jobModal, setJobModal] = useState(null); // { mode:'create'|'edit', job?:... }

  const [logsModal, setLogsModal] = useState({ open: false, job: null });
  const [logs, setLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsError, setLogsError] = useState('');

  const [snapModal, setSnapModal] = useState({ open: false, job: null });
  const [snapshots, setSnapshots] = useState([]);
  const [snapLoading, setSnapLoading] = useState(false);
  const [snapError, setSnapError] = useState('');

  const loadJobs = async () => {
    if (backupServerId !== 'all' && !backupServerId) {
      setInlineError('Select an agent/server first to manage backups.');
      setJobs([]);
      return;
    }
    try {
      setLoading(true);
      setInlineError('');
      const res = await api.get('/api/backups', { params: agentId ? { agentId } : {} });
      setJobs(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      const msg =
        err?.response?.data?.error ||
        err?.response?.data?.message ||
        err?.message ||
        'Failed to load backup jobs';
      setInlineError(msg);
    } finally {
      setLoading(false);
    }
  };

  const loadLogs = async (job) => {
    if (!job?.id) return;
    try {
      setLogsLoading(true);
      setLogsError('');
      const res = await api.get(`/api/backups/${job.id}/logs`, { params: { limit: 50 } });
      setLogs(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      const msg =
        err?.response?.data?.error ||
        err?.response?.data?.message ||
        err?.message ||
        'Failed to load logs';
      setLogsError(msg);
    } finally {
      setLogsLoading(false);
    }
  };

  const loadSnapshots = async (job) => {
    if (!job?.id) return;
    try {
      setSnapLoading(true);
      setSnapError('');
      // Updated to use real Restic snapshots endpoint
      const res = await api.get(`/api/backups/${job.id}/snapshots`);
      setSnapshots(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      const msg =
        err?.response?.data?.error ||
        err?.response?.data?.message ||
        err?.message ||
        'Failed to load snapshots';
      setSnapError(msg);
    } finally {
      setSnapLoading(false);
    }
  };

  const checkIntegrity = async (job) => {
    try {
      const res = await api.post(`/api/backups/${job.id}/integrity-check`);
      toast.info(`Integrity check started for ${job.name}. Results will arrive shortly...`);
    } catch (err) {
      const msg =
        err?.response?.data?.error ||
        err?.response?.data?.message ||
        err?.message ||
        'Failed to trigger integrity check';
      toast.error(`Integrity check failed: ${msg}`);
    }
  };

  useEffect(() => {
    setInlineNotice('');
    setInlineError('');
    loadJobs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId]);

  // Subscribe to selected backup server for real-time events
  useEffect(() => {
    if (backupServerId === 'all' || !backupServerId) return;
    
    const serverIdNum = Number(backupServerId);
    if (!Number.isFinite(serverIdNum)) return;

    // Subscribe to this server to receive backup events
    subscribe?.(serverIdNum).catch((err) => {
      console.warn('Failed to subscribe to backup server:', err);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backupServerId]);

  // Live updates (SignalR)
  useEffect(() => {
    const handler = (event) => {
      // Expected payload: { serverId, jobId, taskId, status, message, snapshotId, errorMessage, ... }
      const serverId = Number(event?.serverId);
      if (backupServerId !== 'all' && serverId !== Number(backupServerId)) return;

      const ok = String(event?.status || '').toLowerCase() === 'success';
      const message = event?.message || (ok ? 'Backup completed' : 'Backup failed');
      const details = ok 
        ? (event.snapshotId ? ` (Snapshot: ${event.snapshotId})` : '')
        : (event.errorMessage ? `: ${event.errorMessage}` : '');
      
      // Use toast instead of inline notice
      if (ok) {
        toast.success(`${message}${details}`);
      } else {
        toast.error(`${message}${details}`);
      }

      loadJobs();

      if (logsModal.open && logsModal.job?.id === event.jobId) {
        loadLogs(logsModal.job);
      }
      if (snapModal.open && snapModal.job?.id === event.jobId) {
        loadSnapshots(snapModal.job);
      }
    };

    try {
      if (signalRService.isNotificationConnected()) {
        signalRService.onBackupCompleted(handler);
        return () => {
          signalRService.offBackupCompleted?.();
        };
      }
    } catch {
      // SignalR might not be ready on this route; ignore.
    }

    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backupServerId, logsModal.open, logsModal.job?.id, snapModal.open, snapModal.job?.id]);

  // Listen for integrity check completion events
  useEffect(() => {
    const handler = (event) => {
      // Expected payload: { serverId, jobId, taskId, status, message, errorMessage, timestamp }
      const serverId = Number(event?.serverId);
      if (backupServerId !== 'all' && serverId !== Number(backupServerId)) return;

      const ok = String(event?.status || '').toLowerCase() === 'success';
      const jobName = jobs.find(j => j.id === event.jobId)?.name || event.jobId;
      const message = event?.message || (ok ? 'Integrity check passed' : 'Integrity check failed');
      const details = event.errorMessage ? `: ${event.errorMessage}` : '';
      
      if (ok) {
        toast.success(`✅ ${message} for "${jobName}"`);
      } else {
        toast.error(`❌ ${message} for "${jobName}"${details}`);
      }
    };

    try {
      if (signalRService.isNotificationConnected()) {
        signalRService.onIntegrityCheckCompleted(handler);
        return () => {
          signalRService.offIntegrityCheckCompleted?.();
        };
      }
    } catch {
      // SignalR might not be ready on this route; ignore.
    }

    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backupServerId, jobs]);

  const triggerNow = async (job) => {
    try {
      setInlineError('');
      setInlineNotice('');
      const res = await api.post(`/api/backups/${job.id}/trigger`);
      const taskId = res?.data?.taskId;
      toast.success(`Backup triggered. Task ID: ${taskId || '-'}`);
    } catch (err) {
      const msg =
        err?.response?.data?.error ||
        err?.response?.data?.message ||
        err?.message ||
        'Trigger failed';
      toast.error(`Failed to trigger backup: ${msg}`);
    }
  };

  const toggleActive = async (job) => {
    try {
      setInlineError('');
      await api.put(`/api/backups/${job.id}`, { isActive: !job.isActive });
      toast.success(`Backup job ${job.isActive ? 'disabled' : 'enabled'} successfully`);
      loadJobs();
    } catch (err) {
      const msg =
        err?.response?.data?.error ||
        err?.response?.data?.message ||
        err?.message ||
        'Update failed';
      toast.error(`Failed to update backup: ${msg}`);
    }
  };

  const deleteJob = async (job) => {
    // eslint-disable-next-line no-alert
    const ok = window.confirm('Delete this backup job? This will also delete its logs.');
    if (!ok) return;

    try {
      setInlineError('');
      await api.delete(`/api/backups/${job.id}`);
      toast.success('Backup job deleted successfully');
      loadJobs();
    } catch (err) {
      const msg =
        err?.response?.data?.error ||
        err?.response?.data?.message ||
        err?.message ||
        'Delete failed';
      toast.error(`Failed to delete backup: ${msg}`);
    }
  };

  const openLogs = async (job) => {
    setLogsModal({ open: true, job });
    setLogs([]);
    await loadLogs(job);
  };

  const openSnapshots = async (job) => {
    setSnapModal({ open: true, job });
    setSnapshots([]);
    await loadSnapshots(job);
  };

  const filteredJobs = useMemo(() => {
    if (backupServerId === 'all') return jobs;
    return jobs.filter((j) => Number(j.agentId) === Number(backupServerId));
  }, [jobs, backupServerId]);

  return (
    <div className="backups-panel">
      <div className="backups-panel-header">
        <div className="backups-panel-title-area">
          <span className="backups-panel-icon">💾</span>
          <div>
            <h2 className="backups-panel-title">Backup Jobs</h2>
            <p className="backups-panel-subtitle">Manage scheduled Restic backups to SFTP repositories</p>
          </div>
        </div>

        <div className="backups-panel-controls">
          <ServerSelect 
            label="Server"
            value={backupServerId}
            onChange={(val) => setBackupServerId(val || 'all')}
            minWidth={280}
            showRefresh={true}
            showAllOption={true}
          />

          <button className="btn btn-muted" onClick={loadJobs} disabled={loading}>
            {loading ? '⟳ Refreshing...' : '↻ Refresh'}
          </button>

          <button
            className="btn btn-primary"
            onClick={() => setJobModal({ mode: 'create' })}
            disabled={backupServerId !== 'all' && !backupServerId}
            title={backupServerId !== 'all' && !backupServerId ? 'Select an agent/server first' : ''}
          >
            + New Job
          </button>
        </div>
      </div>

      <div className="backups-panel-body">
        <div className="backups-info-banner">
          <span className="backups-info-icon">🔒</span>
          <div className="backups-info-content">
            <div>
              Passwords and SSH keys are encrypted and never returned by the API.
            </div>
          </div>
        </div>

        {inlineNotice && <div className="notice" style={{ marginBottom: 12 }}>{inlineNotice}</div>}
        {inlineError && (
          <div className="settings-error-banner" style={{ marginBottom: 12 }}>
            <span className="settings-error-icon">⚠️</span>
            <span>{inlineError}</span>
          </div>
        )}

        {loading && (
          <div className="settings-loading">
            <div className="settings-loading-spinner" />
            <span>Loading backup jobs...</span>
          </div>
        )}

        {!loading && (!filteredJobs || filteredJobs.length === 0) && (
          <div className="backups-empty-state">
            <div className="backups-empty-icon">📦</div>
            <div className="backups-empty-title">No backup jobs configured</div>
            <div className="backups-empty-desc">
              Create your first backup job to start protecting your data with automated Restic backups
            </div>
          </div>
        )}

        {!loading && filteredJobs && filteredJobs.length > 0 && (
          <div className="backups-table-wrap">
            <table className="backups-table">
              <thead>
                <tr>
                  <th>Job</th>
                  <th>Agent</th>
                  <th>Schedule</th>
                  <th>Status</th>
                  <th>Last Run</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
              {filteredJobs.map((j) => (
                <tr key={j.id}>
                  <td>
                    <div className="backup-job-name">{j.name}</div>
                    <div className="backup-job-path">{j.sourcePath} → {j.repoUrl}</div>
                  </td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{j.agentId}</div>
                    <div className="small" style={{ marginTop: 2, color: '#6b7280' }}>{j.agentName || '—'}</div>
                  </td>
                  <td>
                    <span className="backup-schedule-badge">{j.scheduleCron}</span>
                  </td>
                  <td>
                    <div className="backup-status-cell">
                      <span className={statusBadgeClass(j.lastRunStatus)}>{j.lastRunStatus || 'pending'}</span>
                      <span className={`backup-enabled-label ${j.isActive ? 'enabled' : 'disabled'}`}>
                        {j.isActive ? '✓ Enabled' : '○ Disabled'}
                      </span>
                    </div>
                  </td>
                  <td className="small" style={{ color: '#9ca3af' }}>{fmtDateTime(j.lastRunAtUtc)}</td>
                  <td>
                    <div className="backup-actions-cell">
                      <div className="backup-actions-primary">
                        <button className="btn btn-sm btn-muted" onClick={() => triggerNow(j)}>▶ Run</button>
                        <button className="btn btn-sm btn-muted" onClick={() => toggleActive(j)}>
                          {j.isActive ? '⏸ Disable' : '▶ Enable'}
                        </button>
                        <button className="btn btn-sm btn-muted" onClick={() => openLogs(j)}>📋 Logs</button>
                        <button className="btn btn-sm btn-muted" onClick={() => openSnapshots(j)}>📸 Snaps</button>
                        <button className="btn btn-sm btn-muted" onClick={() => checkIntegrity(j)}>🔍 Check</button>
                      </div>
                      <div className="backup-actions-secondary">
                        <button className="btn btn-sm btn-muted" onClick={() => setJobModal({ mode: 'edit', job: j })}>✏️</button>
                        <button className="btn btn-sm btn-danger" onClick={() => deleteJob(j)}>🗑️</button>
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {jobModal ? (
        <BackupJobModal
          mode={jobModal.mode}
          initial={jobModal.job}
          agentId={backupServerId === 'all' ? (Number(selectedServerId) || null) : Number(backupServerId)}
          agents={servers || []}
          onClose={() => setJobModal(null)}
          onSaved={async () => {
            try {
              await loadJobs();
              toast.success(`Backup job ${jobModal.mode === 'edit' ? 'updated' : 'created'} successfully`);
            } catch (err) {
              const msg =
                err?.response?.data?.error ||
                err?.response?.data?.message ||
                err?.message ||
                'Operation failed';
              toast.error(`Failed to save backup: ${msg}`);
            }
          }}
        />
      ) : null}

      {logsModal.open ? (
        <LogsModal
          job={logsModal.job}
          logs={logs}
          loading={logsLoading}
          error={logsError}
          onClose={() => setLogsModal({ open: false, job: null })}
          onRefresh={() => loadLogs(logsModal.job)}
        />
      ) : null}

      {snapModal.open ? (
        <SnapshotsModal
          job={snapModal.job}
          snapshots={snapshots}
          loading={snapLoading}
          error={snapError}
          onClose={() => setSnapModal({ open: false, job: null })}
          onRefresh={() => loadSnapshots(snapModal.job)}
        />
      ) : null}
    </div>
  );
}
