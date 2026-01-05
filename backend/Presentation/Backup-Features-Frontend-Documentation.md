# Backup Features - Frontend Integration Guide

**Version:** 1.0  
**Date:** January 3, 2026  
**Backend:** .NET 8 / ASP.NET Core  
**New Features:** Browse Filesystem, Get Snapshots, Integrity Check

---

## Overview

This document describes three new backup-related endpoints added to the backend API. These features enable:

1. **Browse Filesystem** - Navigate agent directories to select backup source paths
2. **Get Backup Snapshots** - Retrieve real Restic snapshots from backup repository
3. **Check Backup Integrity** - Verify backup repository integrity using `restic check`

All endpoints require **JWT authentication** via Bearer token.

---

## Table of Contents

1. [Browse Filesystem](#1-browse-filesystem)
2. [Get Backup Snapshots](#2-get-backup-snapshots)
3. [Check Backup Integrity](#3-check-backup-integrity)
4. [SignalR Events](#4-signalr-events)
5. [Complete React Example](#5-complete-react-example)

---

## 1. Browse Filesystem

### Endpoint

**`POST /api/backups/browse/{agentId}`**

### Description

Navigate the filesystem on a specific agent to select directories for backup. Returns only directories (not files) for security reasons.

### Parameters

| Parameter | Type | Location | Required | Default | Description |
|-----------|------|----------|----------|---------|-------------|
| `agentId` | `int` | Path | ? Yes | - | The ID of the agent to browse |
| `path` | `string` | Body | ? No | `/` | Absolute path to browse (e.g., `/var`, `/home`) |

### Request Headers

```
Authorization: Bearer {jwt_token}
Content-Type: application/json
```

### Request Body

```typescript
interface BrowseFilesystemRequest {
  path: string;  // Default: "/"
}
```

### Example Request

```json
{
  "path": "/var"
}
```

### Response (200 OK)

```typescript
interface BrowseFilesystemResponse {
  currentPath: string;
  parentPath: string;
  items: FileSystemItem[];
}

interface FileSystemItem {
  name: string;
  type: string;  // Always "directory"
  path: string;  // Full absolute path
}
```

### Example Response

```json
{
  "currentPath": "/var",
  "parentPath": "/",
  "items": [
    {
      "name": "www",
      "type": "directory",
      "path": "/var/www"
    },
    {
      "name": "log",
      "type": "directory",
      "path": "/var/log"
    },
    {
      "name": "lib",
      "type": "directory",
      "path": "/var/lib"
    }
  ]
}
```

### Error Responses

| Status | Error | Description |
|--------|-------|-------------|
| `400` | Agent offline | Agent is not connected to backend |
| `401` | Unauthorized | Invalid or missing JWT token |
| `504` | Timeout | Agent did not respond within 10 seconds |
| `500` | Internal error | Server-side error |

### Frontend Example (React)

```tsx
import { useState, useEffect } from 'react';

interface FileSystemItem {
  name: string;
  type: string;
  path: string;
}

interface BrowseResponse {
  currentPath: string;
  parentPath: string;
  items: FileSystemItem[];
}

function FileSystemBrowser({ agentId }: { agentId: number }) {
  const [currentPath, setCurrentPath] = useState('/');
  const [items, setItems] = useState<FileSystemItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const browsePath = async (path: string) => {
    setLoading(true);
    setError(null);

    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch(
        `https://localhost:7287/api/backups/browse/${agentId}`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ path })
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to browse filesystem');
      }

      const data: BrowseResponse = await response.json();
      setCurrentPath(data.currentPath);
      setItems(data.items);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    browsePath('/');
  }, [agentId]);

  return (
    <div className="filesystem-browser">
      <div className="breadcrumb">
        <span>Current Path: {currentPath}</span>
        {currentPath !== '/' && (
          <button onClick={() => browsePath('..')}>?? Parent Directory</button>
        )}
      </div>

      {loading && <p>Loading...</p>}
      {error && <p className="error">{error}</p>}

      <ul className="directory-list">
        {items.map((item) => (
          <li key={item.path} onClick={() => browsePath(item.path)}>
            ?? {item.name}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default FileSystemBrowser;
```

---

## 2. Get Backup Snapshots

### Endpoint

**`GET /api/backups/{id}/snapshots`**

### Description

Retrieves the list of actual Restic snapshots from the backup repository. This replaces the previous placeholder implementation that returned fake snapshots from logs.

### Parameters

| Parameter | Type | Location | Required | Description |
|-----------|------|----------|----------|-------------|
| `id` | `Guid` | Path | ? Yes | The backup job ID |

### Request Headers

```
Authorization: Bearer {jwt_token}
```

### Response (200 OK)

```typescript
interface BackupSnapshot {
  id: string;           // Snapshot short ID
  time: string;         // ISO 8601 timestamp
  hostname: string;     // Server hostname
  paths: string[];      // Backed up paths
  size: number | null;  // Always null (Restic doesn't return size in list)
}

// Response is an array
type GetSnapshotsResponse = BackupSnapshot[];
```

### Example Response

```json
[
  {
    "id": "1fbf7784",
    "time": "2025-12-28T10:30:15Z",
    "hostname": "web-server-01",
    "paths": ["/var/www/html"],
    "size": null
  },
  {
    "id": "a3c5f921",
    "time": "2025-12-27T10:30:12Z",
    "hostname": "web-server-01",
    "paths": ["/var/www/html"],
    "size": null
  }
]
```

### Error Responses

| Status | Error | Description |
|--------|-------|-------------|
| `400` | Job not found / Agent offline | Backup job doesn't exist or agent is offline |
| `401` | Unauthorized | Invalid or missing JWT token |
| `504` | Timeout | Agent did not respond within 30 seconds |
| `500` | Internal error | Repository error or server-side issue |

### Frontend Example (React)

```tsx
import { useState, useEffect } from 'react';

interface BackupSnapshot {
  id: string;
  time: string;
  hostname: string;
  paths: string[];
  size: number | null;
}

function SnapshotList({ jobId }: { jobId: string }) {
  const [snapshots, setSnapshots] = useState<BackupSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadSnapshots = async () => {
    setLoading(true);
    setError(null);

    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch(
        `https://localhost:7287/api/backups/${jobId}/snapshots`,
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to load snapshots');
      }

      const data: BackupSnapshot[] = await response.json();
      setSnapshots(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSnapshots();
  }, [jobId]);

  if (loading) return <p>Loading snapshots...</p>;
  if (error) return <p className="error">{error}</p>;

  return (
    <div className="snapshot-list">
      <h3>Backup Snapshots ({snapshots.length})</h3>
      <button onClick={loadSnapshots}>?? Refresh</button>

      <table>
        <thead>
          <tr>
            <th>Snapshot ID</th>
            <th>Date &amp; Time</th>
            <th>Hostname</th>
            <th>Paths</th>
          </tr>
        </thead>
        <tbody>
          {snapshots.map((snapshot) => (
            <tr key={snapshot.id}>
              <td><code>{snapshot.id}</code></td>
              <td>{new Date(snapshot.time).toLocaleString()}</td>
              <td>{snapshot.hostname}</td>
              <td>{snapshot.paths.join(', ')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default SnapshotList;
```

---

## 3. Check Backup Integrity

### Endpoint

**`POST /api/backups/{id}/integrity-check`**

### Description

Triggers an asynchronous integrity check on the backup repository using `restic check`. Returns immediately with a `taskId` for tracking. The actual result arrives via SignalR event.

### Parameters

| Parameter | Type | Location | Required | Description |
|-----------|------|----------|----------|-------------|
| `id` | `Guid` | Path | ? Yes | The backup job ID |

### Request Headers

```
Authorization: Bearer {jwt_token}
```

### Response (200 OK)

```typescript
interface IntegrityCheckResponse {
  message: string;
  jobId: string;
  taskId: string;  // Use this to track completion via SignalR
}
```

### Example Response

```json
{
  "message": "Integrity check triggered successfully",
  "jobId": "a1b2c3d4-e5f6-7890-1234-567890abcdef",
  "taskId": "9f8e7d6c-5b4a-3210-fedc-ba9876543210"
}
```

### Error Responses

| Status | Error | Description |
|--------|-------|-------------|
| `400` | Job not found / Agent offline | Backup job doesn't exist or agent is offline |
| `401` | Unauthorized | Invalid or missing JWT token |
| `500` | Internal error | Server-side error |

### Frontend Example (React with SignalR)

```tsx
import { useState } from 'react';
import * as signalR from '@microsoft/signalr';

interface IntegrityCheckResult {
  serverId: number;
  jobId: string;
  taskId: string;
  status: string;  // "success" or "error"
  message: string;
  timestamp: string;
}

function IntegrityChecker({ jobId, connection }: { 
  jobId: string; 
  connection: signalR.HubConnection 
}) {
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<IntegrityCheckResult | null>(null);

  const triggerCheck = async () => {
    setChecking(true);
    setResult(null);

    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch(
        `https://localhost:7287/api/backups/${jobId}/integrity-check`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to trigger integrity check');
      }

      const data = await response.json();
      console.log('Integrity check triggered:', data.taskId);
      
      // Result will arrive via SignalR event
    } catch (err: any) {
      alert(err.message);
      setChecking(false);
    }
  };

  // Listen for SignalR completion event
  useEffect(() => {
    const handler = (event: IntegrityCheckResult) => {
      if (event.jobId === jobId) {
        setResult(event);
        setChecking(false);
      }
    };

    connection.on('IntegrityCheckCompleted', handler);

    return () => {
      connection.off('IntegrityCheckCompleted', handler);
    };
  }, [jobId, connection]);

  return (
    <div className="integrity-checker">
      <button onClick={triggerCheck} disabled={checking}>
        {checking ? '? Checking...' : '?? Check Integrity'}
      </button>

      {result && (
        <div className={`result ${result.status}`}>
          <h4>{result.status === 'success' ? '?' : '?'} Integrity Check Result</h4>
          <p>{result.message}</p>
          <small>Completed at: {new Date(result.timestamp).toLocaleString()}</small>
        </div>
      )}
    </div>
  );
}

export default IntegrityChecker;
```

---

## 4. SignalR Events

### IntegrityCheckCompleted

Broadcasted to the server's SignalR group when an integrity check finishes.

**Event Name:** `IntegrityCheckCompleted`

**Payload:**

```typescript
interface IntegrityCheckCompletedEvent {
  serverId: number;
  jobId: string;
  taskId: string;
  status: string;      // "success" or "error"
  message: string;     // "Integrity check passed" or error message
  timestamp: string;   // ISO 8601
}
```

**Subscribe in Frontend:**

```typescript
connection.on('IntegrityCheckCompleted', (event: IntegrityCheckCompletedEvent) => {
  console.log('Integrity check completed:', event);
  
  if (event.status === 'success') {
    toast.success('? Backup integrity verified!');
  } else {
    toast.error(`? Integrity check failed: ${event.message}`);
  }
});
```

---

## 5. Complete React Example

### Full Backup Management Component

```tsx
import React, { useState, useEffect } from 'react';
import * as signalR from '@microsoft/signalr';

interface BackupJob {
  id: string;
  name: string;
  sourcePath: string;
  agentId: number;
}

interface FileSystemItem {
  name: string;
  path: string;
  type: string;
}

interface BackupSnapshot {
  id: string;
  time: string;
  hostname: string;
  paths: string[];
}

function BackupManager({ job, connection }: { 
  job: BackupJob; 
  connection: signalR.HubConnection 
}) {
  const [currentPath, setCurrentPath] = useState('/');
  const [directories, setDirectories] = useState<FileSystemItem[]>([]);
  const [snapshots, setSnapshots] = useState<BackupSnapshot[]>([]);
  const [integrityStatus, setIntegrityStatus] = useState<string | null>(null);

  // Browse filesystem
  const browsePath = async (path: string) => {
    const token = localStorage.getItem('authToken');
    const response = await fetch(
      `https://localhost:7287/api/backups/browse/${job.agentId}`,
      { 
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ path })
      }
    );
    const data = await response.json();
    setCurrentPath(data.currentPath);
    setDirectories(data.items);
  };

  // Load snapshots
  const loadSnapshots = async () => {
    const token = localStorage.getItem('authToken');
    const response = await fetch(
      `https://localhost:7287/api/backups/${job.id}/snapshots`,
      { headers: { 'Authorization': `Bearer ${token}` } }
    );
    const data = await response.json();
    setSnapshots(data);
  };

  // Trigger integrity check
  const checkIntegrity = async () => {
    setIntegrityStatus('? Checking...');
    const token = localStorage.getItem('authToken');
    await fetch(
      `https://localhost:7287/api/backups/${job.id}/integrity-check`,
      {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      }
    );
  };

  // Listen for integrity check completion
  useEffect(() => {
    const handler = (event: any) => {
      if (event.jobId === job.id) {
        setIntegrityStatus(
          event.status === 'success' 
            ? '? Repository is healthy' 
            : `? ${event.message}`
        );
      }
    };

    connection.on('IntegrityCheckCompleted', handler);
    return () => connection.off('IntegrityCheckCompleted', handler);
  }, [job.id, connection]);

  useEffect(() => {
    browsePath('/');
    loadSnapshots();
  }, [job.id]);

  return (
    <div className="backup-manager">
      <h2>{job.name}</h2>

      {/* Filesystem Browser */}
      <section>
        <h3>?? Browse Directories</h3>
        <p>Current: {currentPath}</p>
        <ul>
          {directories.map((dir) => (
            <li key={dir.path} onClick={() => browsePath(dir.path)}>
              ?? {dir.name}
            </li>
          ))}
        </ul>
      </section>

      {/* Snapshots */}
      <section>
        <h3>?? Snapshots ({snapshots.length})</h3>
        <button onClick={loadSnapshots}>Refresh</button>
        <ul>
          {snapshots.map((snap) => (
            <li key={snap.id}>
              {snap.id} - {new Date(snap.time).toLocaleString()}
            </li>
          ))}
        </ul>
      </section>

      {/* Integrity Check */}
      <section>
        <h3>?? Integrity Check</h3>
        <button onClick={checkIntegrity}>Check Repository Health</button>
        {integrityStatus && <p>{integrityStatus}</p>}
      </section>
    </div>
  );
}

export default BackupManager;
```

---

## API Summary Table

| Feature | Method | Endpoint | Response Time | Event |
|---------|--------|----------|---------------|-------|
| **Browse Filesystem** | `POST` | `/api/backups/browse/{agentId}` | ~100-500ms | None |
| **Get Snapshots** | `GET` | `/api/backups/{id}/snapshots` | ~2-10s | None |
| **Check Integrity** | `POST` | `/api/backups/{id}/integrity-check` | ~100ms | `IntegrityCheckCompleted` |

---

## Security Notes

1. **Authentication Required**: All endpoints require valid JWT token in `Authorization: Bearer {token}` header
2. **Agent Must Be Online**: Browse and snapshot operations fail if agent is offline
3. **Credentials Are Encrypted**: Backend handles credential decryption; frontend never sees passwords/keys
4. **Directory-Only Browsing**: For security, only directories are returned (no files)
5. **Timeout Handling**: Long-running operations (snapshots, integrity) have 30-second timeouts

---

## Error Handling Best Practices

```tsx
async function callBackupAPI(url: string, method: string = 'GET') {
  try {
    const token = localStorage.getItem('authToken');
    const response = await fetch(url, {
      method,
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (response.status === 401) {
      // Redirect to login
      window.location.href = '/login';
      return null;
    }

    if (response.status === 504) {
      throw new Error('Agent took too long to respond. Please try again.');
    }

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Request failed');
    }

    return await response.json();
  } catch (err: any) {
    console.error('API Error:', err);
    throw err;
  }
}
```

---

## Testing Checklist

- [ ] Browse filesystem starting from `/`
- [ ] Navigate to subdirectories (e.g., `/var`, `/var/www`)
- [ ] Handle "Permission denied" errors gracefully
- [ ] Load snapshots for existing backup job
- [ ] Display empty state when no snapshots exist
- [ ] Trigger integrity check and wait for SignalR event
- [ ] Handle agent offline scenarios
- [ ] Test timeout scenarios (agent not responding)
- [ ] Verify JWT token expiration handling

---

**End of Documentation**

For questions or issues, contact the backend team.
