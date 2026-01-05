// src/pages/NotificationsPage.jsx
import React, { useEffect, useMemo, useState } from 'react';
import api from '../api/axiosConfig';
import signalRService from '../services/signalRService';
import { useAuth } from '../context/AuthContext';
import { useMonitoring } from '../context/MonitoringContext';
import { useToast } from '../context/ToastContext';
import ServerSelect from '../components/common/ServerSelect';
import { stopAlertSound } from '../components/layout/AppLayout';

const severityClass = (sev) => {
  const s = (sev || '').toLowerCase();
  if (s === 'critical') return 'badge-crit';
  if (s === 'warning') return 'badge-warn';
  if (s === 'info') return 'badge-info';
  return 'badge-muted';
};

const getErrMsg = (err, fallback) =>
  err?.response?.data?.message || err?.message || fallback;

const NotificationsPage = () => {
  const { token } = useAuth();
  const { selectedServerId, setSelectedServerId } = useMonitoring();
  const toast = useToast();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Server selection is managed globally by MonitoringContext (dropdown)

  const [markedRead, setMarkedRead] = useState(false);
  const [severity, setSeverity] = useState(''); // Info/Warning/Critical

  const [pageSize, setPageSize] = useState(50);
  const [page, setPage] = useState(1);

  const [alerts, setAlerts] = useState([]);
  const [totalCount, setTotalCount] = useState(null);

  const [selectedIds, setSelectedIds] = useState({});
  const selectedList = useMemo(
    () => Object.keys(selectedIds).filter((k) => selectedIds[k]).map((k) => Number(k)),
    [selectedIds]
  );

  const [rtConnected, setRtConnected] = useState(false);
  const [newWhileFiltered, setNewWhileFiltered] = useState(0);

  const onChangeServer = (sid) => {
    setSelectedServerId(sid);
    setPage(1);
    setNewWhileFiltered(0);
  };

  const loadAlerts = async () => {
    setLoading(true);
    setError('');
    try {
      const params = {
        serverId: selectedServerId || undefined,
        severity: severity ? severity : undefined,
        page,
        pageSize,
      };

      const res = await api.get('/api/alerts', { params });

      setAlerts(Array.isArray(res.data) ? res.data : []);
      // it will be present if headers are CORS-exposed
      const tc = res.headers?.['x-total-count'];
      if (tc != null) setTotalCount(Number(tc));
      else setTotalCount(null);

      setSelectedIds({});
      setNewWhileFiltered(0);
    } catch (err) {
      setError(getErrMsg(err, 'Failed to load alerts'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAlerts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedServerId, markedRead, severity, page, pageSize]);

  // Realtime AlertTriggered (AlertHub)
  useEffect(() => {
    if (!token) return;

    let mounted = true;

    const ensureRealtime = async () => {
      try {
        // Connect to AlertHub if not connected
        if (!signalRService.isAlertConnected()) {
          await signalRService.connectAlert(token);
        }
        if (!mounted) return;
        setRtConnected(true);

        signalRService.offAlertTriggered();

        signalRService.onAlertTriggered((evt) => {
          if (!mounted) return;

          // doc payload -> AlertDto shape
          const a = {
            id: evt.id || evt.alertId,
            createdAtUtc: evt.timestamp || evt.createdAtUtc,
            title: evt.title || '',
            message: evt.message || '',
            severity: evt.severity || 'info',
            isAcknowledged: false,
            acknowledgedAtUtc: null,
            monitoredServerId: evt.serverId || evt.monitoredServerId,
            serverName: evt.serverName || '',
            alertRuleId: evt.ruleId || evt.alertRuleId,
          };

          // Only add to list if we have a valid ID
          if (!a.id) {
            console.warn('Received alert without valid ID:', evt);
            return;
          }

          // Alert sound is played globally by AppLayout

          const matchesServer = Number(selectedServerId) === Number(a.monitoredServerId);
          const matchesSeverity = !severity || String(severity) === String(a.severity);
          const matchesAck = markedRead === false; // new alert is unread

          // Sadece ilk sayfadaysak listeye prepend edelim
          if (matchesServer && matchesSeverity && matchesAck && page === 1) {
            setAlerts((prev) => [a, ...prev]);
          } else {
            setNewWhileFiltered((n) => n + 1);
          }
        });
      } catch (err) {
        console.error('Alert realtime failed:', err);
        if (mounted) setRtConnected(false);
      }
    };

    ensureRealtime();

    return () => {
      mounted = false;
      signalRService.offAlertTriggered();
    };
  }, [token, selectedServerId, severity, markedRead, page]);

  const toggleSelected = (id, checked) => {
    setSelectedIds((prev) => ({ ...prev, [id]: checked }));
  };

  const toggleSelectAll = (checked) => {
    const next = {};
    (alerts || []).forEach((a) => {
      next[a.id] = checked;
    });
    setSelectedIds(next);
  };

  const markOneAsRead = async (id) => {
    setError('');
    try {
      console.log('Calling stopAlertSound from markOneAsRead');
      stopAlertSound();
      await api.post(`/api/alerts/${id}/acknowledge`);
      setAlerts((prev) =>
        prev.map((a) =>
          a.id === id
            ? { ...a, isAcknowledged: true, acknowledgedAtUtc: new Date().toISOString() }
            : a
        )
      );
      toast.success('Alert marked as read');
    } catch (err) {
      toast.error(getErrMsg(err, 'Failed to mark alert as read'));
    }
  };

  const markSelectedAsRead = async () => {
    if (!selectedList.length) return;
    setError('');
    try {
      stopAlertSound();
      await api.post('/api/alerts/acknowledge-batch', { alertIds: selectedList });
      setAlerts((prev) =>
        prev.map((a) =>
          selectedIds[a.id]
            ? { ...a, isAcknowledged: true, acknowledgedAtUtc: new Date().toISOString() }
            : a
        )
      );
      setSelectedIds({});
      toast.success(`Marked ${selectedList.length} alerts as read`);
    } catch (err) {
      toast.error(getErrMsg(err, 'Failed to mark selected as read'));
    }
  };

  const deleteOne = async (id) => {
    setError('');
    try {
      console.log('Calling stopAlertSound from deleteOne');
      stopAlertSound();
      await api.delete(`/api/alerts/${id}`);
      setAlerts((prev) => prev.filter((a) => a.id !== id));
      setSelectedIds((prev) => {
        const n = { ...prev };
        delete n[id];
        return n;
      });
      toast.success('Alert deleted');
    } catch (err) {
      toast.error(getErrMsg(err, 'Failed to delete alert'));
    }
  };

  const deleteRead = async () => {
    setError('');
    try {
      stopAlertSound();
      await api.delete('/api/alerts/acknowledged', {
        params: { serverId: selectedServerId || undefined },
      });
      await loadAlerts();
      toast.success('Read alerts deleted');
    } catch (err) {
      toast.error(getErrMsg(err, 'Failed to delete read alerts'));
    }
  };

  const allChecked = alerts.length > 0 && alerts.every((a) => selectedIds[a.id]);
  const someChecked = alerts.some((a) => selectedIds[a.id]);

  return (
    <div>
      <div className="page-header">
        <div className="page-header-title-area">
          <h1 className="page-title">
            <span className="page-title-icon">🔔</span>
            Notifications
          </h1>
          <p className="page-subtitle">View and manage alert notifications from your servers</p>
        </div>
        <div className="action-row">
          <span className={`badge ${rtConnected ? 'badge-ok' : 'badge-warn'}`}>
            Realtime: {rtConnected ? 'Connected' : 'Disconnected'}
          </span>
          {newWhileFiltered > 0 ? (
            <span className="badge badge-info">{newWhileFiltered} new (refresh)</span>
          ) : null}
        </div>
      </div>

      {error ? <div className="error-box">{error}</div> : null}

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Alert History</h2>

        <div className="form-row">
          <ServerSelect label="Server" value={selectedServerId} onChange={onChangeServer} minWidth={360} />

          <div className="input-group" style={{ minWidth: 220 }}>
            <label>Status</label>
            <select
              value={markedRead ? 'true' : 'false'}
              onChange={(e) => setMarkedRead(e.target.value === 'true')}
            >
              <option value="false">Unread</option>
              <option value="true">Read</option>
            </select>
          </div>

          <div className="input-group" style={{ minWidth: 220 }}>
            <label>Severity</label>
            <select value={severity} onChange={(e) => setSeverity(e.target.value)}>
              <option value="">All</option>
              <option value="Info">Info</option>
              <option value="Warning">Warning</option>
              <option value="Critical">Critical</option>
            </select>
          </div>

          <div className="input-group" style={{ minWidth: 220 }}>
            <label>Page Size</label>
            <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
              <option value="20">20</option>
              <option value="50">50</option>
              <option value="100">100</option>
            </select>
          </div>

          <button className="btn btn-primary" onClick={loadAlerts} disabled={loading}>
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>

        <div className="action-row" style={{ marginTop: 12 }}>
          <button
            className="btn btn-muted"
            onClick={markSelectedAsRead}
            disabled={!selectedList.length}
            title="Select alerts from the list below"
          >
            Mark Selected as Read ({selectedList.length})
          </button>

          <button className="btn btn-danger" onClick={deleteRead}>
            Delete Read Alerts
          </button>

          <div className="small" style={{ marginLeft: 'auto' }}>
            {totalCount != null ? `Total: ${totalCount}` : ''}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: 42 }}>
                  <input
                    type="checkbox"
                    checked={allChecked}
                    ref={(el) => {
                      if (el) el.indeterminate = !allChecked && someChecked;
                    }}
                    onChange={(e) => toggleSelectAll(e.target.checked)}
                  />
                </th>
                <th style={{ width: 110 }}>Severity</th>
                <th style={{ width: 220 }}>Time</th>
                <th>Title</th>
                <th>Message</th>
                <th style={{ width: 140 }}>Status</th>
                <th style={{ width: 220 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {alerts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="small">
                    {loading ? 'Loading…' : 'No alerts found.'}
                  </td>
                </tr>
              ) : (
                alerts.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={!!selectedIds[a.id]}
                        onChange={(e) => toggleSelected(a.id, e.target.checked)}
                      />
                    </td>
                    <td>
                      <span className={`badge ${severityClass(a.severity)}`}>{a.severity}</span>
                    </td>
                    <td className="small">
                      {a.createdAtUtc ? new Date(a.createdAtUtc).toLocaleString() : '—'}
                    </td>
                    <td>{a.title}</td>
                    <td className="small">{a.message}</td>
                    <td>
                      {a.isAcknowledged ? (
                        <span className="badge badge-muted">Read</span>
                      ) : (
                        <span className="badge badge-warn">Unread</span>
                      )}
                    </td>
                    <td>
                      <div className="action-row">
                        {!a.isAcknowledged ? (
                          <button className="btn btn-warning" onClick={() => markOneAsRead(a.id)}>
                            Mark Read
                          </button>
                        ) : (
                          <button className="btn btn-muted" disabled>
                            Read
                          </button>
                        )}
                        <button className="btn btn-danger" onClick={() => deleteOne(a.id)}>
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="action-row" style={{ marginTop: 12 }}>
          <button className="btn" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            Prev
          </button>
          <span className="badge badge-muted">Page: {page}</span>
          <button className="btn" onClick={() => setPage((p) => p + 1)}>
            Next
          </button>
        </div>
      </div>
    </div>
  );
};

export default NotificationsPage;
