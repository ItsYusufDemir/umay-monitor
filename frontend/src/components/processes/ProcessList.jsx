import React, { useMemo, useState } from 'react';

const EMPTY = [];
const norm = (v) => String(v || '').toLowerCase().trim();

const statusKeyOf = (status) => {
  const s = norm(status);
  if (s === 'running' || s === 'run') return 'running';
  if (s === 'sleeping' || s === 'sleep') return 'sleeping';
  if (s === 'stopped' || s === 'stop') return 'stopped';
  // "idle" is used instead of "zombie" in the UI.
  // If backend still returns "zombie", we treat it as "other".
  if (s === 'idle') return 'idle';
  if (s === 'zombie') return 'other';
  if (!s) return 'other';
  return 'other';
};

const chipToneClass = (key) => {
  // uses existing CSS chip-green / chip-amber / chip-red / chip-gray
  switch (key) {
    case 'running':
      return 'chip-tone chip-green';
    case 'sleeping':
      return 'chip-tone chip-amber';
    case 'stopped':
      return 'chip-tone chip-gray';
    case 'idle':
      return 'chip-tone chip-gray';
    case 'other':
      return 'chip-tone chip-gray';
    default:
      return 'chip-tone';
  }
};

const arrow = (active, dir) => (active ? (dir === 'desc' ? '↓' : '↑') : '');

const ProcessList = ({
  processes,
  loading,
  selectedPid,
  onSelectPid,
  watchedProcesses,
  onToggleWatch,
  watchBusy,
  processCmdlines,
}) => {
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // all | running | sleeping | stopped | idle | other

  // ✅ NEW: sort toggles
  const [sortKey, setSortKey] = useState('cpu'); // cpu | mem | pid | name
  const [sortDir, setSortDir] = useState('desc'); // desc | asc

  const list = useMemo(() => (Array.isArray(processes) ? processes : EMPTY), [processes]);

  const counts = useMemo(() => {
    const c = { all: list.length, running: 0, sleeping: 0, stopped: 0, idle: 0, other: 0 };
    for (const p of list) {
      const raw = norm(p?.status);
      const k = raw === 'zombie' ? 'other' : statusKeyOf(p?.status);
      if (c[k] == null) c.other += 1;
      else c[k] += 1;
    }
    return c;
  }, [list]);

  const selectedObj = useMemo(() => {
    if (!selectedPid) return null;
    return list.find((p) => Number(p.pid) === Number(selectedPid)) || null;
  }, [list, selectedPid]);

  const filtered = useMemo(() => {
    const s = norm(q);

    return list.filter((p) => {
      const pidStr = String(p?.pid ?? '');
      const name = norm(p?.name);
      const user = norm(p?.user);
      const status = norm(p?.status);
      const k = status === 'zombie' ? 'other' : statusKeyOf(p?.status);

      // chip filter
      if (statusFilter !== 'all') {
        if (k !== statusFilter) return false;
      }

      // search
      if (!s) return true;
      return pidStr.includes(s) || name.includes(s) || user.includes(s) || status.includes(s);
    });
  }, [list, q, statusFilter]);

  const isSelectedHidden = useMemo(() => {
    if (!selectedPid) return false;
    return !filtered.some((p) => Number(p.pid) === Number(selectedPid));
  }, [filtered, selectedPid]);

  const toggleSort = (key) => {
    setSortKey((prevKey) => {
      if (prevKey === key) {
        setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
        return prevKey;
      }
      // when the sort key changes: ascending for name is good, descending for others
      setSortDir(key === 'name' ? 'asc' : 'desc');
      return key;
    });
  };

  const view = useMemo(() => {
    const dir = sortDir === 'desc' ? -1 : 1;

    const getNum = (v) => (Number.isFinite(Number(v)) ? Number(v) : -1);
    const getStr = (v) => String(v || '').trim();

    // Use a deterministic collator (English) so sorting isn't affected by Turkish locale edge-cases (I/İ).
    const collator = new Intl.Collator('en', {
      numeric: true,
      sensitivity: 'base',
    });
    const cmpText = (a, b) => collator.compare(a, b);

    // Stable sort: preserve original order for equal items
    const arr = filtered.map((item, idx) => ({ item, idx }));

    arr.sort((A, B) => {
      const a = A.item;
      const b = B.item;
      let av;
      let bv;

      if (sortKey === 'cpu') {
        av = getNum(a?.cpuPercent);
        bv = getNum(b?.cpuPercent);
      } else if (sortKey === 'mem') {
        av = getNum(a?.memoryPercent);
        bv = getNum(b?.memoryPercent);
      } else if (sortKey === 'pid') {
        av = getNum(a?.pid);
        bv = getNum(b?.pid);
      } else if (sortKey === 'name') {
        const as = getStr(a?.name);
        const bs = getStr(b?.name);

        // Push empty names to the bottom
        const aEmpty = !as;
        const bEmpty = !bs;
        if (aEmpty && !bEmpty) return 1;
        if (!aEmpty && bEmpty) return -1;

        const c = cmpText(as, bs);
        if (c !== 0) return c * dir;

        // same name => pid fallback
        return (getNum(a?.pid) - getNum(b?.pid)) * dir;
      } else {
        av = getNum(a?.pid);
        bv = getNum(b?.pid);
      }

      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;

      // tie-breakers
      const ap = getNum(a?.pid);
      const bp = getNum(b?.pid);
      if (ap !== bp) return (ap - bp) * dir;

      const an = getStr(a?.name);
      const bn = getStr(b?.name);
      const cn = cmpText(an, bn);
      if (cn !== 0) return cn;

      // final stable tie-breaker
      return A.idx - B.idx;
    });

    return arr.map((x) => x.item);
  }, [filtered, sortKey, sortDir]);

  const renderRow = (p) => {
    // Use cmdline from processCmdlines (fetched from detail API) for accurate watched status
    const detailCmdline = processCmdlines?.[p.pid] || '';
    const cmdKey = String(detailCmdline || p?.cmdline || '').trim();
    const nameKey = String(p?.name || '').trim();
    const key = cmdKey || nameKey;
    const isWatched = Boolean(
      watchedProcesses?.has?.(cmdKey) || 
      watchedProcesses?.has?.(key) || 
      (nameKey && watchedProcesses?.has?.(nameKey))
    );
    const toggleKey = watchedProcesses?.has?.(cmdKey)
      ? cmdKey
      : watchedProcesses?.has?.(key)
        ? key
        : nameKey && watchedProcesses?.has?.(nameKey)
          ? nameKey
          : cmdKey || key;
    const isBusy = Boolean(
      watchBusy?.[toggleKey] ||
        (key && watchBusy?.[key]) ||
        (cmdKey && watchBusy?.[cmdKey]) ||
        (nameKey && watchBusy?.[nameKey]) ||
        watchBusy?.[`proc:${toggleKey}`] ||
        (key && watchBusy?.[`proc:${key}`]) ||
        (nameKey && watchBusy?.[`proc:${nameKey}`])
    );

    return (
      <tr
        key={p.pid}
        onClick={() => onSelectPid?.(p.pid)}
        className={Number(p.pid) === Number(selectedPid) ? 'row-selected' : ''}
        style={{ cursor: 'pointer' }}
        title={detailCmdline || p?.cmdline || ''}
      >
        <td>{p.pid}</td>
        <td title={p.name}>{p.name}</td>
        <td>{p.user}</td>
        <td>{p.status}</td>
        <td style={{ whiteSpace: 'nowrap' }}>
          {onToggleWatch ? (
            <button
              className={`btn ${isWatched ? 'btn-primary' : 'btn-muted'} btn-watch`}
              disabled={isBusy || !toggleKey}
              onClick={(e) => {
                e.stopPropagation();
                if (!toggleKey) return;
                onToggleWatch(toggleKey, p.pid);
              }}
              title={isWatched ? 'Remove from watchlist' : 'Add to watchlist'}
            >
              {isWatched ? '✓ Watched' : 'Watch'}
            </button>
          ) : null}
        </td>
        <td>{typeof p.cpuPercent === 'number' ? p.cpuPercent.toFixed(1) : '—'}</td>
        <td>{typeof p.memoryPercent === 'number' ? p.memoryPercent.toFixed(2) : '—'}</td>
      </tr>
    );
  };

  return (
    <div className="process-list">
      <div className="list-header processes-list-header">
        <div className="list-title">
          <h2 style={{ margin: 0 }}>Process List</h2>
          <div className="muted" style={{ marginTop: 2 }}>
            {loading ? 'Loading…' : `${view.length} / ${list.length} items`}
          </div>
        </div>

        <div className="search-wrap">
          <input
            className="search-input"
            placeholder="Search pid/name/user/status"
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

      {/* ✅ Status chip filters */}
      <div className="chip-row">
        <button
          type="button"
          className={`chip ${statusFilter === 'all' ? 'chip-active' : ''}`}
          onClick={() => setStatusFilter('all')}
        >
          All <span className="chip-count">{counts.all}</span>
        </button>

        <button
          type="button"
          className={`chip ${chipToneClass('running')} ${statusFilter === 'running' ? 'chip-active' : ''}`}
          onClick={() => setStatusFilter('running')}
        >
          Running <span className="chip-count">{counts.running}</span>
        </button>

        <button
          type="button"
          className={`chip ${chipToneClass('sleeping')} ${statusFilter === 'sleeping' ? 'chip-active' : ''}`}
          onClick={() => setStatusFilter('sleeping')}
        >
          Sleeping <span className="chip-count">{counts.sleeping}</span>
        </button>

        <button
          type="button"
          className={`chip ${chipToneClass('stopped')} ${statusFilter === 'stopped' ? 'chip-active' : ''}`}
          onClick={() => setStatusFilter('stopped')}
        >
          Stopped <span className="chip-count">{counts.stopped}</span>
        </button>

        <button
          type="button"
          className={`chip ${chipToneClass('idle')} ${statusFilter === 'idle' ? 'chip-active' : ''}`}
          onClick={() => setStatusFilter('idle')}
        >
          Idle <span className="chip-count">{counts.idle}</span>
        </button>

        <button
          type="button"
          className={`chip ${chipToneClass('other')} ${statusFilter === 'other' ? 'chip-active' : ''}`}
          onClick={() => setStatusFilter('other')}
        >
          Other <span className="chip-count">{counts.other}</span>
        </button>
      </div>

      {/* ✅ Sort chip toggles */}
      <div className="chip-row" style={{ marginTop: -4 }}>
        <span className="muted" style={{ alignSelf: 'center', fontSize: 12, marginRight: 6 }}>
          Sort:
        </span>

        <button
          type="button"
          className={`chip ${sortKey === 'cpu' ? 'chip-active' : ''}`}
          onClick={() => toggleSort('cpu')}
          title="Sort by CPU"
        >
          CPU {arrow(sortKey === 'cpu', sortDir)}
        </button>

        <button
          type="button"
          className={`chip ${sortKey === 'mem' ? 'chip-active' : ''}`}
          onClick={() => toggleSort('mem')}
          title="Sort by Memory"
        >
          Memory {arrow(sortKey === 'mem', sortDir)}
        </button>

        <button
          type="button"
          className={`chip ${sortKey === 'pid' ? 'chip-active' : ''}`}
          onClick={() => toggleSort('pid')}
          title="Sort by PID"
        >
          PID {arrow(sortKey === 'pid', sortDir)}
        </button>

        <button
          type="button"
          className={`chip ${sortKey === 'name' ? 'chip-active' : ''}`}
          onClick={() => toggleSort('name')}
          title="Sort by Name"
        >
          Name {arrow(sortKey === 'name', sortDir)}
        </button>
      </div>

      {loading && <p className="muted">Loading…</p>}

      {!loading && (
        <>
          {/* ✅ Pinned selected row when hidden by filters/search */}
          {isSelectedHidden && selectedObj ? (
            <div className="pinned-block">
              <div className="pinned-title">Selected (Pinned)</div>

              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th style={{ width: 90 }}>PID</th>
                      <th>Name</th>
                      <th style={{ width: 120 }}>User</th>
                      <th style={{ width: 120 }}>Status</th>
                      <th style={{ width: 130 }} />
                      <th style={{ width: 100 }}>CPU %</th>
                      <th style={{ width: 100 }}>Mem %</th>
                    </tr>
                  </thead>
                  <tbody>{renderRow(selectedObj)}</tbody>
                </table>
              </div>

              <div className="pinned-hint">
                Selected process is hidden by current filter/search. Clear filters to see it in the list.
              </div>
            </div>
          ) : null}

          {view.length === 0 ? (
            <p className="muted">No processes.</p>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ width: 90 }}>PID</th>
                    <th>Name</th>
                    <th style={{ width: 120 }}>User</th>
                    <th style={{ width: 120 }}>Status</th>
                    <th style={{ width: 130 }} />
                    <th style={{ width: 100 }}>CPU %</th>
                    <th style={{ width: 100 }}>Mem %</th>
                  </tr>
                </thead>
                <tbody>{view.map(renderRow)}</tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default ProcessList;
