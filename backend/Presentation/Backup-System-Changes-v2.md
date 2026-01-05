# Backup System Changes - Version 2.0

**Date:** January 3, 2026  
**Version:** 2.0  
**Breaking Changes:** Yes - Database schema and API response updated

---

## Overview

This document describes the changes made to the backup system, including new database fields, updated API responses, and improvements to logging and status tracking.

---

## Table of Contents

1. [Database Schema Changes](#1-database-schema-changes)
2. [API Response Changes](#2-api-response-changes)
3. [Browse Filesystem Endpoint Change](#3-browse-filesystem-endpoint-change)
4. [Backup Job Status Tracking](#4-backup-job-status-tracking)
5. [Integrity Check Improvements](#5-integrity-check-improvements)
6. [SignalR Event Updates](#6-signalr-event-updates)
7. [Migration Guide](#7-migration-guide)

---

## 1. Database Schema Changes

### New Column: `Message`

The `backup_logs` table now includes a `Message` column for descriptive text about log entries.

**Old Schema:**
```sql
backup_logs (
  id UUID,
  job_id UUID,
  status VARCHAR,
  snapshot_id VARCHAR,
  files_new INT,
  data_added BIGINT,
  duration_seconds FLOAT,
  error_message TEXT,  -- Used for both success and error messages ?
  created_at_utc TIMESTAMP
)
```

**New Schema:**
```sql
backup_logs (
  id UUID,
  job_id UUID,
  status VARCHAR,
  message TEXT,         -- NEW: Descriptive message ?
  snapshot_id VARCHAR,
  files_new INT,
  data_added BIGINT,
  duration_seconds FLOAT,
  error_message TEXT,   -- Now only for errors ?
  created_at_utc TIMESTAMP
)
```

### Field Usage

| Operation | Message | ErrorMessage |
|-----------|---------|--------------|
| Backup Started | "Backup started" | NULL |
| Backup Success | "Backup completed successfully" | NULL |
| Backup Failure | "Backup failed" | Actual error details |
| Integrity Check Started | "Integrity check started" | NULL |
| Integrity Check Success | "Integrity check passed" | NULL |
| Integrity Check Failure | "Integrity check failed" | Actual error details |
| Agent Offline | "Backup failed" | "Agent is offline" |

---

## 2. API Response Changes

### Updated: GET /api/backups/{id}/logs

**Old Response:**
```typescript
interface BackupLogDto {
  id: string;
  jobId: string;
  status: string;
  snapshotId?: string;
  filesNew?: number;
  dataAdded?: number;
  durationSeconds?: number;
  errorMessage?: string;  // Used for all messages
  createdAtUtc: string;
}
```

**New Response:**
```typescript
interface BackupLogDto {
  id: string;
  jobId: string;
  status: string;
  message?: string;           // NEW: Descriptive message
  snapshotId?: string;
  filesNew?: number;
  dataAdded?: number;
  durationSeconds?: number;
  errorMessage?: string;      // Now only for errors
  createdAtUtc: string;
}
```

**Example Responses:**

**Successful Backup:**
```json
{
  "id": "cb80b101-7af4-4a72-825c-0135114538b1",
  "jobId": "00e27bbd-84b5-46a8-95a4-a7cfdbf6c754",
  "status": "success",
  "message": "Backup completed successfully",
  "snapshotId": "aefa8845",
  "filesNew": 1,
  "dataAdded": 22219,
  "durationSeconds": 0.241,
  "errorMessage": null,
  "createdAtUtc": "2026-01-03T15:31:19.544125Z"
}
```

**Failed Backup:**
```json
{
  "id": "8b6a12b4-add3-4870-b1f5-23a60e3ff30e",
  "jobId": "00e27bbd-84b5-46a8-95a4-a7cfdbf6c754",
  "status": "error",
  "message": "Backup failed",
  "snapshotId": null,
  "filesNew": null,
  "dataAdded": null,
  "durationSeconds": null,
  "errorMessage": "Agent is offline",
  "createdAtUtc": "2026-01-03T15:15:23.632554Z"
}
```

**Integrity Check:**
```json
{
  "id": "03f94f5b-bc32-425e-a851-163141e69d8b",
  "jobId": "00e27bbd-84b5-46a8-95a4-a7cfdbf6c754",
  "status": "success",
  "message": "Integrity check passed",
  "snapshotId": null,
  "filesNew": null,
  "dataAdded": null,
  "durationSeconds": 0,
  "errorMessage": null,
  "createdAtUtc": "2026-01-03T15:01:10.294992Z"
}
```

---

## 3. Browse Filesystem Endpoint Change

### ?? Breaking Change: Method Changed from GET to POST

**Old Endpoint:**
```
GET /api/backups/browse/{agentId}?path=/var
```

**New Endpoint:**
```
POST /api/backups/browse/{agentId}
Content-Type: application/json

{
  "path": "/var"
}
```

**Reason:** Improved compatibility and consistency with other endpoints.

**Frontend Update Required:**

**Before:**
```typescript
const response = await fetch(
  `${API_URL}/api/backups/browse/${agentId}?path=${encodeURIComponent(path)}`,
  {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  }
);
```

**After:**
```typescript
const response = await fetch(
  `${API_URL}/api/backups/browse/${agentId}`,
  {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ path })
  }
);
```

---

## 4. Backup Job Status Tracking

### Fixed: Status Now Updates Correctly

**Issue:** Backup jobs were staying in "pending" status even after successful completion.

**Fix:** Job status now properly updates when backup completes.

**Behavior:**

1. **Trigger Backup** ? Job status: `pending`, Log status: `pending`, Message: "Backup started"
2. **Agent Processing** ? Job status: `pending`, Log status: `pending`
3. **Backup Completes** ? Job status: `success`, Log status: `success`, Message: "Backup completed successfully"
4. **Backup Fails** ? Job status: `error`, Log status: `error`, Message: "Backup failed"

**GET /api/backups Response Now Includes Correct Status:**

```json
{
  "id": "00e27bbd-84b5-46a8-95a4-a7cfdbf6c754",
  "name": "Web Server Backup",
  "agentId": 23,
  "isActive": true,
  "lastRunStatus": "success",      // ? Now updates correctly
  "lastRunAtUtc": "2026-01-03T15:31:21.777401Z",
  "createdAtUtc": "2026-01-03T14:57:59.11803Z"
}
```

---

## 5. Integrity Check Improvements

### Fixed: No More Success Messages in ErrorMessage Field

**Old Behavior:**
```json
{
  "status": "success",
  "errorMessage": "Integrity check passed"  // ? Wrong field
}
```

**New Behavior:**
```json
{
  "status": "success",
  "message": "Integrity check passed",      // ? Correct field
  "errorMessage": null
}
```

### Integrity Check Log Structure

| Field | Success | Failure |
|-------|---------|---------|
| `status` | "success" | "error" |
| `message` | "Integrity check passed" | "Integrity check failed" |
| `errorMessage` | NULL | Error details |
| `snapshotId` | NULL | NULL |
| `filesNew` | NULL | NULL |
| `dataAdded` | NULL | NULL |
| `durationSeconds` | 0 | 0 |

---

## 6. SignalR Event Updates

### Updated: BackupCompleted Event

**New Payload Includes Message:**

```typescript
interface BackupCompletedEvent {
  serverId: number;
  jobId: string;
  taskId: string;
  status: string;
  message: string;           // NEW
  snapshotId?: string;
  filesNew?: number;
  dataAdded?: number;
  durationSeconds?: number;
  errorMessage?: string;
  timestamp: string;
}
```

**Example:**
```json
{
  "serverId": 23,
  "jobId": "00e27bbd-84b5-46a8-95a4-a7cfdbf6c754",
  "taskId": "cb80b101-7af4-4a72-825c-0135114538b1",
  "status": "success",
  "message": "Backup completed successfully",
  "snapshotId": "aefa8845",
  "filesNew": 1,
  "dataAdded": 22219,
  "durationSeconds": 0.241,
  "errorMessage": null,
  "timestamp": "2026-01-03T15:31:22Z"
}
```

### Updated: IntegrityCheckCompleted Event

**New Payload Includes Message:**

```typescript
interface IntegrityCheckCompletedEvent {
  serverId: number;
  jobId: string;
  taskId: string;
  status: string;
  message: string;           // NEW: Descriptive message
  errorMessage?: string;     // Only populated on error
  timestamp: string;
}
```

**Example Success:**
```json
{
  "serverId": 23,
  "jobId": "00e27bbd-84b5-46a8-95a4-a7cfdbf6c754",
  "taskId": "03f94f5b-bc32-425e-a851-163141e69d8b",
  "status": "success",
  "message": "Integrity check passed",
  "errorMessage": null,
  "timestamp": "2026-01-03T15:01:11Z"
}
```

**Example Failure:**
```json
{
  "serverId": 23,
  "jobId": "00e27bbd-84b5-46a8-95a4-a7cfdbf6c754",
  "taskId": "8b6a12b4-add3-4870-b1f5-23a60e3ff30e",
  "status": "error",
  "message": "Integrity check failed",
  "errorMessage": "Repository corrupted: pack file abc123 missing",
  "timestamp": "2026-01-03T15:15:24Z"
}
```

---

## 7. Migration Guide

### For Frontend Developers

#### Step 1: Update TypeScript Interfaces

```typescript
// Update BackupLogDto interface
interface BackupLogDto {
  id: string;
  jobId: string;
  status: string;
  message?: string;           // ADD THIS
  snapshotId?: string;
  filesNew?: number;
  dataAdded?: number;
  durationSeconds?: number;
  errorMessage?: string;
  createdAtUtc: string;
}

// Update SignalR event interfaces
interface BackupCompletedEvent {
  // ...existing fields...
  message: string;           // ADD THIS
  // ...rest of fields...
}

interface IntegrityCheckCompletedEvent {
  serverId: number;
  jobId: string;
  taskId: string;
  status: string;
  message: string;           // ADD THIS
  errorMessage?: string;
  timestamp: string;
}
```

#### Step 2: Update Browse Filesystem Call

```typescript
// OLD CODE (remove this)
async function browsePath(agentId: number, path: string) {
  const response = await fetch(
    `${API_URL}/api/backups/browse/${agentId}?path=${encodeURIComponent(path)}`,
    {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` }
    }
  );
  return await response.json();
}

// NEW CODE (use this)
async function browsePath(agentId: number, path: string) {
  const response = await fetch(
    `${API_URL}/api/backups/browse/${agentId}`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ path })
    }
  );
  return await response.json();
}
```

#### Step 3: Update Log Display Component

```tsx
function BackupLogItem({ log }: { log: BackupLogDto }) {
  return (
    <div className="log-entry">
      <div className="log-status">
        {log.status === 'success' ? '?' : '?'} {log.status}
      </div>
      
      {/* Display descriptive message */}
      {log.message && (
        <div className="log-message">{log.message}</div>
      )}
      
      {/* Display error details if present */}
      {log.errorMessage && (
        <div className="log-error">{log.errorMessage}</div>
      )}
      
      {/* Display backup details */}
      {log.snapshotId && (
        <div className="log-details">
          Snapshot: {log.snapshotId} | 
          Files: {log.filesNew} | 
          Size: {formatBytes(log.dataAdded)}
        </div>
      )}
      
      <div className="log-timestamp">
        {new Date(log.createdAtUtc).toLocaleString()}
      </div>
    </div>
  );
}
```

#### Step 4: Update SignalR Event Handlers

```typescript
// BackupCompleted handler
connection.on('BackupCompleted', (event: BackupCompletedEvent) => {
  console.log('Backup completed:', event.message);  // Use message field
  
  if (event.status === 'success') {
    toast.success(`? ${event.message}`);
  } else {
    toast.error(`? ${event.message}: ${event.errorMessage}`);
  }
  
  // Refresh logs
  fetchBackupLogs(event.jobId);
});

// IntegrityCheckCompleted handler
connection.on('IntegrityCheckCompleted', (event: IntegrityCheckCompletedEvent) => {
  console.log('Integrity check:', event.message);  // Use message field
  
  if (event.status === 'success') {
    toast.success(`? ${event.message}`);
  } else {
    toast.error(`? ${event.message}: ${event.errorMessage}`);
  }
});
```

---

## Summary of Changes

| Change | Type | Impact |
|--------|------|--------|
| **Add `Message` column** | Database | Medium - Update queries |
| **Update `BackupLogDto`** | API Response | Low - Add new field |
| **Change Browse to POST** | Breaking | High - Update all calls |
| **Fix job status updates** | Bug Fix | None - Automatic |
| **Fix integrity check logging** | Bug Fix | None - Automatic |
| **Update SignalR events** | API Change | Medium - Update handlers |

---

## Testing Checklist

- [ ] Verify browse filesystem works with POST method
- [ ] Check backup logs show `message` field
- [ ] Confirm `errorMessage` is NULL for successful operations
- [ ] Test job status updates from pending ? success/error
- [ ] Verify integrity check logs use correct fields
- [ ] Test SignalR events include message field
- [ ] Confirm snapshot IDs are now returned correctly

---

## Rollback Plan

If issues arise, you can temporarily:

1. **Browse Filesystem:** Use `GET` method if POST fails (backend supports both during transition)
2. **Message Field:** Fallback to `errorMessage` if `message` is null
3. **Job Status:** Poll logs directly if job status is incorrect

---

**For questions or issues, contact the backend team.**
