using BusinessLayer.DTOs.Backup;

namespace BusinessLayer.Services.Interfaces;

/// <summary>
/// Service for managing backup jobs (CRUD operations with encryption)
/// </summary>
public interface IBackupJobService
{
    /// <summary>
    /// Creates a new backup job with encrypted credentials
    /// </summary>
    Task<BackupJobDto> CreateBackupJobAsync(CreateBackupJobRequest request);
    
    /// <summary>
    /// Gets all backup jobs for a specific agent
    /// </summary>
    Task<List<BackupJobDto>> GetBackupJobsByAgentAsync(int agentId);
    
    /// <summary>
    /// Gets all backup jobs in the system
    /// </summary>
    Task<List<BackupJobDto>> GetAllBackupJobsAsync();
    
    /// <summary>
    /// Gets a specific backup job by ID
    /// </summary>
    Task<BackupJobDto?> GetBackupJobByIdAsync(Guid jobId);
    
    /// <summary>
    /// Updates an existing backup job
    /// </summary>
    Task<BackupJobDto?> UpdateBackupJobAsync(Guid jobId, UpdateBackupJobRequest request);
    
    /// <summary>
    /// Deletes a backup job and all its logs
    /// </summary>
    Task<bool> DeleteBackupJobAsync(Guid jobId);
    
    /// <summary>
    /// Gets decrypted credentials for triggering a backup (internal use only)
    /// </summary>
    Task<(string repoPassword, string sshPrivateKey)?> GetDecryptedCredentialsAsync(Guid jobId);
    
    /// <summary>
    /// Gets execution logs for a specific backup job
    /// </summary>
    Task<List<BackupLogDto>> GetBackupLogsAsync(Guid jobId, int limit = 50);
    
    /// <summary>
    /// Creates a new backup log entry
    /// </summary>
    Task<BackupLogDto> CreateBackupLogAsync(Guid jobId, Guid taskId, string status,
        string? message = null, string? snapshotId = null, int? filesNew = null, 
        long? dataAdded = null, double? durationSeconds = null, string? errorMessage = null);
    
    /// <summary>
    /// Updates backup job status after execution
    /// </summary>
    Task UpdateJobStatusAsync(Guid jobId, string status);
    
    /// <summary>
    /// Gets real snapshots from Restic repository via agent
    /// </summary>
    Task<List<BackupSnapshotDto>> GetSnapshotsFromAgentAsync(Guid jobId);
    
    /// <summary>
    /// Triggers an integrity check for a backup job's repository
    /// </summary>
    Task<Guid> TriggerIntegrityCheckAsync(Guid jobId);
}
