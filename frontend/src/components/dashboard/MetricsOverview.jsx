// src/components/dashboard/MetricsOverview.jsx
import React, { useState } from 'react';
import {
  ResponsiveContainer,
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  RadialBarChart, RadialBar, PolarAngleAxis,
  AreaChart, Area,
  BarChart, Bar,
} from 'recharts';

/* ---------- Dark tooltip (label line is visible) ---------- */
const DarkTooltip = ({ active, payload, label }) => {
  if (!active || !payload || !payload.length) return null;

  return (
    <div
      style={{
        background: '#020617',
        border: '1px solid #1f2937',
        borderRadius: 8,
        padding: '8px 10px',
        color: '#e5e7eb',
        fontSize: 12,
      }}
    >
      <div style={{ marginBottom: 4, color: '#9ca3af' }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.stroke || p.fill || '#e5e7eb' }}>
          {p.name}: <strong>{p.value}</strong>
        </div>
      ))}
    </div>
  );
};

/* ---------- Helpers ---------- */
const fmt = (n, digits = 2) => {
  if (typeof n !== 'number' || Number.isNaN(n)) return '—';
  return n.toFixed(digits);
};

const humanUptime = (sec) => {
  if (typeof sec !== 'number' || Number.isNaN(sec)) return '—';
  const s = Math.max(0, Math.floor(sec));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
};

const pickPrimaryIface = (ifs) => {
  const list = Array.isArray(ifs) ? ifs : [];
  const eth0 = list.find((x) => x.name === 'eth0');
  if (eth0) return eth0;
  const withIpv4 = list.find((x) => x.ipv4);
  if (withIpv4) return withIpv4;
  const nonLo = list.find((x) => x.name && x.name !== 'lo');
  if (nonLo) return nonLo;
  return list[0] || null;
};

/* ---------- Gauge ---------- */
const Gauge = ({ label, value, fill }) => {
  const v = Number(value) || 0;
  const data = [{ name: label, value: v }];

  return (
    <div style={{ position: 'relative', height: 220 }}>
      <ResponsiveContainer width="100%" height="100%">
        <RadialBarChart data={data} innerRadius="70%" outerRadius="100%" startAngle={180} endAngle={0}>
          <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
          <RadialBar dataKey="value" fill={fill} background={{ fill: '#1f2937' }} cornerRadius={10} />
        </RadialBarChart>
      </ResponsiveContainer>

      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          pointerEvents: 'none',
        }}
      >
        <div style={{ fontSize: 14, color: '#9ca3af' }}>{label}</div>
        <div style={{ fontSize: 28, fontWeight: 700, color: '#e5e7eb' }}>
          {v.toFixed(1)}%
        </div>
      </div>
    </div>
  );
};


const autoSpeedMax = (v) => {
  const n = Number(v) || 0;
  if (n <= 1) return 1;
  if (n <= 10) return 10;
  if (n <= 100) return 100;
  if (n <= 1000) return 1000;
  return Math.ceil(n / 1000) * 1000;
};

const SpeedGauge = ({ label, value, max }) => {
  const v = Math.max(0, Number(value) || 0);
  const m = max || autoSpeedMax(v);
  const pct = m > 0 ? Math.min(100, (v / m) * 100) : 0;
  const data = [{ name: label, value: pct }];

  return (
    <div className="mini-speed-gauge" title={`${label}: ${fmt(v, 2)} Mbps`}>
      <div className="mini-speed-gauge__wrap">
        <div className="mini-speed-gauge__chart">
          <ResponsiveContainer width="100%" height="100%">
            <RadialBarChart
              data={data}
              innerRadius="70%"
              outerRadius="100%"
              startAngle={180}
              endAngle={0}
            >
              <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
              <RadialBar dataKey="value" background cornerRadius={10} />
            </RadialBarChart>
          </ResponsiveContainer>
        </div>

        <div className="mini-speed-gauge__center">
          <div className="mini-speed-gauge__value">{fmt(v, 2)}</div>
          <div className="mini-speed-gauge__unit">Mbps</div>
        </div>
      </div>

      <div className="mini-speed-gauge__labelBelow">{label}</div>
    </div>
  );
};

const MetricsOverview = ({ metrics, history }) => {
  const last = metrics;
  if (!last) return <div>No metrics yet. Select a server to start streaming.</div>;

  const ts = last.timestampMs || last.timestamp || Date.now();
  const tsLabel = new Date(ts).toLocaleString();

  const primaryIface = pickPrimaryIface(last.networkInterfaces);

  // History -> timeseries
  const h = Array.isArray(history) ? history : [];
  const series = h.map((m) => {
    const t = m.timestampMs || m.timestamp || Date.now();
    const time = new Date(t).toLocaleTimeString();

    const ifs = Array.isArray(m.networkInterfaces) ? m.networkInterfaces : [];
    const filtered = ifs.filter((x) => x.name && x.name !== 'lo');

    const upTotal = filtered.reduce((acc, x) => acc + (Number(x.uploadSpeedMbps) || 0), 0);
    const downTotal = filtered.reduce((acc, x) => acc + (Number(x.downloadSpeedMbps) || 0), 0);

    const nl = m.normalizedLoad || {};
    const load1 = Number(nl["1m"]) || 0;
    const load5 = Number(nl["5m"]) || 0;
    const load15 = Number(nl["15m"]) || 0;

    return {
      time,
      cpu: Number(m.cpuUsagePercent) || 0,
      ram: Number(m.ramUsagePercent) || 0,
      upTotal: Number(upTotal.toFixed(3)),
      downTotal: Number(downTotal.toFixed(3)),
      load1,
      load5,
      load15,
      read: Number(m.diskReadSpeedMBps) || 0,
      write: Number(m.diskWriteSpeedMBps) || 0,
    };
  });

  // Disk list: payload.diskUsage OR normalized diskPartitions
  const disksRaw = Array.isArray(last.diskUsage) ? last.diskUsage : [];
  const disks = disksRaw.length
    ? disksRaw
    : (Array.isArray(last.diskPartitions) ? last.diskPartitions.map((p) => ({
        device: p.device,
        mountpoint: p.mountPoint,
        fstype: p.fsType,
        totalGB: p.totalGb,
        usedGB: p.usedGb,
        usagePercent: p.usagePercent,
      })) : []);

  const diskPercentBars = disks.map((d) => ({
    mount: d.mountpoint,
    usagePercent: Number(d.usagePercent) || 0,
  }));

  const nlLast = last.normalizedLoad || {};

  return (
    <div className="metrics-grid">
      {/* CPU */}
      <section className="metric-card">
        <h2>CPU</h2>
        <p className="metric-subtitle">Last updated: {tsLabel}</p>
        <Gauge label="CPU" value={last.cpuUsagePercent} fill="#22c55e" />
        <p className="metric-subtitle">
          Load: {fmt(Number(nlLast["1m"]), 2)} / {fmt(Number(nlLast["5m"]), 2)} / {fmt(Number(nlLast["15m"]), 2)}
        </p>
      </section>

      {/* RAM */}
      <section className="metric-card">
        <h2>RAM</h2>
        <p className="metric-subtitle">Used: {fmt(last.ramUsedGB ?? last.ramUsedGb, 2)} GB</p>
        <Gauge label="RAM" value={last.ramUsagePercent} fill="#3b82f6" />
      </section>

{/* Network snapshot */}
      <section className="metric-card">
        <h2>Network</h2>
        {primaryIface ? (
          <>
            <p className="metric-subtitle">Primary: {primaryIface.name}</p>
            {/* Speed gauges side by side */}
            <div style={{ display: 'flex', gap: 20, justifyContent: 'center', marginTop: 10 }}>
              <div style={{ position: 'relative', height: 140, flex: 1 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <RadialBarChart 
                    data={[{ name: 'Download', value: Math.min(100, (primaryIface.downloadSpeedMbps || 0) * 10) }]} 
                    innerRadius="70%" 
                    outerRadius="100%" 
                    startAngle={180} 
                    endAngle={0}
                  >
                    <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
                    <RadialBar dataKey="value" fill="#3b82f6" background={{ fill: '#1f2937' }} cornerRadius={10} />
                  </RadialBarChart>
                </ResponsiveContainer>
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexDirection: 'column',
                    pointerEvents: 'none',
                  }}
                >
                  <div style={{ fontSize: 11, color: '#9ca3af' }}>Download</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: '#e5e7eb' }}>
                    {fmt(primaryIface.downloadSpeedMbps, 2)}
                  </div>
                  <div style={{ fontSize: 10, color: '#9ca3af' }}>Mbps</div>
                </div>
              </div>
              
              <div style={{ position: 'relative', height: 140, flex: 1 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <RadialBarChart 
                    data={[{ name: 'Upload', value: Math.min(100, (primaryIface.uploadSpeedMbps || 0) * 10) }]} 
                    innerRadius="70%" 
                    outerRadius="100%" 
                    startAngle={180} 
                    endAngle={0}
                  >
                    <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
                    <RadialBar dataKey="value" fill="#f59e0b" background={{ fill: '#1f2937' }} cornerRadius={10} />
                  </RadialBarChart>
                </ResponsiveContainer>
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexDirection: 'column',
                    pointerEvents: 'none',
                  }}
                >
                  <div style={{ fontSize: 11, color: '#9ca3af' }}>Upload</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: '#e5e7eb' }}>
                    {fmt(primaryIface.uploadSpeedMbps, 2)}
                  </div>
                  <div style={{ fontSize: 10, color: '#9ca3af' }}>Mbps</div>
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
              <span className="badge badge-muted">IPv4: {primaryIface.ipv4 || '—'}</span>
              <span className="badge badge-muted">IPv6: {primaryIface.ipv6 || '—'}</span>
            </div>
          </>
        ) : (
          <p>No network interface data.</p>
        )}
      </section>

{/* Uptime */}
      <section className="metric-card">
        <h2>Uptime</h2>
        <p className="metric-subtitle">System uptime</p>
        <div className="metric-value">{humanUptime(last.uptimeSeconds)}</div>

        <div style={{ marginTop: 12 }}>
          <div className="metric-subtitle">Disk IO (MB/s)</div>
          <div style={{ display: 'flex', gap: 12, marginTop: 6, flexWrap: 'wrap' }}>
            <span className="badge badge-muted">Read: {fmt(last.diskReadSpeedMBps, 2)}</span>
            <span className="badge badge-muted">Write: {fmt(last.diskWriteSpeedMBps, 2)}</span>
          </div>
        </div>
      </section>

      {/* Disk usage percent per mount */}
      <section className="metric-card">
        <h2>Disk Usage %</h2>
        {diskPercentBars.length ? (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={diskPercentBars}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="mount" />
              <YAxis domain={[0, 100]} unit="%" />
              <Tooltip content={<DarkTooltip />} />
              <Legend />
              <Bar dataKey="usagePercent" name="Usage %" fill="#f59e0b" />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p>No disk data</p>
        )}
      </section>

      
      {/* CPU/RAM history */}
      <section className="metric-card full-span">
        <h2>CPU / RAM History</h2>
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={series}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="time" />
            <YAxis unit="%" domain={[0, 100]} />
            <Tooltip content={<DarkTooltip />} />
            <Legend />
            <Line type="monotone" dataKey="cpu" name="CPU %" stroke="#22c55e" dot={false} />
            <Line type="monotone" dataKey="ram" name="RAM %" stroke="#3b82f6" dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </section>

      {/* Network total history */}
      <section className="metric-card full-span">
        <h2>Network Total (excluding lo)</h2>
        <ResponsiveContainer width="100%" height={320}>
          <AreaChart data={series}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="time" />
            <YAxis />
            <Tooltip content={<DarkTooltip />} />
            <Legend />
            <Area type="monotone" dataKey="downTotal" name="Down Mbps" fill="#60a5fa" stroke="#60a5fa" />
            <Area type="monotone" dataKey="upTotal" name="Up Mbps" fill="#34d399" stroke="#34d399" />
          </AreaChart>
        </ResponsiveContainer>
      </section>

      {/* Disk IO history */}
      <section className="metric-card full-span">
        <h2>Disk IO History</h2>
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={series}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="time" />
            <YAxis />
            <Tooltip content={<DarkTooltip />} />
            <Legend />
            <Line type="monotone" dataKey="read" name="Read MB/s" stroke="#f59e0b" dot={false} />
            <Line type="monotone" dataKey="write" name="Write MB/s" stroke="#10b981" dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </section>

      {/* Load history (separate mini charts to avoid confusion) */}
      <section className="metric-card full-span">
        <h2>Load Average Trends</h2>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 12,
          }}
        >
          {/* 1m */}
          <div
            style={{
              border: '1px solid #1f2937',
              borderRadius: 12,
              background: '#0b1220',
              padding: 10,
              minHeight: 190,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
              <div style={{ fontWeight: 650 }}>1m</div>
              <span className="badge badge-muted">Now: {fmt(Number(nlLast["1m"]) || 0, 2)}</span>
            </div>
            <div style={{ marginTop: 8, height: 140 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={series}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="time" hide />
                  <YAxis width={28} />
                  <Tooltip content={<DarkTooltip />} />
                  <Line type="monotone" dataKey="load1" name="1m" stroke="#f59e0b" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 5m */}
          <div
            style={{
              border: '1px solid #1f2937',
              borderRadius: 12,
              background: '#0b1220',
              padding: 10,
              minHeight: 190,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
              <div style={{ fontWeight: 650 }}>5m</div>
              <span className="badge badge-muted">Now: {fmt(Number(nlLast["5m"]) || 0, 2)}</span>
            </div>
            <div style={{ marginTop: 8, height: 140 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={series}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="time" hide />
                  <YAxis width={28} />
                  <Tooltip content={<DarkTooltip />} />
                  <Line type="monotone" dataKey="load5" name="5m" stroke="#a78bfa" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 15m */}
          <div
            style={{
              border: '1px solid #1f2937',
              borderRadius: 12,
              background: '#0b1220',
              padding: 10,
              minHeight: 190,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
              <div style={{ fontWeight: 650 }}>15m</div>
              <span className="badge badge-muted">Now: {fmt(Number(nlLast["15m"]) || 0, 2)}</span>
            </div>
            <div style={{ marginTop: 8, height: 140 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={series}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="time" hide />
                  <YAxis width={28} />
                  <Tooltip content={<DarkTooltip />} />
                  <Line type="monotone" dataKey="load15" name="15m" stroke="#60a5fa" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="small" style={{ color: '#9ca3af', marginTop: 10 }}>
          1m reacts fastest, 15m is the smoothest average.
        </div>
      </section>

      {/* Disks */}
      <section className="metric-card full-span">
        <h2>Disks</h2>

        {disks.length ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 10, marginTop: 10 }}>
            {disks.map((d) => {
              const usage = Math.max(0, Math.min(100, Number(d.usagePercent) || 0));
              const used = Number(d.usedGB) || 0;
              const total = Number(d.totalGB) || 0;

              return (
                <div
                  key={`${d.device}-${d.mountpoint}`}
                  style={{
                    border: '1px solid #1f2937',
                    borderRadius: 12,
                    padding: 10,
                    background: '#0b1220',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: 10,
                      flexWrap: 'wrap',
                      alignItems: 'flex-start',
                    }}
                  >
                    <div style={{ minWidth: 160 }}>
                      <div style={{ fontWeight: 650, wordBreak: 'break-all' }}>
                        {d.mountpoint}
                      </div>
                      <div style={{ fontSize: 12, color: '#9ca3af', wordBreak: 'break-all' }} title={d.device}>
                        {d.device}
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span className="badge badge-muted">{d.fstype || '—'}</span>
                      <span className="badge badge-info">{fmt(usage, 1)}%</span>
                    </div>
                  </div>

                  <div
                    style={{
                      height: 10,
                      borderRadius: 999,
                      background: '#111827',
                      overflow: 'hidden',
                      marginTop: 10,
                    }}
                    aria-label={`Disk usage bar for ${d.mountpoint}`}
                  >
                    <div
                      style={{
                        height: '100%',
                        width: `${usage}%`,
                        background: '#f59e0b',
                      }}
                    />
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: 10,
                      flexWrap: 'wrap',
                      marginTop: 8,
                      fontSize: 12,
                      color: '#9ca3af',
                    }}
                  >
                    <span>
                      Used:{' '}
                      <span style={{ color: '#e5e7eb', fontWeight: 600 }}>
                        {fmt(used, 2)} GB
                      </span>
                    </span>
                    <span>
                      Total:{' '}
                      <span style={{ color: '#e5e7eb', fontWeight: 600 }}>
                        {fmt(total, 2)} GB
                      </span>
                    </span>
                    <span>
                      Free:{' '}
                      <span style={{ color: '#e5e7eb', fontWeight: 600 }}>
                        {fmt(Math.max(0, total - used), 2)} GB
                      </span>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p>No disk data</p>
        )}
      </section>

      {/* Network interfaces */}
      <section className="metric-card full-span">
        <h2>Network Interfaces</h2>
        {(last.networkInterfaces || []).length ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 12, marginTop: 10 }}>
            {(last.networkInterfaces || []).map((n) => (
              <div
                key={n.name}
                style={{
                  border: '1px solid #1f2937',
                  borderRadius: 12,
                  padding: 14,
                  background: '#0b1220',
                }}
              >
                {/* Interface name and speeds */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div style={{ fontWeight: 650, fontSize: 16, color: '#e5e7eb' }}>
                    {n.name}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <span className="badge" style={{ background: '#3b82f6', color: '#fff', fontSize: 11 }}>
                      ↓ {fmt(n.downloadSpeedMbps, 2)} Mbps
                    </span>
                    <span className="badge" style={{ background: '#f59e0b', color: '#000', fontSize: 11 }}>
                      ↑ {fmt(n.uploadSpeedMbps, 2)} Mbps
                    </span>
                  </div>
                </div>

                {/* IP addresses */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 12, color: '#9ca3af', minWidth: 50 }}>IPv4:</span>
                    <span style={{ fontSize: 13, color: '#e5e7eb', fontFamily: 'monospace' }}>
                      {n.ipv4 || '—'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 12, color: '#9ca3af', minWidth: 50 }}>IPv6:</span>
                    <span 
                      style={{ 
                        fontSize: 12, 
                        color: '#e5e7eb', 
                        fontFamily: 'monospace',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}
                      title={n.ipv6 || '—'}
                    >
                      {n.ipv6 || '—'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 12, color: '#9ca3af', minWidth: 50 }}>MAC:</span>
                    <span style={{ fontSize: 13, color: '#e5e7eb', fontFamily: 'monospace' }}>
                      {n.macAddress || n.mac || '—'}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p>No network interfaces</p>
        )}
      </section>

      
      
    </div>
  );
};

export default MetricsOverview;