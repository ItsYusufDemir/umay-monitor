// src/pages/AlertRulesPage.jsx
import React, { useEffect, useState } from 'react';
import api from '../api/axiosConfig';
import { useMonitoring } from '../context/MonitoringContext';
import { useToast } from '../context/ToastContext';
import ServerSelect from '../components/common/ServerSelect';

const TARGET_TYPES = [
  { value: 0, label: 'Server' },
  { value: 1, label: 'Disk' },
  { value: 2, label: 'Network' },
  { value: 3, label: 'Process' },
  { value: 4, label: 'Service' },
];

const COMPARISONS = ['>', '>=', '<', '<=', '=='];
const SEVERITIES = ['Info', 'Warning', 'Critical'];

const METRICS_BY_TARGET = {
  0: ['CPU', 'RAM', 'LOAD1M', 'LOAD5M', 'LOAD15M'],
  1: ['DISKUSAGE'],
  2: ['NETWORKUPLOAD', 'NETWORKDOWNLOAD'],
  3: ['CPU', 'RAM'],
  4: ['CPU', 'RAM'],
};

const severityClass = (sev) => {
  const s = String(sev || '').toLowerCase();
  if (s === 'critical') return 'badge-crit';
  if (s === 'warning') return 'badge-warn';
  if (s === 'info') return 'badge-info';
  return 'badge-muted';
};

const getErrMsg = (err, fallback) =>
  err?.response?.data?.message || err?.message || fallback;

const normalizeServerId = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return 1;
  const i = Math.floor(n);
  return i >= 1 ? i : 1;
};

const AlertRulesPage = () => {
  const monitoring = useMonitoring();
  const toast = useToast();
  
  const selectedServerId = normalizeServerId(monitoring?.selectedServerId ?? 1);
  const setSelectedServerId = monitoring?.setSelectedServerId;

  // Use global selection (MonitoringContext)
  const serverId = selectedServerId;

  const onChangeServer = (sid) => {
    const n = normalizeServerId(sid);
    setSelectedServerId?.(n);
    setNotice('');
    setError('');
    // If user changes server while editing, reset the form to avoid accidental edits on wrong server
    resetForm();
  };
  const [activeOnly, setActiveOnly] = useState(false);

  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Form state (Create / Edit)
  const [mode, setMode] = useState('create'); // create | edit
  const [editingRuleId, setEditingRuleId] = useState(null);

  const [targetType, setTargetType] = useState(0);
  const [metric, setMetric] = useState('CPU');
  const [comparison, setComparison] = useState('>');
  const [thresholdValue, setThresholdValue] = useState('80');
  const [severity, setSeverity] = useState('Warning');
  const [cooldownMinutes, setCooldownMinutes] = useState('15');
  const [targetId, setTargetId] = useState('');
  const [isActive, setIsActive] = useState(true);

  const metricsForTarget = METRICS_BY_TARGET[targetType] || METRICS_BY_TARGET[0];

  const resetForm = () => {
    setMode('create');
    setEditingRuleId(null);

    setTargetType(0);
    setMetric('CPU');
    setComparison('>');
    setThresholdValue('80');
    setSeverity('Warning');
    setCooldownMinutes('15');
    setTargetId('');
    setIsActive(true);
  };

  const selectForEdit = (r) => {
    setMode('edit');
    setEditingRuleId(r.id);

    setTargetType(Number(r.targetType ?? 0));
    setMetric(String(r.metric ?? 'CPU'));
    setComparison(String(r.comparison ?? '>'));
    setThresholdValue(String(r.thresholdValue ?? ''));
    setSeverity(String(r.severity ?? 'Warning'));
    setCooldownMinutes(String(r.cooldownMinutes ?? 15));
    setTargetId(r.targetId ? String(r.targetId) : '');
    setIsActive(!!r.isActive);
  };

  const loadRules = async () => {
    setLoading(true);
    setError('');
    setNotice('');
    try {
      const sid = normalizeServerId(serverId);

      // sync to MonitoringContext + localStorage (notifications page use-case)
      if (setSelectedServerId) setSelectedServerId(sid);
      try {
        localStorage.setItem('selectedServerId', String(sid));
      } catch (_) {}

      const res = await api.get(`/api/servers/${sid}/alert-rules`, {
        params: { activeOnly: activeOnly ? true : undefined },
      });

      setRules(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      setError(getErrMsg(err, 'Failed to load alert rules'));
      setRules([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRules();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverId, activeOnly]);

  // When target type changes, auto-pick a valid metric for that target
  useEffect(() => {
    const valid = (METRICS_BY_TARGET[targetType] || []).includes(metric);
    if (!valid) {
      const first = (METRICS_BY_TARGET[targetType] || ['CPU'])[0];
      setMetric(first);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetType]);

  const validateForm = () => {
    const sid = normalizeServerId(serverId);
    if (!sid) return 'Invalid server id';

    const thr = Number(thresholdValue);
    if (!Number.isFinite(thr)) return 'Threshold must be a number';

    const cd = Number(cooldownMinutes);
    if (!Number.isFinite(cd) || cd < 0) return 'Cooldown must be a valid number (>= 0)';

    if ((targetType === 3 || targetType === 4) && !String(targetId || '').trim()) {
      return 'TargetId is required for Process / Service rules (e.g., "nginx", "chrome")';
    }

    return '';
  };

  const createRule = async () => {
    const v = validateForm();
    if (v) {
      setError(v);
      return;
    }

    setError('');
    setNotice('');
    setBusyId('create');

    try {
      const sid = normalizeServerId(serverId);

      const body = {
        monitoredServerId: sid,
        metric: metric,
        thresholdValue: Number(thresholdValue),
        comparison: comparison,
        severity: severity,
        targetType: Number(targetType),
        cooldownMinutes: Number(cooldownMinutes),
      };

      // targetId optional except process/service required
      const tid = String(targetId || '').trim();
      if (tid) body.targetId = tid;

      const res = await api.post(`/api/servers/${sid}/alert-rules`, body);
      toast.success(`Rule created successfully (ID: ${res?.data?.id || '—'})`);
      resetForm();
      await loadRules();
    } catch (err) {
      const errMsg = getErrMsg(err, 'Failed to create alert rule');
      setError(errMsg);
      toast.error(errMsg);
    } finally {
      setBusyId(null);
    }
  };

  const updateRule = async () => {
    if (!editingRuleId) return;

    const v = validateForm();
    if (v) {
      setError(v);
      return;
    }

    setError('');
    setNotice('');
    setBusyId(editingRuleId);

    try {
      const sid = normalizeServerId(serverId);

      // Update DTO: metric, thresholdValue, comparison, severity, isActive, targetId, cooldownMinutes
      const body = {
        metric: metric,
        thresholdValue: Number(thresholdValue),
        comparison: comparison,
        severity: severity,
        isActive: !!isActive,
        cooldownMinutes: Number(cooldownMinutes),
      };

      const tid = String(targetId || '').trim();
      // If empty string, we send empty label (backend may accept). For non-server types it's generally needed.
      // Safer: only send if set OR if process/service (so user can change it)
      if (tid || targetType === 3 || targetType === 4) body.targetId = tid;

      await api.put(`/api/servers/${sid}/alert-rules/${editingRuleId}`, body);
      toast.success('Rule updated successfully');
      await loadRules();
    } catch (err) {
      const errMsg = getErrMsg(err, 'Failed to update alert rule');
      setError(errMsg);
      toast.error(errMsg);
    } finally {
      setBusyId(null);
    }
  };

  const deleteRule = async (ruleId) => {
    if (!window.confirm('Delete this rule?')) return;

    setError('');
    setNotice('');
    setBusyId(ruleId);

    try {
      const sid = normalizeServerId(serverId);
      await api.delete(`/api/servers/${sid}/alert-rules/${ruleId}`);
      toast.success('Rule deleted successfully');
      if (editingRuleId === ruleId) resetForm();
      await loadRules();
    } catch (err) {
      const errMsg = getErrMsg(err, 'Failed to delete alert rule');
      setError(errMsg);
      toast.error(errMsg);
    } finally {
      setBusyId(null);
    }
  };

  const toggleActive = async (rule) => {
    setError('');
    setNotice('');
    setBusyId(rule.id);

    try {
      const sid = normalizeServerId(serverId);
      await api.put(`/api/servers/${sid}/alert-rules/${rule.id}`, {
        isActive: !rule.isActive,
      });
      toast.success(`Rule ${!rule.isActive ? 'activated' : 'deactivated'}`);
      await loadRules();
    } catch (err) {
      const errMsg = getErrMsg(err, 'Failed to toggle rule active');
      setError(errMsg);
      toast.error(errMsg);
    } finally {
      setBusyId(null);
    }
  };

  const targetLabel = (t) => {
    const it = TARGET_TYPES.find((x) => Number(x.value) === Number(t));
    return it ? it.label : String(t);
  };

  return (
    <div>
      <div className="page-header">
        <div className="page-header-title-area">
          <h1 className="page-title">
            <span className="page-title-icon">📋</span>
            Alert Rules
          </h1>
          <p className="page-subtitle">Configure alerting thresholds and notification rules</p>
        </div>
        <button className="btn" onClick={loadRules} disabled={loading}>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {error ? <div className="error-box">{error}</div> : null}
      {notice ? <div className="notice">{notice}</div> : null}

      {/* Filters */}
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Filters</h2>
        <div className="form-row">
          <ServerSelect label="Server" value={serverId} onChange={onChangeServer} minWidth={360} />

          <div className="input-group" style={{ minWidth: 220 }}>
            <label>Active Only</label>
            <select value={activeOnly ? 'true' : 'false'} onChange={(e) => setActiveOnly(e.target.value === 'true')}>
              <option value="false">All</option>
              <option value="true">Active only</option>
            </select>
          </div>
        </div>
      </div>

      {/* Create / Edit form */}
      <div className="card">
        <h2 style={{ marginTop: 0 }}>
          {mode === 'edit' ? `Edit Rule #${editingRuleId}` : 'Create New Rule'}
        </h2>

        <div className="small" style={{ marginBottom: 10 }}>
          Note: The update endpoint does not support changing <b>targetType</b>. If needed, delete the rule and create it again.
        </div>

        <div className="form-row">
          <div className="input-group" style={{ minWidth: 220 }}>
            <label>Target Type</label>
            <select
              value={String(targetType)}
              onChange={(e) => setTargetType(Number(e.target.value))}
              disabled={mode === 'edit'} // update DTO doesn't include targetType
            >
              {TARGET_TYPES.map((t) => (
                <option key={t.value} value={String(t.value)}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          <div className="input-group" style={{ minWidth: 240 }}>
            <label>Metric</label>
            <select value={metric} onChange={(e) => setMetric(e.target.value)}>
              {metricsForTarget.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          <div className="input-group" style={{ minWidth: 160 }}>
            <label>Comparison</label>
            <select value={comparison} onChange={(e) => setComparison(e.target.value)}>
              {COMPARISONS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div className="input-group" style={{ minWidth: 220 }}>
            <label>Threshold Value</label>
            <input
              value={thresholdValue}
              onChange={(e) => setThresholdValue(e.target.value)}
              placeholder="80"
            />
          </div>

          <div className="input-group" style={{ minWidth: 220 }}>
            <label>Severity</label>
            <select value={severity} onChange={(e) => setSeverity(e.target.value)}>
              {SEVERITIES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div className="input-group" style={{ minWidth: 220 }}>
            <label>Cooldown (minutes)</label>
            <input
              value={cooldownMinutes}
              onChange={(e) => setCooldownMinutes(e.target.value)}
              placeholder="15"
            />
          </div>

          <div className="input-group" style={{ minWidth: 260 }}>
            <label>
              Target ID {targetType === 3 || targetType === 4 ? '(required)' : '(optional)'}
            </label>
            <input
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
              placeholder={
                targetType === 1
                  ? '/dev/sda1'
                  : targetType === 2
                  ? 'eth0'
                  : targetType === 3
                  ? 'chrome'
                  : targetType === 4
                  ? 'nginx'
                  : '(none)'
              }
              disabled={targetType === 0}
            />
          </div>

          <div className="input-group" style={{ minWidth: 180 }}>
            <label>Active</label>
            <select value={isActive ? 'true' : 'false'} onChange={(e) => setIsActive(e.target.value === 'true')}>
              <option value="true">Active</option>
              <option value="false">Disabled</option>
            </select>
          </div>
        </div>

        <div className="action-row" style={{ marginTop: 12 }}>
          {mode === 'edit' ? (
            <>
              <button
                className="btn btn-primary"
                onClick={updateRule}
                disabled={busyId !== null}
              >
                {busyId === editingRuleId ? 'Saving…' : 'Save Changes'}
              </button>
              <button className="btn btn-muted" onClick={resetForm} disabled={busyId !== null}>
                Cancel
              </button>
            </>
          ) : (
            <button
              className="btn btn-primary"
              onClick={createRule}
              disabled={busyId !== null}
            >
              {busyId === 'create' ? 'Creating…' : 'Create Rule'}
            </button>
          )}
        </div>
      </div>

      {/* Rules table */}
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Rules</h2>

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: 70 }}>ID</th>
                <th style={{ width: 120 }}>Active</th>
                <th style={{ width: 110 }}>Severity</th>
                <th style={{ width: 140 }}>Target</th>
                <th style={{ width: 220 }}>Target ID</th>
                <th style={{ width: 140 }}>Metric</th>
                <th style={{ width: 120 }}>Comp</th>
                <th style={{ width: 160 }}>Threshold</th>
                <th style={{ width: 160 }}>Cooldown</th>
                <th>Created</th>
                <th style={{ width: 220 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rules.length === 0 ? (
                <tr>
                  <td colSpan={11} className="small">
                    {loading ? 'Loading…' : 'No rules found.'}
                  </td>
                </tr>
              ) : (
                rules.map((r) => (
                  <tr key={r.id}>
                    <td>{r.id}</td>
                    <td>
                      <button
                        className={`btn ${r.isActive ? 'btn-primary' : 'btn-muted'}`}
                        onClick={() => toggleActive(r)}
                        disabled={busyId === r.id}
                        title="Toggle active"
                      >
                        {busyId === r.id ? '…' : r.isActive ? 'Active' : 'Disabled'}
                      </button>
                    </td>
                    <td>
                      <span className={`badge ${severityClass(r.severity)}`}>{r.severity}</span>
                    </td>
                    <td>{targetLabel(r.targetType)}</td>
                    <td className="small">{r.targetId || '—'}</td>
                    <td>{r.metric}</td>
                    <td>{r.comparison}</td>
                    <td>{r.thresholdValue}</td>
                    <td>{r.cooldownMinutes}m</td>
                    <td className="small">
                      {r.createdAtUtc ? new Date(r.createdAtUtc).toLocaleString() : '—'}
                    </td>
                    <td>
                      <div className="action-row">
                        <button
                          className="btn btn-warning"
                          onClick={() => selectForEdit(r)}
                          disabled={busyId !== null}
                        >
                          Edit
                        </button>
                        <button
                          className="btn btn-danger"
                          onClick={() => deleteRule(r.id)}
                          disabled={busyId === r.id}
                        >
                          {busyId === r.id ? 'Deleting…' : 'Delete'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="small" style={{ marginTop: 10 }}>
          Tip: For Disk/Network, if targetId is left empty backend “any partition/interface” it may behave like .../interface (depends on the backend implementation).
          For Process/Service, targetId is required.
        </div>
      </div>
    </div>
  );
};

export default AlertRulesPage;
