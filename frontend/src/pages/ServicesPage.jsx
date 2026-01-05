// src/pages/ServicesPage.jsx
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../api/axiosConfig';
import { useMonitoring } from '../context/MonitoringContext';
import signalRService from '../services/signalRService';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import ServiceList from '../components/services/ServiceList';
import ServiceDetail from '../components/services/ServiceDetail';
import ServerSelect from '../components/common/ServerSelect';

const unwrap = (resData) => {
  if (resData && typeof resData === 'object' && 'status' in resData) {
    if (resData.status !== 'ok') throw new Error(resData.message || 'Server returned error');
    return resData.data;
  }
  return resData;
};

const friendlyMessage = (err, fallback = 'Failed') => {
  const status = err?.response?.status;
  const msg = err?.response?.data?.message || err?.message || fallback;
  if (status === 503 || /not\s*connected/i.test(String(msg))) return 'Server is not connected';
  return String(msg);
};

const ServicesPage = () => {
  const { token } = useAuth();
  const { selectedServerId, setSelectedServerId, ensureSubscribed } = useMonitoring();
  const toast = useToast();

  const [pageError, setPageError] = useState('');
  const [pageNotice, setPageNotice] = useState('');

  const [services, setServices] = useState([]);
  const [selectedName, setSelectedName] = useState(null);
  const [details, setDetails] = useState(null);
  const [logs, setLogs] = useState([]);

  // Watchlist (simple Watch / Watched toggle)
  const [watchlistConfig, setWatchlistConfig] = useState({ services: [], processes: [] });
  const [watchBusyName, setWatchBusyName] = useState(null);

  const [loadingServices, setLoadingServices] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [restarting, setRestarting] = useState(false);

  // For removing from watchlist
  const [removingFromWatchlist, setRemovingFromWatchlist] = useState(null);

  const normalizeServiceKey = useCallback((name) => {
    // Some backends may return "nginx" while service lists may show "nginx.service".
    // Normalize to keep the Watch toggle stable.
    return String(name || '')
      .trim()
      .replace(/\.service$/i, '')
      .toLowerCase();
  }, []);

  const loadWatchlistConfig = useCallback(
    async (serverId = selectedServerId) => {
      if (!token || !serverId) {
        setWatchlistConfig({ services: [], processes: [] });
        return;
      }

      try {
        const res = await api.get(`/api/servers/${serverId}/watchlist`);
        const data = unwrap(res.data) || {};
        setWatchlistConfig({
          services: Array.isArray(data.services) ? data.services : [],
          processes: Array.isArray(data.processes) ? data.processes : [],
        });
      } catch (err) {
        // Keep this silent to avoid noisy UI on page load.
        // (Errors are surfaced on user-triggered actions.)
      }
    },
    [selectedServerId, token]
  );

  const watchedServices = useMemo(() => {
    const set = new Set();
    (watchlistConfig.services || []).forEach((s) => {
      const k = normalizeServiceKey(s);
      if (k) set.add(k);
    });
    return set;
  }, [watchlistConfig.services, normalizeServiceKey]);

  const toggleServiceWatch = useCallback(
    async (serviceName) => {
      const serverId = selectedServerId;
      if (!token || !serverId) {
        setPageError('Select a server first');
        return;
      }
      const key = normalizeServiceKey(serviceName);
      const isWatched = key ? watchedServices.has(key) : false;

      try {
        setPageError('');
        setPageNotice('');
        setWatchBusyName(serviceName);

        if (isWatched) {
          await api.delete(`/api/servers/${serverId}/watchlist/services`, {
            data: { serviceName }
          });
          toast.success('Removed from watchlist');
        } else {
          await api.post(`/api/servers/${serverId}/watchlist/services`, {
            serviceName
          });
          toast.success('Added to watchlist');
        }

        // Optimistic update so the UI reflects the change instantly
        setWatchlistConfig((prev) => {
          const prevServices = Array.isArray(prev?.services) ? prev.services : [];
          if (!key) return prev;
          if (isWatched) {
            return {
              ...prev,
              services: prevServices.filter((s) => normalizeServiceKey(s) !== key),
            };
          }
          const exists = prevServices.some((s) => normalizeServiceKey(s) === key);
          return exists ? prev : { ...prev, services: [...prevServices, serviceName] };
        });

        // Also refresh from backend to keep source-of-truth in sync
        loadWatchlistConfig(serverId);
      } catch (err) {
        toast.error(friendlyMessage(err, 'Watch operation failed'));
      } finally {
        setWatchBusyName(null);
      }
    },
    [loadWatchlistConfig, normalizeServiceKey, selectedServerId, token, watchedServices, toast]
  );

  const removeFromWatchlist = useCallback(
    async (serviceName) => {
      const serverId = selectedServerId;
      if (!token || !serverId) {
        setPageError('Select a server first');
        return;
      }

      try {
        setPageError('');
        setRemovingFromWatchlist(serviceName);

        await api.delete(`/api/servers/${serverId}/watchlist/services`, {
          data: { serviceName }
        });

        // Update local state
        setWatchlistConfig((prev) => ({
          ...prev,
          services: prev.services.filter((s) => s !== serviceName),
        }));

        toast.success(`Removed ${serviceName} from watchlist`);
      } catch (err) {
        setPageError(friendlyMessage(err, 'Failed to remove from watchlist'));
        toast.error(friendlyMessage(err, 'Failed to remove from watchlist'));
      } finally {
        setRemovingFromWatchlist(null);
      }
    },
    [selectedServerId, token, toast]
  );

  const loadServices = async () => {
    if (selectedServerId == null) {
      setServices([]);
      setSelectedName(null);
      setDetails(null);
      setLogs([]);
      setPageError('Please select a server');
      return;
    }
    try {
      setLoadingServices(true);
      setPageError('');
      setPageNotice('');

      await ensureSubscribed(selectedServerId);

      const res = await api.get(`/api/servers/${selectedServerId}/services`);
      const data = unwrap(res.data) || [];
      const list = Array.isArray(data) ? data : [];
      setServices(list);

      if (!selectedName && list[0]?.name) setSelectedName(list[0].name);
    } catch (err) {
      console.error(err);
      setPageError(friendlyMessage(err, 'Failed to load services'));
      setServices([]);
      setSelectedName(null);
      setDetails(null);
      setLogs([]);
    } finally {
      setLoadingServices(false);
    }
  };

  const loadDetails = async (name) => {
    if (selectedServerId == null) {
      setSelectedName(null);
      setDetails(null);
      setPageError('Please select a server');
      return;
    }
    if (!name) return;
    try {
      setLoadingDetail(true);
      setPageError('');

      await ensureSubscribed(selectedServerId);

      const res = await api.get(
        `/api/servers/${selectedServerId}/services/${encodeURIComponent(name)}`
      );
      setDetails(unwrap(res.data));
    } catch (err) {
      console.error(err);
      setPageError(friendlyMessage(err, 'Service details failed'));
      setDetails(null);
    } finally {
      setLoadingDetail(false);
    }
  };

  const loadLogs = async (name) => {
    if (selectedServerId == null) {
      setLogs([]);
      setPageError('Please select a server');
      return;
    }
    if (!name) return;
    try {
      setLoadingLogs(true);
      setPageError('');

      await ensureSubscribed(selectedServerId);

      const res = await api.get(
        `/api/servers/${selectedServerId}/services/${encodeURIComponent(name)}/logs`
      );
      const data = unwrap(res.data) || [];
      setLogs(Array.isArray(data) ? data.map((x) => x.log) : []);
    } catch (err) {
      console.error(err);
      setPageError(friendlyMessage(err, 'Service logs failed'));
      setLogs([]);
    } finally {
      setLoadingLogs(false);
    }
  };

  const restart = async () => {
    if (!selectedName) return;

    try {
      setRestarting(true);
      setPageError('');
      setPageNotice('');

      await ensureSubscribed(selectedServerId);

      const res = await api.post(
        `/api/servers/${selectedServerId}/services/${encodeURIComponent(selectedName)}/restart`,
        {}
      );

      // Handle direct response (status 200)
      const data = res.data;
      const message = data?.message || 'Service restarted successfully';
      
      toast.success(message);
      
      // Reload service list and details
      loadServices();
      loadDetails(selectedName);
      
    } catch (err) {
      console.error(err);
      setPageNotice('');
      toast.error(friendlyMessage(err, 'Restart failed'));
    } finally {
      setRestarting(false);
    }
  };

  useEffect(() => {
    loadServices();
    loadWatchlistConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedServerId]);

  useEffect(() => {
    if (selectedName) {
      loadDetails(selectedName);
      setLogs([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedName]);

  return (
    <div>
      <div className="page-header">
        <div className="page-header-title-area">
          <h1 className="page-title">
            <span className="page-title-icon">🔧</span>
            Services
          </h1>
          <p className="page-subtitle">View and control system services across your infrastructure</p>
        </div>

        <div className="action-row">
          <ServerSelect label="Server" minWidth={360} value={selectedServerId} onChange={setSelectedServerId} />
          <button
            type="button"
            className="btn btn-muted"
            onClick={loadServices}
            disabled={loadingServices}
          >
            {loadingServices ? 'Refreshing…' : 'Refresh List'}
          </button>
        </div>
      </div>

      {pageError ? <div className="error-box">{pageError}</div> : null}
      {pageNotice ? <div className="notice">{pageNotice}</div> : null}

      <div className="services-page">
        <ServiceList
          services={services}
          loading={loadingServices}
          selectedServiceName={selectedName}
          onSelect={setSelectedName}
          watchedServices={watchedServices}
          onToggleWatch={toggleServiceWatch}
          watchBusyName={watchBusyName}
        />
        <ServiceDetail
          serverId={selectedServerId}
          service={details}
          logs={logs}
          loadingDetail={loadingDetail}
          loadingLogs={loadingLogs}
          restarting={restarting}
          onRestart={restart}
          onRefreshDetails={() => loadDetails(selectedName)}
          onLoadLogs={() => loadLogs(selectedName)}
        />
      </div>

      {/* Watchlist Section */}
      <div style={{ marginTop: 32, paddingTop: 24, borderTop: '1px solid rgba(148, 163, 184, 0.2)' }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16, color: '#e5e7eb' }}>Watched Services</h2>
        {!selectedServerId ? (
          <div style={{ padding: 16, backgroundColor: 'rgba(2, 6, 23, 0.35)', borderRadius: 8, color: '#9ca3af' }}>
            Select a server to view watched services
          </div>
        ) : watchlistConfig.services.length === 0 ? (
          <div style={{ padding: 16, backgroundColor: 'rgba(2, 6, 23, 0.35)', borderRadius: 8, color: '#9ca3af' }}>
            No services in watchlist. Click the "Watch" button on any service to add it.
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: 12,
            }}
          >
            {watchlistConfig.services.map((serviceName) => (
              <div
                key={serviceName}
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
                <div style={{ color: '#e5e7eb', fontWeight: 500 }}>{serviceName}</div>
                <button
                  type="button"
                  onClick={() => removeFromWatchlist(serviceName)}
                  disabled={removingFromWatchlist === serviceName}
                  style={{
                    padding: '4px 12px',
                    fontSize: 13,
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    color: '#ef4444',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    borderRadius: 6,
                    cursor: removingFromWatchlist === serviceName ? 'not-allowed' : 'pointer',
                    opacity: removingFromWatchlist === serviceName ? 0.5 : 1,
                  }}
                >
                  {removingFromWatchlist === serviceName ? 'Removing...' : 'Remove'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ServicesPage;
