// src/pages/WatchlistPage.jsx
import React, { useEffect, useMemo, useState } from 'react';
import api from '../api/axiosConfig';
import { useMonitoring } from '../context/MonitoringContext';
import { useToast } from '../context/ToastContext';
import ServerSelect from '../components/common/ServerSelect';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts';

const getErrMsg = (err, fallback) =>
  err?.response?.data?.message || err?.message || fallback;

const normalizeServerId = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return 1;
  const i = Math.floor(n);
  return i >= 1 ? i : 1;
};

const splitTokens = (raw) =>
  String(raw || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);

const uniqCaseInsensitive = (arr) => {
  const seen = new Set();
  const out = [];
  for (const item of arr) {
    const key = String(item).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
};

const ChipEditor = ({ label, chips, setChips, placeholder }) => {
  const [draft, setDraft] = useState('');

  const addFromRaw = (raw) => {
    const tokens = splitTokens(raw);
    if (!tokens.length) return;

    const merged = uniqCaseInsensitive([...(chips || []), ...tokens]);
    setChips(merged);
  };

  const removeChip = (chip) => {
    const key = String(chip).toLowerCase();
    setChips((prev) => (prev || []).filter((c) => String(c).toLowerCase() !== key));
  };

  const commitDraft = () => {
    if (!draft.trim()) return;
    addFromRaw(draft);
    setDraft('');
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      commitDraft();
      return;
    }

    // Backspace on empty input -> remove last chip
    if (e.key === 'Backspace' && !draft) {
      if (chips && chips.length) {
        removeChip(chips[chips.length - 1]);
      }
    }
  };

  return (
    <div className="chip-editor">
      <label className="chip-label">{label}</label>

      <div
        className="chip-box"
        onClick={() => {
          const el = document.getElementById(`chip-input-${label}`);
          if (el) el.focus();
        }}
      >
        {(chips || []).map((c) => (
          <span key={c} className="chip">
            <span className="chip-text">{c}</span>
            <button
              type="button"
              className="chip-x"
              onClick={(e) => {
                e.stopPropagation();
                removeChip(c);
              }}
              aria-label={`Remove ${c}`}
              title="Remove"
            >
              ×
            </button>
          </span>
        ))}

        <input
          id={`chip-input-${label}`}
          className="chip-input"
          value={draft}
          placeholder={chips?.length ? '' : placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => commitDraft()}
        />
      </div>

      <div className="chip-hint small">
        Add with Enter / comma, remove with ×. On empty input, Backspace removes the last chip.
      </div>
    </div>
  );
};

const WatchlistPage = () => {
  const {
    selectedServerId,
    setSelectedServerId,
    isSubscribed,
    ensureSubscribed,
    connecting,
    subscribing,

    watchlistMetrics,
    watchlistHistory,
    clearWatchlistHistory,
  } = useMonitoring();

  // Config form state
  const [metricsInterval, setMetricsInterval] = useState('5');

  // ✅ Chips state (instead of CSV)
  const [services, setServices] = useState(['nginx', 'postgresql']);
  const [processes, setProcesses] = useState(['python', 'node']);

  const [saving, setSaving] = useState(false);
  const [loadingConfig, setLoadingConfig] = useState(false);

  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // keep localStorage in sync
  useEffect(() => {
    try {
      localStorage.setItem('selectedServerId', String(selectedServerId));
    } catch (_) {}
  }, [selectedServerId]);

  // Auto-load watchlist when server changes
  useEffect(() => {
    if (!selectedServerId) return;
    
    const loadWatchlist = async () => {
      try {
        const res = await api.get(`/api/servers/${selectedServerId}/watchlist`);
        const data = res?.data || {};
        if (Array.isArray(data.services)) setServices(uniqCaseInsensitive(data.services));
        if (Array.isArray(data.processes)) setProcesses(uniqCaseInsensitive(data.processes));
      } catch (_) {
        // Silently fail on auto-load
      }
    };
    
    loadWatchlist();
  }, [selectedServerId]);

  const onChangeServer = (val) => {
    const sid = normalizeServerId(val);
    setSelectedServerId(sid);
    setError('');
    setNotice('');
  };

  // ✅ Single flow: Apply Watchlist (auto-subscribed to selected server)
  const applyWatchlist = async () => {
    setError('');
    setNotice('');
    setSaving(true);

    try {
      // 1) ensure subscribed
      await ensureSubscribed(selectedServerId);

      // 2) Get current watchlist from server to calculate diff
      let currentServices = [];
      let currentProcesses = [];
      try {
        const res = await api.get(`/api/servers/${selectedServerId}/watchlist`);
        currentServices = res?.data?.services || [];
        currentProcesses = res?.data?.processes || [];
      } catch (_) {
        // If we can't fetch current, assume empty
      }

      const targetServices = uniqCaseInsensitive(services || []);
      const targetProcesses = uniqCaseInsensitive(processes || []);

      // Services to add (in target but not in current)
      const servicesToAdd = targetServices.filter(
        (s) => !currentServices.some((cs) => cs.toLowerCase() === s.toLowerCase())
      );
      // Services to remove (in current but not in target)
      const servicesToRemove = currentServices.filter(
        (s) => !targetServices.some((ts) => ts.toLowerCase() === s.toLowerCase())
      );

      // Processes to add (in target but not in current)
      const processesToAdd = targetProcesses.filter(
        (p) => !currentProcesses.some((cp) => cp.toLowerCase() === p.toLowerCase())
      );
      // Processes to remove (in current but not in target)
      const processesToRemove = currentProcesses.filter(
        (p) => !targetProcesses.some((tp) => tp.toLowerCase() === p.toLowerCase())
      );

      // Execute all operations
      const operations = [];

      for (const serviceName of servicesToAdd) {
        operations.push(
          api.post(`/api/servers/${selectedServerId}/watchlist/services`, { serviceName })
        );
      }
      for (const serviceName of servicesToRemove) {
        operations.push(
          api.delete(`/api/servers/${selectedServerId}/watchlist/services`, { data: { serviceName } })
        );
      }
      for (const cmdline of processesToAdd) {
        operations.push(
          api.post(`/api/servers/${selectedServerId}/watchlist/processes`, { cmdline })
        );
      }
      for (const cmdline of processesToRemove) {
        operations.push(
          api.delete(`/api/servers/${selectedServerId}/watchlist/processes`, { data: { cmdline } })
        );
      }

      if (operations.length > 0) {
        await Promise.all(operations);
      }

      // 3) Update metrics interval via configuration endpoint (if supported)
      const intervalNum = Number(metricsInterval);
      try {
        await api.put(`/api/servers/${selectedServerId}/configuration`, {
          metricsInterval: Number.isFinite(intervalNum) ? intervalNum : 5,
        });
      } catch (_) {
        // Configuration endpoint is optional
      }

      toast.success(`Watchlist applied for server ${selectedServerId}`);
    } catch (err) {
      const errMsg = getErrMsg(err, 'Apply watchlist failed');
      setError(errMsg);
      toast.error(errMsg);
    } finally {
      setSaving(false);
    }
  };

  // Optional: Load current configuration (if backend supports GET)
  const loadConfiguration = async () => {
    setError('');
    setNotice('');
    setLoadingConfig(true);

    try {
      // Load watchlist from watchlist endpoint
      const watchlistRes = await api.get(`/api/servers/${selectedServerId}/watchlist`);
      const watchlistData = watchlistRes?.data || {};
      
      if (Array.isArray(watchlistData.services)) setServices(uniqCaseInsensitive(watchlistData.services));
      if (Array.isArray(watchlistData.processes)) setProcesses(uniqCaseInsensitive(watchlistData.processes));

      // Try to load metrics interval from configuration endpoint (optional)
      try {
        const configRes = await api.get(`/api/servers/${selectedServerId}/configuration`);
        const cfg = configRes?.data || null;
        if (cfg?.metricsInterval != null) setMetricsInterval(String(cfg.metricsInterval));
      } catch (_) {
        // Configuration endpoint is optional
      }

      setNotice('Watchlist loaded.');
    } catch (err) {
      const errMsg = getErrMsg(err, 'Failed to load watchlist');
      setError(errMsg);
    } finally {
      setLoadingConfig(false);
    }
  };

  const lastTime = (() => {
    if (!watchlistMetrics) return '';
    const t = watchlistMetrics.timestampUtc || watchlistMetrics.timestamp || null;
    if (!t) return '';
    const d = new Date(t);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString();
  })();

  const liveServices = Array.isArray(watchlistMetrics?.services) ? watchlistMetrics.services : [];
  const liveProcesses = Array.isArray(watchlistMetrics?.processes) ? watchlistMetrics.processes : [];

  // ✅ Trend data from watchlistHistory (last 50)
  const trendData = useMemo(() => {
    const hist = Array.isArray(watchlistHistory) ? watchlistHistory : [];
    const last50 = hist.slice(-50);

    const toPoint = (evt) => {
      const t = evt?.timestampUtc || evt?.timestamp || evt?.timestampMs;
      const d = new Date(t);
      const label = Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString();

      const svcs = Array.isArray(evt?.services) ? evt.services : [];
      const procs = Array.isArray(evt?.processes) ? evt.processes : [];

      // CPU: average of available cpu fields (services cpuUsagePercent, processes cpuPercent)
      const cpuVals = [];
      for (const s of svcs) if (s?.cpuUsagePercent != null) cpuVals.push(Number(s.cpuUsagePercent) || 0);
      for (const p of procs) if (p?.cpuPercent != null) cpuVals.push(Number(p.cpuPercent) || 0);
      const cpuAvg = cpuVals.length ? cpuVals.reduce((a, b) => a + b, 0) / cpuVals.length : 0;

      // RAM: total memory across items (services memoryUsage, processes memoryMb)
      // (Unit depends on the backend; commonly treated as MB.)
      let memTotal = 0;
      for (const s of svcs) if (s?.memoryUsage != null) memTotal += Number(s.memoryUsage) || 0;
      for (const p of procs) if (p?.memoryMb != null) memTotal += Number(p.memoryMb) || 0;

      // Errors count (process not found etc.)
      const errCount = procs.filter((p) => p?.error).length;

      return { time: label, cpuAvg: Number(cpuAvg.toFixed(2)), memTotal: Number(memTotal.toFixed(2)), errCount };
    };

    return last50.map(toPoint);
  }, [watchlistHistory]);

  const hasTrend = trendData && trendData.length > 1;

  return (
    <div>
      <div className="page-header">
        <div className="page-header-title-area">
          <h1 className="page-title">
            <span className="page-title-icon">👁️</span>
            Watchlist
          </h1>
          <p className="page-subtitle">Track specific processes and services with real-time monitoring</p>
        </div>

        <div className="action-row">
          <span className={`badge ${connecting ? 'badge-warn' : 'badge-ok'}`}>
            SignalR: {connecting ? 'Connecting…' : 'Ready'}
          </span>

          <span className={`badge ${isSubscribed ? 'badge-ok' : 'badge-muted'}`}>
            Subscription: {isSubscribed ? 'Active' : 'Not subscribed'}
          </span>

          <button className="btn btn-primary" onClick={applyWatchlist} disabled={saving || subscribing}>
            {saving ? 'Applying…' : 'Apply Watchlist'}
          </button>

          <button
            className="btn btn-muted"
            onClick={clearWatchlistHistory}
            disabled={!watchlistHistory?.length}
          >
            Clear Watchlist History
          </button>
        </div>
      </div>

      {error ? <div className="error-box">{error}</div> : null}
      {notice ? <div className="notice">{notice}</div> : null}

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Watchlist Configuration</h2>

        <div className="form-row">
          <ServerSelect
            label="Server"
            value={selectedServerId}
            onChange={onChangeServer}
            minWidth={360}
          />

          <div className="input-group" style={{ minWidth: 220 }}>
            <label>Metrics Interval (seconds)</label>
            <input
              value={metricsInterval}
              onChange={(e) => setMetricsInterval(e.target.value)}
              placeholder="5"
            />
          </div>

          <button className="btn" onClick={loadConfiguration} disabled={loadingConfig}>
            {loadingConfig ? 'Loading…' : 'Load Config (optional)'}
          </button>
        </div>

        <div className="watchlist-config-grid" style={{ marginTop: 12 }}>
          <ChipEditor
            label="Services"
            chips={services}
            setChips={setServices}
            placeholder="nginx, postgresql"
          />
          <ChipEditor
            label="Processes"
            chips={processes}
            setChips={setProcesses}
            placeholder="python, node"
          />
        </div>
              </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Watchlist Trend (Last 50)</h2>

        <div className="action-row">
          <span className="badge badge-muted">Server: {selectedServerId}</span>
          {lastTime ? <span className="badge badge-info">Last update: {lastTime}</span> : null}
          <span className="badge badge-muted">History: {watchlistHistory?.length || 0}</span>
        </div>

        {hasTrend ? (
          <div style={{ width: '100%', height: 240, marginTop: 10 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="time" />
                <YAxis yAxisId="left" domain={[0, 100]} unit="%" />
                <YAxis yAxisId="right" orientation="right" />
                <Tooltip
                  contentStyle={{ background: '#ffffff', color: '#111827', borderRadius: 8, border: '1px solid #e5e7eb' }}
                  labelStyle={{ color: '#111827' }}
                  itemStyle={{ color: '#111827' }}
                />
                <Legend />
                <Line yAxisId="left" type="monotone" dataKey="cpuAvg" name="CPU Avg (%)" dot={false} />
                <Line yAxisId="right" type="monotone" dataKey="memTotal" name="Memory Total (MB*)" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="small" style={{ marginTop: 10 }}>
            At least 2 watchlist events are required for trends. (After Apply Watchlist, wait a few seconds.)
          </div>
        )}
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Live Watchlist Metrics</h2>

        <div className="action-row">
          <span className="badge badge-muted">Server: {selectedServerId}</span>
          {lastTime ? <span className="badge badge-info">Last update: {lastTime}</span> : null}
          <span className="badge badge-muted">History: {watchlistHistory?.length || 0}</span>
        </div>

        <h3 style={{ marginTop: 14 }}>Services</h3>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Service</th>
                <th>Status</th>
                <th>CPU %</th>
                <th>Memory</th>
                <th>Main PID</th>
                <th>Start Time</th>
                <th>Restart Policy</th>
              </tr>
            </thead>
            <tbody>
              {liveServices.length === 0 ? (
                <tr>
                  <td colSpan={7} className="small">
                    No watchlist service data yet.
                  </td>
                </tr>
              ) : (
                liveServices.map((s, idx) => (
                  <tr key={(s?.name || 'svc') + '-' + idx}>
                    <td>{s.name}</td>
                    <td className="small">
                      {s.activeState} {s.subState ? `(${s.subState})` : ''}
                    </td>
                    <td className="small">{s.cpuUsagePercent != null ? String(s.cpuUsagePercent) : '—'}</td>
                    <td className="small">{s.memoryUsage != null ? String(s.memoryUsage) : '—'}</td>
                    <td className="small">{s.mainPID != null ? String(s.mainPID) : '—'}</td>
                    <td className="small">{s.startTime ? String(s.startTime) : '—'}</td>
                    <td className="small">{s.restartPolicy ? String(s.restartPolicy) : '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <h3 style={{ marginTop: 14 }}>Processes</h3>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>PID</th>
                <th>Name</th>
                <th>CPU %</th>
                <th>Mem (MB)</th>
                <th>User</th>
                <th>Status</th>
                <th>Error</th>
              </tr>
            </thead>
            <tbody>
              {liveProcesses.length === 0 ? (
                <tr>
                  <td colSpan={7} className="small">
                    No watchlist process data yet.
                  </td>
                </tr>
              ) : (
                liveProcesses.map((p, idx) => (
                  <tr key={(p?.pid != null ? String(p.pid) : p?.name || 'proc') + '-' + idx}>
                    <td className="small">{p.pid != null ? String(p.pid) : '—'}</td>
                    <td>{p.name || '—'}</td>
                    <td className="small">{p.cpuPercent != null ? String(p.cpuPercent) : '—'}</td>
                    <td className="small">{p.memoryMb != null ? String(p.memoryMb) : '—'}</td>
                    <td className="small">{p.user || '—'}</td>
                    <td className="small">{p.status || '—'}</td>
                    <td className="small">{p.error || '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default WatchlistPage;
