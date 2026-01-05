using System.Text.Json.Serialization;

namespace BusinessLayer.DTOs.Agent.Backup;

/// <summary>
/// Payload sent from backend to agent to trigger a backup operation
/// </summary>
public class TriggerBackupPayload
{
    public string TaskId { get; set; } = string.Empty;
    public string Source { get; set; } = string.Empty;
    public string Repo { get; set; } = string.Empty;
    public string Password { get; set; } = string.Empty;
    public string SshKey { get; set; } = string.Empty;
}

/// <summary>
/// Payload sent from backend to agent to browse filesystem
/// </summary>
public class BrowseFilesystemPayload
{
    public string Path { get; set; } = "/";
}

/// <summary>
/// Response from agent with filesystem contents
/// </summary>
public class BrowseFilesystemResponse
{
    public string Status { get; set; } = string.Empty;
    public FilesystemData? Data { get; set; }
    public string? Message { get; set; }
}

public class FilesystemData
{
    public string CurrentPath { get; set; } = string.Empty;
    public string ParentPath { get; set; } = string.Empty;
    public List<FileSystemItem> Items { get; set; } = new();
}

public class FileSystemItem
{
    public string Name { get; set; } = string.Empty;
    public string Type { get; set; } = string.Empty; // "directory" or "file"
    public string Path { get; set; } = string.Empty;
}

/// <summary>
/// Payload sent from backend to agent to get snapshots from repository
/// </summary>
public class GetSnapshotsPayload
{
    public string Repo { get; set; } = string.Empty;
    public string Password { get; set; } = string.Empty;
    public string SshKey { get; set; } = string.Empty;
}

/// <summary>
/// Response from agent with repository snapshots
/// </summary>
public class GetSnapshotsResponse
{
    public string Status { get; set; } = string.Empty;
    public List<ResticSnapshot>? Data { get; set; }
    public string? Message { get; set; }
}

public class ResticSnapshot
{
    public string Time { get; set; } = string.Empty;
    public string? Parent { get; set; }
    public string Tree { get; set; } = string.Empty;
    public List<string> Paths { get; set; } = new();
    public string Hostname { get; set; } = string.Empty;
    public string Username { get; set; } = string.Empty;
    public string Id { get; set; } = string.Empty;
    
    [JsonPropertyName("short_id")]
    public string ShortId { get; set; } = string.Empty;
}

/// <summary>
/// Payload sent from backend to agent to check backup integrity
/// </summary>
public class IntegrityCheckPayload
{
    public string TaskId { get; set; } = string.Empty;
    public string Repo { get; set; } = string.Empty;
    public string Password { get; set; } = string.Empty;
    public string SshKey { get; set; } = string.Empty;
}

/// <summary>
/// Event sent from agent to backend when integrity check completes
/// </summary>
public class IntegrityCheckCompletedEvent
{
    public string TaskId { get; set; } = string.Empty;
    public IntegrityCheckResult Result { get; set; } = new();
}

public class IntegrityCheckResult
{
    public string Status { get; set; } = string.Empty; // "ok" or "error"
    public string? Output { get; set; }
    public string? Message { get; set; }
}

/// <summary>
/// Event sent from agent to backend when backup completes
/// </summary>
public class BackupCompletedEvent
{
    public string TaskId { get; set; } = string.Empty;
    public BackupResult Result { get; set; } = new();
}

public class BackupResult
{
    public string Status { get; set; } = string.Empty; // "ok" or "error"
    
    [JsonPropertyName("snapshot_id")]
    public string? SnapshotId { get; set; }
    
    [JsonPropertyName("files_new")]
    public int? FilesNew { get; set; }
    
    [JsonPropertyName("data_added")]
    public long? DataAdded { get; set; }
    
    public double? Duration { get; set; }
    
    [JsonPropertyName("message")]
    public string? ErrorMessage { get; set; }
}
