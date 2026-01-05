namespace Infrastructure.Entities;

/// <summary>
/// Stores backup job configuration and schedule.
/// Sensitive credentials are encrypted before storage.
/// </summary>
public class BackupJob
{
    /// <summary>
    /// Unique identifier for the backup job
    /// </summary>
    public Guid Id { get; set; }
    
    /// <summary>
    /// The server this backup job targets
    /// </summary>
    public int AgentId { get; set; }
    
    /// <summary>
    /// Friendly name for the backup job (e.g., "Web Server Backup")
    /// </summary>
    public string Name { get; set; } = string.Empty;
    
    /// <summary>
    /// Local path on the agent to backup (e.g., /var/www)
    /// </summary>
    public string SourcePath { get; set; } = string.Empty;
    
    /// <summary>
    /// Destination repository URL (format: sftp:user@host:/path)
    /// </summary>
    public string RepoUrl { get; set; } = string.Empty;
    
    /// <summary>
    /// Encrypted Restic repository password
    /// </summary>
    public string RepoPasswordEncrypted { get; set; } = string.Empty;
    
    /// <summary>
    /// Encrypted SSH private key content for remote authentication
    /// </summary>
    public string SshPrivateKeyEncrypted { get; set; } = string.Empty;
    
    /// <summary>
    /// Cron expression defining backup schedule
    /// </summary>
    public string ScheduleCron { get; set; } = string.Empty;
    
    /// <summary>
    /// Toggle to enable/disable the backup job
    /// </summary>
    public bool IsActive { get; set; } = true;
    
    /// <summary>
    /// Status of the last backup execution (running, success, error)
    /// </summary>
    public string LastRunStatus { get; set; } = "success";
    
    /// <summary>
    /// Timestamp of the last backup execution
    /// </summary>
    public DateTime? LastRunAtUtc { get; set; }
    
    /// <summary>
    /// When this backup job was created
    /// </summary>
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    
    /// <summary>
    /// When this backup job was last updated
    /// </summary>
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;

    // Navigation properties
    public MonitoredServer Agent { get; set; } = null!;
    public ICollection<BackupLog> Logs { get; set; } = new List<BackupLog>();
}
