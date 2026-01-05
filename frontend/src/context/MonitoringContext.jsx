// src/context/MonitoringContext.jsx
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import api from '../api/axiosConfig';
import signalRService from '../services/signalRService';
import { useAuth } from './AuthContext';

const MonitoringContext = createContext(null);

const STORAGE_KEY = 'monitoringState:v6';
const SERVERS_KEY = 'serverList:v1';

const safeParse = (s) => {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
};

const clampHistory = (arr, max = 400) => {
  const a = Array.isArray(arr) ? arr : [];
  return a.length > max ? a.slice(a.length - max) : a;
};

const clampWatchlist = (arr, max = 200) => {
  const a = Array.isArray(arr) ? arr : [];
  return a.length > max ? a.slice(a.length - max) : a;
};

const normalizeServerId = (val) => {
  const n = Number(val);
  if (!Number.isFinite(n)) return 1;
  const i = Math.floor(n);
  return i >= 1 ? i : 1;
};

// Allows "no selection" for the server dropdown
const normalizeServerIdOrNull = (val) => {
  if (val === '' || val == null) return null;
  const n = Number(val);
  if (!Number.isFinite(n)) return null;
  const i = Math.floor(n);
  return i >= 1 ? i : null;
};

const toMs = (t) => {
  if (typeof t === 'number') return t;
  const d = new Date(t);
  const ms = d.getTime();
  return Number.isFinite(ms) ? ms : Date.now();
};

const normalizeMetricsEvent = (incoming) => {
  // Accept:
  // 1) payload-only metrics object
  // 2) { type:'event', action:'metrics', payload:{...}, timestamp:<ms> }
  const hasPayload =
    incoming && typeof incoming === 'object' && incoming.payload && typeof incoming.payload === 'object';

  const base = hasPayload ? { ...incoming.payload } : { ...(incoming || {}) };

  const ts =
    (typeof incoming?.timestamp === 'number' && incoming.timestamp) ||
    (typeof base?.timestamp === 'number' && base.timestamp) ||
    (typeof base?.timestampUtc === 'number' && base.timestampUtc) ||
    toMs(base?.timestampUtc) ||
    Date.now();

  base.timestampMs = ts;

  // Backward compatibility field names
  if (base.ramUsedGb == null && base.ramUsedGB != null) base.ramUsedGb = base.ramUsedGB;

  // v2.1 MetricDto fields -> existing UI expectations
  // load1m/load5m/load15m -> normalizedLoad{"1m","5m","15m"}
  if (base.normalizedLoad == null) {
    const hasLoads = base.load1m != null || base.load5m != null || base.load15m != null;
    if (hasLoads) {
      base.normalizedLoad = {
        '1m': Number(base.load1m) || 0,
        '5m': Number(base.load5m) || 0,
        '15m': Number(base.load15m) || 0,
      };
    }
  }

  // diskUsage -> diskPartitions
  if (base.diskPartitions == null && base.diskUsage != null && Array.isArray(base.diskUsage)) {
    base.diskPartitions = base.diskUsage.map((d) => ({
      device: d.device,
      mountPoint: d.mountpoint,
      fsType: d.fstype,
      totalGb: d.totalGB,
      usedGb: d.usedGB,
      usagePercent: d.usagePercent,
    }));
  }

  // Normalize diskPartitions field names when backend returns MetricDto.diskPartitions
  if (Array.isArray(base.diskPartitions)) {
    base.diskPartitions = base.diskPartitions.map((p) => ({
      ...p,
      mountPoint: p.mountPoint ?? p.mountpoint,
      fsType: p.fsType ?? p.fileSystemType ?? p.fstype,
      totalGb: p.totalGb ?? p.totalGB,
      usedGb: p.usedGb ?? p.usedGB,
      usagePercent: p.usagePercent ?? p.usage_percent,
    }));
  }

  return base;
};

const normalizeWatchlistEvent = (incoming) => {
  // Expected:
  // { serverId, timestampUtc, services:[], processes:[] }
  // or wrapped in payload
  const hasPayload =
    incoming && typeof incoming === 'object' && incoming.payload && typeof incoming.payload === 'object';
  const base = hasPayload ? { ...incoming.payload } : { ...(incoming || {}) };

  base.timestampMs = toMs(base.timestampUtc || base.timestamp || base.timestampMs);
  return base;
};

export const MonitoringProvider = ({ children }) => {
  const { token, isAuthenticated } = useAuth();

  const persisted = useMemo(() => {
    if (!isAuthenticated) return {};
    const data = safeParse(sessionStorage.getItem(STORAGE_KEY)) || {};
    // Clear stale subscription state older than 5 minutes
    const age = Date.now() - (data.persistedAt || 0);
    if (age > 5 * 60 * 1000) {
      return { selectedServerId: data.selectedServerId }; // Keep server selection only
    }
    return data;
  }, [isAuthenticated]);
  
  const persistedServers = useMemo(() => safeParse(sessionStorage.getItem(SERVERS_KEY)) || {}, []);

  // Selected server
  const [selectedServerId, _setSelectedServerId] = useState(
    normalizeServerIdOrNull(persisted.selectedServerId ?? null)
  );

  // Track which serverId we are actually subscribed to (single active server).
  const [subscribedServerId, setSubscribedServerId] = useState(null);
  const [isSubscribed, setIsSubscribed] = useState(false);

  // Metrics
  const [metrics, setMetrics] = useState(persisted.metrics ?? null);
  const [history, setHistory] = useState(clampHistory(persisted.history ?? [], 400));

  // Watchlist
  const [watchlistMetrics, setWatchlistMetrics] = useState(persisted.watchlistMetrics ?? null);
  const [watchlistHistory, setWatchlistHistory] = useState(clampWatchlist(persisted.watchlistHistory ?? [], 200));

  // Command events (optional)
  const [lastCommandEvent, setLastCommandEvent] = useState(persisted.lastCommandEvent ?? null);

  // Connection / loading
  const [connecting, setConnecting] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  const [lastError, setLastError] = useState(null);

  // In-flight subscription ...
  const subscribeInFlightRef = useRef(null);
  const autoSwitchRef = useRef(false);
  
  // Track subscription state in refs to avoid infinite loops in useEffect
  const isSubscribedRef = useRef(false);
  const subscribedServerIdRef = useRef(null);

  // ✅ Server list for dropdown
  const [servers, setServers] = useState(Array.isArray(persistedServers.list) ? persistedServers.list : []);
  const [serversLoading, setServersLoading] = useState(false);
  const [serversError, setServersError] = useState(null);

  const setSelectedServerId = (val) => {
    const sid = normalizeServerIdOrNull(val);
    _setSelectedServerId(sid);
  };

  // persist monitoring state
  useEffect(() => {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        selectedServerId,
        subscribedServerId,
        isSubscribed,
        metrics,
        history: clampHistory(history, 400),
        watchlistMetrics,
        watchlistHistory: clampWatchlist(watchlistHistory, 200),
        lastCommandEvent,
        persistedAt: Date.now(), // Add timestamp for staleness check
      })
    );
  }, [selectedServerId, subscribedServerId, isSubscribed, metrics, history, watchlistMetrics, watchlistHistory, lastCommandEvent]);

  // persist servers list
  useEffect(() => {
    sessionStorage.setItem(SERVERS_KEY, JSON.stringify({ list: servers, fetchedAt: Date.now() }));
  }, [servers]);

  // ✅ Fetch server list (new endpoint)
  const refreshServers = async () => {
    if (!token || !isAuthenticated) return;

    setServersLoading(true);
    setServersError(null);

    try {
      const res = await api.get('/api/server');
      const list = res?.data;

      if (!Array.isArray(list)) throw new Error('Server list format unexpected');

      setServers(list);

      // Auto-select first server if no server is currently selected
      if (selectedServerId == null && list.length > 0) {
        _setSelectedServerId(list[0].id);
      }
      // If current selection is not in list, switch to first server
      else if (
        selectedServerId != null &&
        list.length > 0 &&
        !list.some((s) => Number(s.id) === Number(selectedServerId))
      ) {
        _setSelectedServerId(list[0].id);
      }
    } catch (err) {
      setServersError(err?.response?.data?.message || err?.message || 'Failed to load servers');
      // keep previous servers (don’t break dropdown)
    } finally {
      setServersLoading(false);
    }
  };

  // Auto refresh servers on auth and clear stale subscription state
  useEffect(() => {
    if (!token || !isAuthenticated) {
      // Clear all state when logged out
      setIsSubscribed(false);
      isSubscribedRef.current = false;
      setSubscribedServerId(null);
      subscribedServerIdRef.current = null;
      setMetrics(null);
      setHistory([]);
      setWatchlistMetrics(null);
      setWatchlistHistory([]);
      return;
    }
    
    // Reset subscription state on fresh login to avoid stale state issues
    setIsSubscribed(false);
    isSubscribedRef.current = false;
    setSubscribedServerId(null);
    subscribedServerIdRef.current = null;
    
    if (!token || !isAuthenticated) return;
    refreshServers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, isAuthenticated]);

  // Keep SignalR listeners alive across routes
  useEffect(() => {
    if (!token || !isAuthenticated) return;

    let mounted = true;

    const ensureSignalR = async () => {
      try {
        setConnecting(true);
        setLastError(null);

        // Connect to all hubs if not connected
        if (!signalRService.isMonitoringConnected()) {
          await signalRService.connectMonitoring(token);
        }
        if (!signalRService.isNotificationConnected()) {
          await signalRService.connectNotification(token);
        }

        // Metrics (MonitoringHub)
        signalRService.offMetricsUpdated?.();
        signalRService.onMetricsUpdated?.((data) => {
          if (!mounted) return;
          const normalized = normalizeMetricsEvent(data);
          const evSid = normalized?.monitoredServerId ?? normalized?.serverId ?? normalized?.monitoredServerID;
          if (selectedServerId == null) return;
          if (evSid != null && normalizeServerId(evSid) !== normalizeServerId(selectedServerId)) return;
          setMetrics(normalized);
          setHistory((prev) => clampHistory([...prev, normalized], 400));
        });

        // Watchlist (MonitoringHub)
        signalRService.offWatchlistMetricsUpdated?.();
        signalRService.onWatchlistMetricsUpdated?.((data) => {
          if (!mounted) return;
          if (selectedServerId == null) return;
          const normalized = normalizeWatchlistEvent(data);
          const evSid = normalized?.serverId;
          if (selectedServerId == null) return;
          if (evSid != null && normalizeServerId(evSid) !== normalizeServerId(selectedServerId)) return;
          setWatchlistMetrics(normalized);
          setWatchlistHistory((prev) => clampWatchlist([...prev, normalized], 200));
        });

        // Command events (NotificationHub)
        signalRService.offCommandSuccess?.();
        signalRService.offCommandFailed?.();

        signalRService.onCommandSuccess?.((evt) => {
          if (!mounted) return;
          if (selectedServerId == null) return;
          if (evt?.serverId != null && normalizeServerId(evt.serverId) !== normalizeServerId(selectedServerId)) return;
          setLastCommandEvent({ ...evt, status: 'success' });
        });

        signalRService.onCommandFailed?.((evt) => {
          if (!mounted) return;
          if (selectedServerId == null) return;
          if (evt?.serverId != null && normalizeServerId(evt.serverId) !== normalizeServerId(selectedServerId)) return;
          setLastCommandEvent({ ...evt, status: 'failed' });
        });
      } catch (err) {
        console.error('SignalR connect/listen failed:', err);
        if (mounted) setLastError(err?.message || 'SignalR error');
      } finally {
        if (mounted) setConnecting(false);
      }
    };

    ensureSignalR();

    return () => {
      mounted = false;
      signalRService.offMetricsUpdated?.();
      signalRService.offWatchlistMetricsUpdated?.();
      signalRService.offCommandSuccess?.();
      signalRService.offCommandFailed?.();
    };
  }, [token, isAuthenticated, selectedServerId]);

  // Subscribe: supports recentMetrics response (v2.1+)
  const subscribe = async (serverIdRaw) => {
    if (serverIdRaw == null || serverIdRaw === '') throw new Error('Please select a server');
    if (!token) throw new Error('No auth token');
    const serverId = normalizeServerId(serverIdRaw);

    // Already subscribed to this server
    if (isSubscribed && subscribedServerId != null && normalizeServerId(subscribedServerId) === serverId) {
      return true;
    }

    // De-dupe concurrent subscribe attempts
    if (subscribeInFlightRef.current && subscribeInFlightRef.current.serverId === serverId) {
      return subscribeInFlightRef.current.promise;
    }

    const run = (async () => {
      try {
        setSubscribing(true);
        setLastError(null);

        // Ensure MonitoringHub is connected
        if (!signalRService.isMonitoringConnected()) {
          await signalRService.connectMonitoring(token);
        }

        // Get MonitoringHub connection ID for subscription
        const connectionId = signalRService.getMonitoringConnectionId();
        if (!connectionId) {
          throw new Error('MonitoringHub connection is not ready (missing connectionId).');
        }

        const res = await api.post(
          `/api/monitoring/subscribe/${serverId}`,
          {},
          { headers: { 'X-SignalR-ConnectionId': connectionId } }
        );

        // NEW: load historical metrics if returned
        const recent = res?.data?.recentMetrics;
        if (Array.isArray(recent) && recent.length > 0) {
          const normalizedArr = recent
            .map((m) => normalizeMetricsEvent(m))
            .sort((a, b) => (a.timestampMs || 0) - (b.timestampMs || 0));

          setHistory(clampHistory(normalizedArr, 400));
          setMetrics(normalizedArr[normalizedArr.length - 1] || null);
        }

        setSubscribedServerId(serverId);
        subscribedServerIdRef.current = serverId;
        setIsSubscribed(true);
        isSubscribedRef.current = true;
        return true;
      } catch (err) {
        console.error('Subscribe failed:', err);
        setIsSubscribed(false);
        isSubscribedRef.current = false;
        setLastError(err?.response?.data?.message || err?.message || 'Subscribe failed');
        throw err;
      } finally {
        setSubscribing(false);
      }
    })();

    subscribeInFlightRef.current = { serverId, promise: run };

    try {
      return await run;
    } finally {
      // Clear only if this is the same promise
      if (subscribeInFlightRef.current && subscribeInFlightRef.current.promise === run) {
        subscribeInFlightRef.current = null;
      }
    }
  };

  const unsubscribeById = async (serverIdRaw) => {
    if (!token) throw new Error('No auth token');
    const sid = normalizeServerId(serverIdRaw);

    try {
      setLastError(null);

      const connected =
        typeof signalRService.isConnected === 'function'
          ? signalRService.isConnected()
          : Boolean(signalRService.isConnected);

      if (!connected) {
        await signalRService.connect(token);
      }

      let connectionId = signalRService.getConnectionId?.();
      if (!connectionId && typeof signalRService.ensureConnectionId === 'function') {
        connectionId = await signalRService.ensureConnectionId(5000);
      }
      if (!connectionId && typeof signalRService.waitForConnectionId === 'function') {
        connectionId = await signalRService.waitForConnectionId(5000);
      }
      if (!connectionId) throw new Error('SignalR connection is not ready (missing connectionId).');

      await api.post(`/api/monitoring/unsubscribe/${sid}`, {}, {
        headers: { 'X-SignalR-ConnectionId': connectionId },
      });

      if (subscribedServerId != null && normalizeServerId(subscribedServerId) === sid) {
        setIsSubscribed(false);
        isSubscribedRef.current = false;
        setSubscribedServerId(null);
        subscribedServerIdRef.current = null;
      }

      return true;
    } catch (err) {
      console.error('Unsubscribe failed:', err);
      setLastError(err?.response?.data?.message || err?.message || 'Unsubscribe failed');
      throw err;
    }
  };

  const unsubscribe = async () => {
    if (subscribedServerId == null) {
      // nothing to do
      setIsSubscribed(false);
      isSubscribedRef.current = false;
      return true;
    }
    const sid = normalizeServerId(subscribedServerId);
    return unsubscribeById(sid);
  };


  // Auto-subscribe: after login, always keep the selected server subscribed.
  // When server changes, unsubscribe the previous server (single active server) and clear cached UI data.
  // NOTE: We use refs to check subscription state to avoid infinite loops from state changes
  useEffect(() => {
    if (!token || !isAuthenticated) return;

    const sid = selectedServerId != null ? normalizeServerId(selectedServerId) : null;

    // No selection yet -> stay idle (Dashboard will show placeholder)
    if (!sid) return;

    // Prevent overlapping switch operations
    if (autoSwitchRef.current) return;

    const run = async () => {
      try {
        autoSwitchRef.current = true;

        // If we are already subscribed to the currently selected server, do nothing.
        // Use refs to check current state to avoid triggering re-renders
        if (isSubscribedRef.current && subscribedServerIdRef.current != null && 
            normalizeServerId(subscribedServerIdRef.current) === sid) {
          return;
        }

        // If we have an active subscription to a different server, unsubscribe it first.
        if (isSubscribedRef.current && subscribedServerIdRef.current != null && 
            normalizeServerId(subscribedServerIdRef.current) !== sid) {
          try {
            await unsubscribeById(subscribedServerIdRef.current);
          } catch (e) {
            // Best-effort; still continue switching
          }

          setIsSubscribed(false);
          isSubscribedRef.current = false;
          setSubscribedServerId(null);
          subscribedServerIdRef.current = null;

          // Clear cached data to avoid mixing servers
          setMetrics(null);
          setHistory([]);
          setWatchlistMetrics(null);
          setWatchlistHistory([]);
          setLastCommandEvent(null);
        }

        // Subscribe to selected server
        await subscribe(sid);
      } catch (e) {
        // Error already reflected via lastError in subscribe/unsubscribe
      } finally {
        autoSwitchRef.current = false;
      }
    };

    run();
    // Only depend on token, isAuthenticated, and selectedServerId
    // Do NOT include isSubscribed or subscribedServerId to avoid infinite loops
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, isAuthenticated, selectedServerId]);

  const ensureSubscribed = async (serverIdRaw = selectedServerId) => {
    const sid = normalizeServerId(serverIdRaw);
    if (isSubscribed && subscribedServerId != null && normalizeServerId(subscribedServerId) === sid) return true;
    return subscribe(sid);
  };

  const clearHistory = () => setHistory([]);
  const clearWatchlistHistory = () => setWatchlistHistory([]);

  const value = {
    // server list
    servers,
    serversLoading,
    serversError,
    refreshServers,

    // selection / subscription
    selectedServerId,
    setSelectedServerId,
    subscribedServerId,
    isSubscribed,
    subscribe,
    unsubscribe,
    ensureSubscribed,

    // metrics
    metrics,
    history,
    clearHistory,

    // watchlist
    watchlistMetrics,
    watchlistHistory,
    clearWatchlistHistory,

    // command
    lastCommandEvent,

    // status
    connecting,
    subscribing,
    lastError,
  };

  return <MonitoringContext.Provider value={value}>{children}</MonitoringContext.Provider>;
};

export const useMonitoring = () => useContext(MonitoringContext);
