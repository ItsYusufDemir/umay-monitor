// src/pages/AgentsPage.jsx
import React, { useEffect, useMemo, useState } from 'react';
import api from '../api/axiosConfig';
import { useMonitoring } from '../context/MonitoringContext';
import { useToast } from '../context/ToastContext';

const unwrap = (data) => {
  // Some endpoints return plain arrays, some return { status, data, message }
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object' && Array.isArray(data.data)) return data.data;
  return [];
};

const fmtLocal = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString();
};

const AgentInstallModal = ({ payload, onClose }) => {
  if (!payload) return null;

  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Fallback (older browsers)
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal">
        <div className="modal-header">
          <div>
            <div className="modal-title">⚠️ Installation Command (One Time Only)</div>
            <div className="small" style={{ marginTop: 6, opacity: 0.9 }}>
              This token will be shown only now. Copy the command and save it somewhere safe.
            </div>
          </div>
          <button type="button" className="btn btn-muted" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="modal-body">
          <div className="notice" style={{ borderColor: 'rgba(239,68,68,0.35)' }}>
            <strong>Important:</strong> The token is hashed in the database and will not be shown again.
          </div>

          <h3 style={{ margin: '12px 0 8px' }}>Run on Linux server</h3>
          <pre className="code-block" style={{ marginTop: 0 }}>
            {payload.installCommand}
          </pre>

          <div className="action-row" style={{ marginTop: 10 }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => copy(payload.installCommand)}
            >
              Copy Command
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => copy(payload.token)}
            >
              Copy Token
            </button>
          </div>

          <div style={{ marginTop: 14 }}>
            <div className="small" style={{ opacity: 0.85 }}>
              Agent ID: <strong>{payload.id}</strong> • Created: <strong>{fmtLocal(payload.createdAtUtc)}</strong>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const AgentsPage = () => {
  const { refreshServers } = useMonitoring();
  const toast = useToast();

  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [name, setName] = useState('');
  const [registering, setRegistering] = useState(false);
  const [installPayload, setInstallPayload] = useState(null);

  const [deletingId, setDeletingId] = useState(null);
  const [refreshingId, setRefreshingId] = useState(null);

  const loadAgents = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/api/agents');
      setAgents(unwrap(res.data));
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Failed to load agents');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAgents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const registerAgent = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;

    setRegistering(true);
    setError('');
    try {
      const res = await api.post('/api/agents/register', { name: trimmed });
      const payload = res?.data;
      setInstallPayload(payload);
      setName('');
      await loadAgents();
      refreshServers?.();
      toast.success(`Agent '${trimmed}' registered successfully`);
    } catch (err) {
      toast.error(err?.response?.data?.message || err?.message || 'Registration failed');
    } finally {
      setRegistering(false);
    }
  };

  const deleteAgent = async (id) => {
    const ok = window.confirm('Delete this agent? (Uninstall on the Linux server is not performed automatically)');
    if (!ok) return;

    setDeletingId(id);
    setError('');
    try {
      await api.delete(`/api/agents/${id}`);
      await loadAgents();
      refreshServers?.();
      toast.success('Agent deleted successfully');
    } catch (err) {
      toast.error(err?.response?.data?.message || err?.message || 'Delete failed');
    } finally {
      setDeletingId(null);
    }
  };

  const refreshStatus = async (id) => {
    setRefreshingId(id);
    setError('');
    try {
      const res = await api.get(`/api/agents/${id}/status`);
      const status = res?.data?.data || res?.data;
      setAgents((prev) =>
        prev.map((a) =>
          Number(a.id) === Number(id)
            ? {
                ...a,
                isOnline: !!status?.isOnline,
                lastSeenUtc: status?.lastSeenUtc || a.lastSeenUtc,
              }
            : a
        )
      );
      toast.success('Status refreshed');
    } catch (err) {
      toast.error(err?.response?.data?.message || err?.message || 'Status refresh failed');
    } finally {
      setRefreshingId(null);
    }
  };

  const sortedAgents = useMemo(() => {
    const list = Array.isArray(agents) ? [...agents] : [];
    list.sort((a, b) => {
      const ao = a.isOnline ? 0 : 1;
      const bo = b.isOnline ? 0 : 1;
      if (ao !== bo) return ao - bo;
      return String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' });
    });
    return list;
  }, [agents]);

  return (
    <div>
      <div className="page-header">
        <div className="page-header-title-area">
          <h1 className="page-title">
            <span className="page-title-icon">🖥️</span>
            Agents
          </h1>
          <p className="page-subtitle">Register and manage monitoring agents on your servers</p>
        </div>
        <button className="btn" onClick={loadAgents} disabled={loading}>
          Refresh
        </button>
      </div>

      {error ? <div className="error-box">{error}</div> : null}

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Register New Agent</h2>
        <p className="small" style={{ marginTop: 6 }}>
          Create a new agent (server) record and get the install command to run on the Linux server.
        </p>

        <div className="form-row" style={{ marginTop: 12 }}>
          <div className="input-group" style={{ maxWidth: 320 }}>
            <label>Server name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder='e.g. "Production Server"'
            />
          </div>

          <button
            type="button"
            className="btn btn-primary"
            onClick={registerAgent}
            disabled={registering || !name.trim()}
            style={{ marginTop: 'auto' }}
          >
            {registering ? 'Registering…' : 'Register'}
          </button>
        </div>

        <div className="notice" style={{ marginTop: 14 }}>
          Token is returned only at registration time. Copy and save the install command now.
        </div>
      </div>

      <div className="card">
        <div className="detail-header" style={{ marginBottom: 10 }}>
          <h2 style={{ margin: 0 }}>Registered Agents</h2>
          <span className="badge badge-muted">{sortedAgents.length} items</span>
        </div>

        {loading ? (
          <div>Loading…</div>
        ) : sortedAgents.length === 0 ? (
          <div className="muted">No agents found.</div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: 220 }}>Name</th>
                  <th style={{ width: 220 }}>Hostname</th>
                  <th style={{ width: 110 }}>Status</th>
                  <th style={{ width: 210 }}>Last Seen</th>
                  <th style={{ width: 210 }}>Created</th>
                  <th style={{ width: 220 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedAgents.map((a) => {
                  const online = !!a.isOnline;
                  return (
                    <tr key={a.id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span className={online ? 'dot dot-online' : 'dot dot-offline'} />
                          <div>
                            <div style={{ fontWeight: 700 }}>{a.name || `Agent ${a.id}`}</div>
                            <div className="small" style={{ opacity: 0.75 }}>
                              ID: {a.id}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{a.hostname || '-'}</div>
                      </td>
                      <td>
                        <span className={`badge ${online ? 'badge-ok' : 'badge-crit'}`}>
                          {online ? 'Online' : 'Offline'}
                        </span>
                      </td>
                      <td>{fmtLocal(a.lastSeenUtc)}</td>
                      <td>{fmtLocal(a.createdAtUtc)}</td>
                      <td>
                        <div className="action-row">
                          <button
                            type="button"
                            className="btn btn-danger"
                            onClick={() => deleteAgent(a.id)}
                            disabled={deletingId === a.id}
                            title="Delete agent"
                          >
                            {deletingId === a.id ? 'Deleting…' : 'Delete'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <AgentInstallModal payload={installPayload} onClose={() => setInstallPayload(null)} />
    </div>
  );
};

export default AgentsPage;
