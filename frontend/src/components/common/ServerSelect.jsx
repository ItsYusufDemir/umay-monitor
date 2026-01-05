import React, { useEffect, useMemo, useState } from 'react';
import api from '../../api/axiosConfig';

const toLocal = (isoUtc) => {
  if (!isoUtc) return '';
  const d = new Date(isoUtc);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString();
};

const statusDotStyle = (isOnline) => ({
  display: 'inline-block',
  width: 10,
  height: 10,
  borderRadius: 999,
  marginRight: 8,
  boxShadow: isOnline ? '0 0 0 3px rgba(34,197,94,0.18)' : '0 0 0 3px rgba(239,68,68,0.18)',
  background: isOnline ? '#22c55e' : '#ef4444',
});

const ServerSelect = ({
  label = 'Server',
  value,
  onChange,
  disabled = false,
  minWidth = 280,
  className = '',
  showRefresh = true,
  showAllOption = false,
}) => {
  const [servers, setServers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  // Single source of truth: parent-controlled value (usually MonitoringContext)
  // When value is null/undefined, show placeholder.
  const selectedServerId = value === 'all' ? 'all' : (value == null || value === '' ? '' : String(value));

  const fetchServers = async () => {
    try {
      setLoading(true);
      setErr('');
      const resp = await api.get('/api/server');
      const list = Array.isArray(resp.data) ? resp.data : resp.data?.data || [];
      setServers(list);
      return list;
    } catch (e) {
      setErr(e?.response?.data?.message || e?.message || 'Failed to fetch servers');
      setServers([]);
      return [];
    } finally {
      setLoading(false);
    }
  };

  // initial fetch
  useEffect(() => {
    fetchServers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selected = useMemo(() => {
    if (selectedServerId === '') return null;
    return servers.find((s) => String(s.id) === String(selectedServerId)) || null;
  }, [servers, selectedServerId]);

  const onSelect = (e) => {
    const raw = e.target.value;
    if (raw === '') {
      onChange?.(null);
      return;
    }
    if (raw === 'all') {
      onChange?.('all');
      return;
    }
    const sid = Number(raw);
    onChange?.(sid);
  };

  const options = useMemo(() => {
    // Sort: online first, then name
    const sorted = [...servers].sort((a, b) => {
      const ao = a.isOnline ? 0 : 1;
      const bo = b.isOnline ? 0 : 1;
      if (ao !== bo) return ao - bo;
      return String(a.name || '').localeCompare(String(b.name || ''));
    });

    return sorted.map((s) => {
      const online = !!s.isOnline;
      const name = s.name || `Server ${s.id}`;
      const host = s.hostname || s.ipAddress || '';
      const os = s.os ? ` • ${s.os}` : '';
      const last = s.lastSeenUtc ? ` • Seen: ${toLocal(s.lastSeenUtc)}` : '';
      const badge = online ? 'ONLINE' : 'OFFLINE';
      return {
        id: s.id,
        label: `${badge} • ${name} (${host})${os}${last}`,
      };
    });
  }, [servers]);

  return (
    <div className={`input-group ${className}`} style={{ margin: 0, minWidth }}>
      <label style={{ marginBottom: 6, display: 'block', fontSize: 13, opacity: 0.9 }}>{label}</label>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {selected ? <span style={statusDotStyle(selected.isOnline)} /> : null}

        <select
          value={selectedServerId}
          onChange={onSelect}
          disabled={disabled || loading}
          style={{
            flex: 1,
            padding: '0.55rem 0.7rem',
            borderRadius: 10,
            border: '1px solid rgba(148,163,184,0.28)',
            background: 'rgba(2,6,23,0.55)',
            color: '#e5e7eb',
            outline: 'none',
          }}
        >
          {showAllOption && (
            <option value="all">All Agents</option>
          )}
          {!showAllOption && (
            <option value="" disabled>
              Select a server…
            </option>
          )}
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>

        {showRefresh ? (
          <button
            type="button"
            className="btn btn-muted btn-icon"
            onClick={() => fetchServers()}
            disabled={disabled || loading}
            title="Refresh server list"
          >
            {loading ? '…' : '↻'}
          </button>
        ) : null}
      </div>

      {err ? <div className="small" style={{ color: '#fdba74', marginTop: 6 }}>{err}</div> : null}
    </div>
  );
};

export default ServerSelect;