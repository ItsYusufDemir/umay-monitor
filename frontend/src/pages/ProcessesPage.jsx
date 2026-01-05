// src/pages/ProcessesPage.jsx
import React, { useEffect, useMemo, useState } from 'react';
import api from '../api/axiosConfig';
import { useMonitoring } from '../context/MonitoringContext';
import { useToast } from '../context/ToastContext';
import ServerSelect from '../components/common/ServerSelect';
import ProcessList from '../components/processes/ProcessList';

const getErrMsg = (err, fallback) =>
  err?.response?.data?.message || err?.message || fallback;

const normalizeServerId = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return 1;
  const i = Math.floor(n);
  return i >= 1 ? i : 1;
};

const normalizeWatchlistConfig = (raw) => {
  const cfg = raw && typeof raw === 'object' ? raw : {};
  return {
    services: Array.isArray(cfg.services) ? cfg.services : [],
    processes: Array.isArray(cfg.processes) ? cfg.processes : [],
  };
};

/**
 * Backend sometimes returns a wrapper:
 *  - { status:"ok", data: ... }
 * sometimes returns a raw DTO:
 *  - { pid, name, ... }
 * sometimes returns a direct array:
 *  - [ {pid,...}, ... ]
 */
const unwrap = (raw) => {
  if (raw == null) return null;

  if (Array.isArray(raw)) return raw;

  if (typeof raw === 'object') {
    // ⚠️ IMPORTANT: Process DTO itself contains a "status" field (e.g. "running").
    // So we only treat "status" as a wrapper indicator if it's one of the known wrapper values.
    if (typeof raw.status === 'string') {
      const st = raw.status.toLowerCase();
      const isWrapperStatus = ['ok', 'success', 'error', 'failed'].includes(st);
      const hasWrapperPayload =
        Object.prototype.hasOwnProperty.call(raw, 'data') ||
        Object.prototype.hasOwnProperty.call(raw, 'result') ||
        Object.prototype.hasOwnProperty.call(raw, 'payload') ||
        Object.prototype.hasOwnProperty.call(raw, 'message');

      if (isWrapperStatus && hasWrapperPayload) {
        if (st === 'ok' || st === 'success') {
          return raw.data ?? raw.result ?? raw.payload ?? null;
        }

        // edge: status=error but a DTO may still be present inside data
        const candidate = raw.data ?? raw.result ?? raw.payload;
        if (candidate && (candidate.pid != null || candidate.name || candidate.cmdline)) return candidate;

        throw new Error(raw.message || `Backend returned status=${raw.status}`);
      }
      // else: NOT a wrapper -> fall through (treat as DTO)
    }

    if (raw.pid != null || raw.name || raw.cmdline) return raw;

    if (raw.data && (raw.data.pid != null || raw.data.name || raw.data.cmdline)) return raw.data;
    if (raw.data && Array.isArray(raw.data)) return raw.data;
  }

  return null;
};

const formatSeconds = (secs) => {
  const n = Number(secs);
  if (!Number.isFinite(n) || n < 0) return '—';
  const s = Math.floor(n);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${r}s`;
  return `${r}s`;
};

const ProcessesPage = () => {
  const { selectedServerId, setSelectedServerId } = useMonitoring() || {};
  const toast = useToast();

  const [processes, setProcesses] = useState([]);
  const [loadingList, setLoadingList] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const [selectedPid, setSelectedPid] = useState(null);
  const [detail, setDetail] = useState(null);

  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Watchlist state (used only to render a simple Watch button)
  const [watchlistConfig, setWatchlistConfig] = useState({ services: [], processes: [] });
  const watchedProcesses = useMemo(
    () => new Set((watchlistConfig?.processes || []).map((x) => String(x))),
    [watchlistConfig?.processes]
  );
  const [watchBusy, setWatchBusy] = useState({});

  // Cache for process cmdlines fetched from detail API
  const [processCmdlines, setProcessCmdlines] = useState({});

  // For removing from watchlist
  const [removingFromWatchlist, setRemovingFromWatchlist] = useState(null);

  // Fetch cmdlines for all processes from detail API (for accurate watched status)
  const fetchProcessCmdlines = async (sid, processList) => {
    const newCmdlines = {};
    
    // Fetch details for each process in parallel (limited batch)
    const fetchPromises = processList.map(async (p) => {
      try {
        const res = await api.get(`/api/servers/${sid}/processes/${p.pid}`);
        const detail = unwrap(res?.data);
        if (detail?.cmdline) {
          newCmdlines[p.pid] = detail.cmdline;
        }
      } catch (err) {
        // Ignore individual failures, process may have exited
      }
    });

    await Promise.all(fetchPromises);
    setProcessCmdlines(newCmdlines);
    return newCmdlines;
  };

  const loadWatchlistConfig = async (sid) => {
    try {
      const res = await api.get(`/api/servers/${sid}/watchlist`);
      setWatchlistConfig(normalizeWatchlistConfig(res?.data));
    } catch (err) {
      // Non-blocking: if this fails, just keep current config
      console.warn('Watchlist config load failed:', err);
    }
  };

  const toggleProcessWatch = async (processKeyRaw, pidRaw) => {
    const sid = normalizeServerId(selectedServerId);
    const processKey = String(processKeyRaw || '').trim();
    const pid = pidRaw ? Number(pidRaw) : null;
    
    if (!processKey && !pid) return;

    const key = processKey;
    setWatchBusy((prev) => ({ ...prev, [key]: true }));
    setError('');
    setNotice('');

    try {
      // Fetch process details to get accurate cmdline
      let cmdline = processKey;
      if (pid) {
        try {
          const res = await api.get(`/api/servers/${sid}/processes/${pid}`);
          const processDetail = unwrap(res?.data);
          if (processDetail?.cmdline) {
            cmdline = processDetail.cmdline;
          }
        } catch (err) {
          console.warn('Failed to fetch process details, using key as cmdline:', err);
        }
      }

      const isWatched = watchedProcesses.has(cmdline) || watchedProcesses.has(processKey);

      if (isWatched) {
        await api.delete(`/api/servers/${sid}/watchlist/processes`, {
          data: { cmdline }
        });
        toast.success(`Removed from watchlist`);
      } else {
        await api.post(`/api/servers/${sid}/watchlist/processes`, {
          cmdline
        });
        toast.success(`Added to watchlist`);
      }
      await loadWatchlistConfig(sid);
    } catch (err) {
      const status = err?.response?.status;
      if (status === 503) toast.error('Server is not connected');
      else if (status === 504) toast.error('Request timed out');
      else toast.error(getErrMsg(err) || 'Watchlist operation failed');
    } finally {
      setWatchBusy((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  };

  const removeFromWatchlist = async (processName) => {
    const sid = normalizeServerId(selectedServerId);
    const processKey = String(processName || '').trim();
    if (!processKey) return;

    setRemovingFromWatchlist(processKey);
    setError('');
    setNotice('');

    try {
      await api.delete(`/api/servers/${sid}/watchlist/processes`, {
        data: { cmdline: processKey }
      });
      
      // Update local state
      setWatchlistConfig((prev) => ({
        ...prev,
        processes: prev.processes.filter((p) => p !== processKey),
      }));

      toast.success(`Removed from watchlist`);
    } catch (err) {
      const status = err?.response?.status;
      if (status === 503) toast.error('Server is not connected');
      else if (status === 504) toast.error('Request timed out');
      else toast.error(getErrMsg(err) || 'Failed to remove from watchlist');
    } finally {
      setRemovingFromWatchlist(null);
    }
  };

  const loadProcesses = async (sid) => {
    setError('');
    setNotice('');
    setLoadingList(true);

    try {
      const res = await api.get(`/api/servers/${sid}/processes`);
      const data = unwrap(res?.data);

      if (!Array.isArray(data)) {
        throw new Error('Process list format unexpected');
      }

      const list = data.map((p) => ({
        pid: p.pid,
        name: p.name,
        user: p.user,
        status: p.status,
        cpuPercent: p.cpuPercent ?? p.cpuUsagePercent ?? 0,
        memoryPercent: p.memoryPercent ?? null,
        memoryMb: p.memoryMb ?? null,
        cmdline: p.cmdline ?? '',
      }));

      setProcesses(list);

      const stillExists = selectedPid && list.some((x) => Number(x.pid) === Number(selectedPid));
      if (!stillExists) {
        const first = list[0]?.pid ?? null;
        setSelectedPid(first);
      }

      // Keep watchlist config in sync (for Watch buttons)
      await loadWatchlistConfig(sid);
      
      // Fetch accurate cmdlines from process details (for watched status detection)
      fetchProcessCmdlines(sid, list);

      return list;
    } catch (err) {
      setError(getErrMsg(err, 'Failed to load processes'));
      setProcesses([]);
      setSelectedPid(null);
      setDetail(null);
      return [];
    } finally {
      setLoadingList(false);
    }
  };

  const loadProcessDetail = async (sid, pid) => {
    if (!pid) {
      setDetail(null);
      return null;
    }

    setError('');
    setNotice('');
    setLoadingDetail(true);

    try {
      const res = await api.get(`/api/servers/${sid}/processes/${pid}`);
      const dto = unwrap(res?.data);

      if (!dto || typeof dto !== 'object') {
        throw new Error('Process detail format unexpected');
      }

      const normalized = {
        pid: dto.pid,
        name: dto.name,
        user: dto.user,
        status: dto.status,
        cpuPercent: dto.cpuPercent ?? dto.cpuUsagePercent ?? 0,
        memoryPercent: dto.memoryPercent ?? null,
        memoryMb: dto.memoryMb ?? null,
        cmdline: dto.cmdline ?? '',
        nice: dto.nice ?? null,
        numThreads: dto.numThreads ?? dto.threads ?? null,
        uptimeSeconds: dto.uptimeSeconds ?? null,
      };

      setDetail(normalized);
      return normalized;
    } catch (err) {
      const msg = getErrMsg(err, `Process details failed. serverId=${sid} pid=${pid}`);
      setError(msg);
      setDetail(null);

      // PID may have exited -> refresh + select another PID
      const http = err?.response?.status;
      if (http === 404 || String(msg).toLowerCase().includes('not found')) {
        const list = await loadProcesses(sid);

        const preferredName = processes.find((p) => Number(p.pid) === Number(pid))?.name;
        const next =
          (preferredName && list.find((p) => p.name === preferredName)?.pid) ||
          list[0]?.pid ||
          null;

        if (next && next !== pid) {
          setSelectedPid(next);
          setNotice('Selected PID no longer exists. Refreshed list and selected another process.');
        }
      }

      return null;
    } finally {
      setLoadingDetail(false);
    }
  };

  // Load list when serverId changes
  useEffect(() => {
    const sid = normalizeServerId(selectedServerId);
    loadProcesses(sid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedServerId]);

  // Load detail when selectedPid changes
  useEffect(() => {
    const sid = normalizeServerId(selectedServerId);
    if (!selectedPid) {
      setDetail(null);
      return;
    }
    loadProcessDetail(sid, selectedPid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPid, selectedServerId]);

  return (
    <div>
      <div className="page-header">
        <div className="page-header-title-area">
          <h1 className="page-title">
            <span className="page-title-icon">⚙️</span>
            Processes
          </h1>
          <p className="page-subtitle">Monitor and manage running processes on your servers</p>
        </div>

        <div className="action-row">
          <ServerSelect
            label="Server"
            value={selectedServerId}
            onChange={(sid) => setSelectedServerId(normalizeServerId(sid))}
            minWidth={360}
          />

          <button
            className="btn"
            onClick={() => loadProcesses(normalizeServerId(selectedServerId))}
            disabled={loadingList}
          >
            {loadingList ? 'Refreshing…' : 'Refresh List'}
          </button>
        </div>
      </div>

      {error ? <div className="error-box">{error}</div> : null}
      {notice ? <div className="notice">{notice}</div> : null}

      {/* ✅ Tek kaynaktan render: ProcessList */}
      <div className="card">
        <ProcessList
          processes={processes}
          loading={loadingList}
          selectedPid={selectedPid}
          onSelectPid={(pid) => setSelectedPid(pid)}
          watchedProcesses={watchedProcesses}
          onToggleWatch={toggleProcessWatch}
          watchBusy={watchBusy}
          processCmdlines={processCmdlines}
        />
      </div>

      <div className="card">
        <div className="action-row">
          <h2 style={{ margin: 0 }}>Process Details</h2>
          <span className="badge badge-muted">serverId={selectedServerId}</span>
          <span className="badge badge-muted">pid={selectedPid ?? '—'}</span>

          <button
            className="btn btn-muted"
            disabled={!selectedPid || loadingDetail}
            onClick={() => loadProcessDetail(normalizeServerId(selectedServerId), selectedPid)}
          >
            {loadingDetail ? 'Loading…' : 'Reload Details'}
          </button>
        </div>

        {!selectedPid ? (
          <div className="small" style={{ marginTop: 10 }}>
            Select a process from the list.
          </div>
        ) : loadingDetail ? (
          <div className="small" style={{ marginTop: 10 }}>
            Loading details…
          </div>
        ) : !detail ? (
          <div className="small" style={{ marginTop: 10 }}>
            Details are empty. (The PID may have exited, or the backend may be returning a different format.)
          </div>
        ) : (
          <div style={{ marginTop: 12 }}>
            <div
              className="grid"
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: 12,
              }}
            >
              <div className="kv">
                <div className="small">Name</div>
                <div>{detail.name || '—'}</div>
              </div>

              <div className="kv">
                <div className="small">User</div>
                <div>{detail.user || '—'}</div>
              </div>

              <div className="kv">
                <div className="small">Status</div>
                <div>{detail.status || '—'}</div>
              </div>

              <div className="kv">
                <div className="small">CPU %</div>
                <div>{Number(detail.cpuPercent || 0).toFixed(2)}</div>
              </div>

              <div className="kv">
                <div className="small">Memory %</div>
                <div>{detail.memoryPercent != null ? Number(detail.memoryPercent).toFixed(2) : '—'}</div>
              </div>

              <div className="kv">
                <div className="small">Threads</div>
                <div>{detail.numThreads != null ? String(detail.numThreads) : '—'}</div>
              </div>

              <div className="kv">
                <div className="small">Nice</div>
                <div>{detail.nice != null ? String(detail.nice) : '—'}</div>
              </div>

              <div className="kv">
                <div className="small">Uptime</div>
                <div>{detail.uptimeSeconds != null ? formatSeconds(detail.uptimeSeconds) : '—'}</div>
              </div>
            </div>

            <div style={{ marginTop: 12 }}>
              <div className="small">Cmdline</div>
              <div className="code-block" style={{ marginTop: 6 }}>
                {detail.cmdline || '—'}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Watchlist Section */}
      <div style={{ marginTop: 32, paddingTop: 24, borderTop: '1px solid rgba(148, 163, 184, 0.2)' }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16, color: '#e5e7eb' }}>Watched Processes</h2>
        {!selectedServerId ? (
          <div style={{ padding: 16, backgroundColor: 'rgba(2, 6, 23, 0.35)', borderRadius: 8, color: '#9ca3af' }}>
            Select a server to view watched processes
          </div>
        ) : watchlistConfig.processes.length === 0 ? (
          <div style={{ padding: 16, backgroundColor: 'rgba(2, 6, 23, 0.35)', borderRadius: 8, color: '#9ca3af' }}>
            No processes in watchlist. Click the "Watch" button on any process to add it.
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: 12,
            }}
          >
            {watchlistConfig.processes.map((processName) => (
              <div
                key={processName}
                style={{
                  padding: '12px 16px',
                  backgroundColor: 'rgba(2, 6, 23, 0.35)',
                  borderRadius: 8,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  border: '1px solid rgba(148, 163, 184, 0.15)',
                }}
              >
                <div style={{ color: '#e5e7eb', fontWeight: 500 }}>{processName}</div>
                <button
                  type="button"
                  onClick={() => removeFromWatchlist(processName)}
                  disabled={removingFromWatchlist === processName}
                  style={{
                    padding: '4px 12px',
                    fontSize: 13,
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    color: '#ef4444',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    borderRadius: 6,
                    cursor: removingFromWatchlist === processName ? 'not-allowed' : 'pointer',
                    opacity: removingFromWatchlist === processName ? 0.5 : 1,
                  }}
                >
                  {removingFromWatchlist === processName ? 'Removing...' : 'Remove'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ProcessesPage;
