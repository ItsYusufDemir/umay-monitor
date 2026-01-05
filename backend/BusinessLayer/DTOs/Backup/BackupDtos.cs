namespace BusinessLayer.DTOs.Backup;

/// <summary>
/// Request to create a new backup job
/// </summary>
public class CreateBackupJobRequest
{
    public int AgentId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string SourcePath { get; set; } = string.Empty;
    public string RepoUrl { get; set; } = string.Empty;
    public string RepoPassword { get; set; } = string.Empty;
    public string SshPrivateKey { get; set; } = string.Empty;
    public string ScheduleCron { get; set; } = string.Empty;
    public bool IsActive { get; set; } = true;
}

/// <summary>
/// Request to update an existing backup job
/// </summary>
public class UpdateBackupJobRequest
{
    public string? Name { get; set; }
    public string? SourcePath { get; set; }
    public string? RepoUrl { get; set; }
    public string? RepoPassword { get; set; }
    public string? SshPrivateKey { get; set; }
    public string? ScheduleCron { get; set; }
    public bool? IsActive { get; set; }
}

/// <summary>
/// Request to browse filesystem on agent
/// </summary>
public class BrowseFilesystemRequest
{
    public string Path { get; set; } = "/";
}

/// <summary>
/// Response containing backup job details (credentials are never returned)
/// </summary>
public class BackupJobDto
{
    public Guid Id { get; set; }
    public int AgentId { get; set; }
    public string AgentName { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string SourcePath { get; set; } = string.Empty;
    public string RepoUrl { get; set; } = string.Empty;
    public string ScheduleCron { get; set; } = string.Empty;
    public bool IsActive { get; set; }
    public string LastRunStatus { get; set; } = string.Empty;
    public DateTime? LastRunAtUtc { get; set; }
    public DateTime CreatedAtUtc { get; set; }
    public DateTime UpdatedAtUtc { get; set; }
}

/// <summary>
/// Response containing backup log/execution history
/// </summary>
public class BackupLogDto
{
    public Guid Id { get; set; }
    public Guid JobId { get; set; }
    public string Status { get; set; } = string.Empty;
    public string? Message { get; set; }
    public string? SnapshotId { get; set; }
    public int? FilesNew { get; set; }
    public long? DataAdded { get; set; }
    public double? DurationSeconds { get; set; }
    public string? ErrorMessage { get; set; }
    public DateTime CreatedAtUtc { get; set; }
}

/// <summary>
/// Response when listing snapshots from Restic repository
/// </summary>
public class BackupSnapshotDto
{
    public string Id { get; set; } = string.Empty;
    public DateTime Time { get; set; }
    public string Hostname { get; set; } = string.Empty;
    public string[] Paths { get; set; } = Array.Empty<string>();
    public long? Size { get; set; }
}
