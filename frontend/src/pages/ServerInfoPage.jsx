// src/pages/ServerInfoPage.jsx
import React, { useEffect, useState } from 'react';
import api from '../api/axiosConfig';
import { useMonitoring } from '../context/MonitoringContext';
import ServerSelect from '../components/common/ServerSelect';

const unwrap = (resData) => {
  if (resData && typeof resData === 'object' && 'status' in resData) {
    if (resData.status !== 'ok') throw new Error(resData.message || 'Server returned error');
    return resData.data;
  }
  return resData;
};

const friendlyError = (err, fallback) => {
  const status = err?.response?.status;
  const msg = err?.response?.data?.message || err?.message || fallback;
  if (status === 503 || String(msg).toLowerCase().includes('not connected')) {
    return 'Server is not connected';
  }
  return msg;
};

const ServerInfoPage = () => {
  const { selectedServerId, setSelectedServerId, ensureSubscribed } = useMonitoring();

  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [pageError, setPageError] = useState(null);

  const load = async () => {
    if (selectedServerId == null) {
      setInfo(null);
      setPageError('Please select a server');
      return;
    }
    try {
      setLoading(true);
      setPageError(null);
      setInfo(null);

      await ensureSubscribed(selectedServerId);

      const res = await api.get(`/api/server/${selectedServerId}/info`);
      const data = unwrap(res.data);
      setInfo(data || null);
    } catch (err) {
      console.error(err);
      setPageError(friendlyError(err, 'Failed to load server info'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedServerId]);

  return (
    <div>
      <div className="page-header">
        <div className="page-header-title-area">
          <h1 className="page-title">
            <span className="page-title-icon">📊</span>
            Server Info
          </h1>
          <p className="page-subtitle">Detailed hardware and software information for your servers</p>
        </div>

        <div className="action-row">
          <ServerSelect label="Server" minWidth={360} value={selectedServerId} onChange={setSelectedServerId} />
          <button type="button" className="btn btn-muted" onClick={load} disabled={loading}>
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </div>

      {pageError && <div className="error-box">{pageError}</div>}

      <div className="info-card">
        {loading ? (
          <p>Loading…</p>
        ) : !info ? (
          <p>No server info data.</p>
        ) : (
          <ul className="kv-list">
            <li>
              <strong>Hostname:</strong> {info.hostname}
            </li>
            <li>
              <strong>IP:</strong> {info.ipAddress}
            </li>
            <li>
              <strong>OS:</strong> {info.os} {info.osVersion}
            </li>
            <li>
              <strong>Kernel:</strong> {info.kernel}
            </li>
            <li>
              <strong>Arch:</strong> {info.architecture}
            </li>
            <li>
              <strong>CPU:</strong> {info.cpuModel}
            </li>
            <li>
              <strong>Cores:</strong> {info.cpuCores}
            </li>
            <li>
              <strong>Threads:</strong> {info.cpuThreads}
            </li>
          </ul>
        )}
      </div>
    </div>
  );
};

export default ServerInfoPage;
