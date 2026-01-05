// src/components/services/ServiceList.jsx
import React, { useMemo, useState } from 'react';

const EMPTY = [];

const getServiceName = (s) => s?.name || s?.serviceName || s?.unitName || '';
const norm = (v) => String(v || '').toLowerCase().trim();
const watchKey = (name) => norm(String(name || '').replace(/\.service$/i, ''));

const chipToneClass = (key) => {
  switch (key) {
    case 'active':
      return 'chip-tone chip-green';
    case 'inactive':
      return 'chip-tone chip-amber';
    case 'failed':
      return 'chip-tone chip-red';
    case 'unknown':
      return 'chip-tone chip-gray';
    default:
      return 'chip-tone';
  }
};

const ServiceList = (props) => {
  // Backward/forward compatible props
  const {
    services,
    loading,
    onSelect,
    selectedServiceName,
    watchedServices,
    onToggleWatch,
    watchBusyName,
    selected: selectedProp,
  } = props;

  const selected = selectedServiceName ?? selectedProp ?? null;

  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // all | active | inactive
  const [runningFilter, setRunningFilter] = useState('all'); // all | running | exited
  const [watchFilter, setWatchFilter] = useState('all'); // all | watched | unwatched

  // ✅ Fix eslint warning: keep list reference stable via useMemo
  const list = useMemo(() => (Array.isArray(services) ? services : EMPTY), [services]);

  const counts = useMemo(() => {
    const c = { 
      all: list.length, 
      active: 0, 
      inactive: 0,
      running: 0,
      exited: 0,
      watched: 0,
      unwatched: 0
    };
    for (const s of list) {
      const a = norm(s?.activeState);
      const sub = norm(s?.subState);
      const wk = watchKey(getServiceName(s));
      const isWatched = !!watchedServices?.has?.(wk);
      
      // Status counts (group failed/unknown with inactive)
      if (a === 'active') c.active += 1;
      else c.inactive += 1;
      
      // Running counts
      if (sub === 'running') c.running += 1;
      else c.exited += 1;
      
      // Watch counts
      if (isWatched) c.watched += 1;
      else c.unwatched += 1;
    }
    return c;
  }, [list, watchedServices]);

  const selectedObj = useMemo(() => {
    if (!selected) return null;
    return list.find((s) => getServiceName(s) === selected) || null;
  }, [list, selected]);

  const filtered = useMemo(() => {
    const query = norm(q);

    return list.filter((s) => {
      const name = norm(getServiceName(s));
      const active = norm(s?.activeState);
      const sub = norm(s?.subState);
      const wk = watchKey(getServiceName(s));
      const isWatched = !!watchedServices?.has?.(wk);

      // Status filter (inactive includes failed/unknown)
      if (statusFilter !== 'all') {
        if (statusFilter === 'active' && active !== 'active') return false;
        if (statusFilter === 'inactive' && active === 'active') return false;
      }

      // Running filter
      if (runningFilter !== 'all') {
        if (runningFilter === 'running' && sub !== 'running') return false;
        if (runningFilter === 'exited' && sub === 'running') return false;
      }

      // Watch filter
      if (watchFilter !== 'all') {
        if (watchFilter === 'watched' && !isWatched) return false;
        if (watchFilter === 'unwatched' && isWatched) return false;
      }

      // Search query
      if (!query) return true;
      return name.includes(query) || active.includes(query) || sub.includes(query);
    });
  }, [list, q, statusFilter, runningFilter, watchFilter, watchedServices]);

  const isSelectedHidden = useMemo(() => {
    if (!selected) return false;
    return !filtered.some((s) => getServiceName(s) === selected);
  }, [filtered, selected]);

  const renderRow = (s, { pinned = false } = {}) => {
    const name = getServiceName(s);
		const wk = watchKey(name);
		const isWatched = !!watchedServices?.has?.(wk);
		const isWatchBusy = !!watchBusyName && watchKey(watchBusyName) === wk;
    const isSelected = selected === name;

    const active = s?.activeState || 'unknown';
    const sub = s?.subState || '';

    const badgeClass =
      active === 'active'
        ? 'badge badge-ok'
        : active === 'inactive'
        ? 'badge badge-warn'
        : active === 'failed'
        ? 'badge badge-bad'
        : 'badge badge-muted';

    return (
      <li
        key={`${pinned ? 'pinned-' : ''}${name}`}
        className={`service-item ${isSelected ? 'selected' : ''} ${pinned ? 'pinned' : ''}`}
        onClick={() => onSelect?.(name)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') onSelect?.(name);
        }}
        title={name}
      >
        <span className="service-name">
          {pinned ? <span className="pinned-pill">PINNED</span> : null}
          {name}
        </span>

			<span className="service-status">
				{onToggleWatch ? (
					<button
						type="button"
						className={`btn ${isWatched ? 'btn-primary' : 'btn-muted'}`}
						style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', lineHeight: 1.1, whiteSpace: 'nowrap' }}
						disabled={isWatchBusy}
						onClick={(e) => {
							e.stopPropagation();
							onToggleWatch(name);
						}}
						title={isWatched ? 'Remove from watchlist' : 'Add to watchlist'}
					>
						{isWatchBusy ? '…' : isWatched ? '✓ Watched' : 'Watch'}
					</button>
				) : null}
          <span className={badgeClass}>{active}</span>
          {sub ? <span className="badge badge-muted">{sub}</span> : null}
        </span>
      </li>
    );
  };

  return (
    <div className="service-list">
      <div className="list-header services-list-header">
        <div className="list-title">
          <h2 style={{ margin: 0 }}>Services</h2>
          <div className="muted" style={{ marginTop: 2 }}>
            {loading ? 'Loading…' : `${filtered.length} / ${list.length} items`}
          </div>
        </div>

        <div className="search-wrap">
          <input
            className="search-input"
            placeholder="Search services…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />

          {q ? (
            <button
              type="button"
              className="btn btn-ghost btn-icon"
              title="Clear"
              onClick={() => setQ('')}
            >
              ✕
            </button>
          ) : (
            <button type="button" className="btn btn-ghost btn-icon" title="Search" disabled>
              🔎
            </button>
          )}
        </div>
      </div>

      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(3, 1fr)', 
        gap: '0.75rem', 
        padding: '0.75rem',
        background: '#2a2a2a',
        borderRadius: '0.5rem',
        marginBottom: '1rem'
      }}>
        <div>
          <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, marginBottom: '0.375rem', color: '#9ca3af', opacity: 0.9 }}>
            WATCH
          </label>
          <select 
            value={watchFilter} 
            onChange={(e) => setWatchFilter(e.target.value)}
            style={{ 
              width: '100%', 
              padding: '0.55rem 0.7rem',
              borderRadius: '10px',
              border: '1px solid rgba(148,163,184,0.28)',
              background: 'rgba(2,6,23,0.55)',
              color: '#e5e7eb',
              fontSize: '0.875rem',
              outline: 'none',
              cursor: 'pointer'
            }}
          >
            <option value="all">All ({counts.all})</option>
            <option value="watched">Watched ({counts.watched})</option>
            <option value="unwatched">Unwatched ({counts.unwatched})</option>
          </select>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, marginBottom: '0.375rem', color: '#9ca3af', opacity: 0.9 }}>
            STATE
          </label>
          <select 
            value={statusFilter} 
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{ 
              width: '100%', 
              padding: '0.55rem 0.7rem',
              borderRadius: '10px',
              border: '1px solid rgba(148,163,184,0.28)',
              background: 'rgba(2,6,23,0.55)',
              color: '#e5e7eb',
              fontSize: '0.875rem',
              outline: 'none',
              cursor: 'pointer'
            }}
          >
            <option value="all">All ({counts.all})</option>
            <option value="active">Active ({counts.active})</option>
            <option value="inactive">Inactive ({counts.inactive})</option>
          </select>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, marginBottom: '0.375rem', color: '#9ca3af', opacity: 0.9 }}>
            SUBSTATE
          </label>
          <select 
            value={runningFilter} 
            onChange={(e) => setRunningFilter(e.target.value)}
            style={{ 
              width: '100%', 
              padding: '0.55rem 0.7rem',
              borderRadius: '10px',
              border: '1px solid rgba(148,163,184,0.28)',
              background: 'rgba(2,6,23,0.55)',
              color: '#e5e7eb',
              fontSize: '0.875rem',
              outline: 'none',
              cursor: 'pointer'
            }}
          >
            <option value="all">All ({counts.all})</option>
            <option value="running">Running ({counts.running})</option>
            <option value="exited">Exited ({counts.exited})</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="muted">Loading services…</div>
      ) : (
        <>
          {isSelectedHidden && selectedObj ? (
            <div className="pinned-block">
              <div className="pinned-title">Selected (Pinned)</div>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {renderRow(selectedObj, { pinned: true })}
              </ul>
              <div className="pinned-hint">
                Selected item is hidden by current filter/search. Clear filters to see it in the list.
              </div>
            </div>
          ) : null}

          {filtered.length ? (
            <ul>{filtered.map((s) => renderRow(s))}</ul>
          ) : (
            <div className="muted">No services found.</div>
          )}
        </>
      )}
    </div>
  );
};

export default ServiceList;
