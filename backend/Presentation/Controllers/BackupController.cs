using BusinessLayer.DTOs.Backup;
using BusinessLayer.Services.Interfaces;
using BusinessLayer.DTOs.Agent;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Presentation.Controllers;

/// <summary>
/// Handles backup job management endpoints
/// </summary>
[ApiController]
[Route("api/backups")]
[Authorize]
public class BackupController : ControllerBase
{
    private readonly IBackupJobService _backupJobService;
    private readonly IBackupSchedulerService _schedulerService;
    private readonly IAgentCommandService _agentCommandService;
    private readonly ILogger<BackupController> _logger;

    public BackupController(
        IBackupJobService backupJobService,
        IBackupSchedulerService schedulerService,
        IAgentCommandService agentCommandService,
        ILogger<BackupController> logger)
    {
        _backupJobService = backupJobService;
        _schedulerService = schedulerService;
        _agentCommandService = agentCommandService;
        _logger = logger;
    }

    /// <summary>
    /// Creates a new backup job
    /// </summary>
    [HttpPost]
    public async Task<IActionResult> CreateBackupJob([FromBody] CreateBackupJobRequest request)
    {
        _logger.LogInformation("Creating backup job {JobName} for agent {AgentId}",
            request.Name, request.AgentId);

        if (!ModelState.IsValid)
            return BadRequest(ModelState);

        try
        {
            var job = await _backupJobService.CreateBackupJobAsync(request);
            return CreatedAtAction(nameof(GetBackupJob), new { id = job.Id }, job);
        }
        catch (ArgumentException ex)
        {
            _logger.LogWarning(ex, "Failed to create backup job: {Message}", ex.Message);
            return BadRequest(new { error = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error creating backup job");
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>
    /// Gets all backup jobs (optionally filtered by agent)
    /// </summary>
    [HttpGet]
    public async Task<IActionResult> GetBackupJobs([FromQuery] int? agentId = null)
    {
        try
        {
            var jobs = agentId.HasValue
                ? await _backupJobService.GetBackupJobsByAgentAsync(agentId.Value)
                : await _backupJobService.GetAllBackupJobsAsync();

            return Ok(jobs);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error retrieving backup jobs");
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>
    /// Browse filesystem on agent to select backup source directories
    /// </summary>
    [HttpPost("browse/{agentId}")]
    public async Task<IActionResult> BrowseFilesystem(int agentId, [FromBody] BrowseFilesystemRequest request)
    {
        _logger.LogInformation("Browsing filesystem on agent {AgentId}, path: {Path}", agentId, request.Path);

        try
        {
            var payload = new BusinessLayer.DTOs.Agent.Backup.BrowseFilesystemPayload
            {
                Path = request.Path ?? "/"
            };

            var response = await _agentCommandService.SendCommandAsync<
                BusinessLayer.DTOs.Agent.Backup.BrowseFilesystemPayload,
                BusinessLayer.DTOs.Agent.Backup.BrowseFilesystemResponse>(
                agentId,
                AgentActions.BrowseFilesystem,
                payload,
                TimeSpan.FromSeconds(10));

            if (response.Status != "ok" || response.Data == null)
            {
                _logger.LogWarning("Failed to browse filesystem on agent {AgentId}: {Message}",
                    agentId, response.Message);
                return BadRequest(new { error = response.Message ?? "Failed to browse filesystem" });
            }

            return Ok(response.Data);
        }
        catch (InvalidOperationException ex)
        {
            _logger.LogWarning(ex, "Agent {AgentId} is not connected", agentId);
            return BadRequest(new { error = ex.Message });
        }
        catch (TimeoutException)
        {
            _logger.LogWarning("Timeout browsing filesystem on agent {AgentId}", agentId);
            return StatusCode(504, new { error = "Request timeout - agent did not respond" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error browsing filesystem on agent {AgentId}", agentId);
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>
    /// Gets a specific backup job by ID
    /// </summary>
    [HttpGet("{id}")]
    public async Task<IActionResult> GetBackupJob(Guid id)
    {
        try
        {
            var job = await _backupJobService.GetBackupJobByIdAsync(id);
            if (job == null)
                return NotFound(new { error = "Backup job not found" });

            return Ok(job);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error retrieving backup job {JobId}", id);
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>
    /// Updates an existing backup job
    /// </summary>
    [HttpPut("{id}")]
    public async Task<IActionResult> UpdateBackupJob(Guid id, [FromBody] UpdateBackupJobRequest request)
    {
        _logger.LogInformation("Updating backup job {JobId}", id);

        if (!ModelState.IsValid)
            return BadRequest(ModelState);

        try
        {
            var job = await _backupJobService.UpdateBackupJobAsync(id, request);
            if (job == null)
                return NotFound(new { error = "Backup job not found" });

            return Ok(job);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating backup job {JobId}", id);
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>
    /// Deletes a backup job and all its logs
    /// </summary>
    [HttpDelete("{id}")]
    public async Task<IActionResult> DeleteBackupJob(Guid id)
    {
        _logger.LogInformation("Deleting backup job {JobId}", id);

        try
        {
            var success = await _backupJobService.DeleteBackupJobAsync(id);
            if (!success)
                return NotFound(new { error = "Backup job not found" });

            return Ok(new { message = "Backup job deleted successfully" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error deleting backup job {JobId}", id);
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>
    /// Manually triggers a backup job immediately
    /// </summary>
    [HttpPost("{id}/trigger")]
    public async Task<IActionResult> TriggerBackup(Guid id)
    {
        _logger.LogInformation("Manual trigger requested for backup job {JobId}", id);

        try
        {
            var taskId = await _schedulerService.TriggerBackupJobAsync(id);
            return Ok(new
            {
                message = "Backup triggered successfully",
                jobId = id,
                taskId = taskId
            });
        }
        catch (InvalidOperationException ex)
        {
            _logger.LogWarning(ex, "Failed to trigger backup job {JobId}: {Message}", id, ex.Message);
            return BadRequest(new { error = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error triggering backup job {JobId}", id);
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>
    /// Gets execution logs for a backup job
    /// </summary>
    [HttpGet("{id}/logs")]
    public async Task<IActionResult> GetBackupLogs(Guid id, [FromQuery] int limit = 50)
    {
        try
        {
            var logs = await _backupJobService.GetBackupLogsAsync(id, limit);
            return Ok(logs);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error retrieving logs for backup job {JobId}", id);
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>
    /// Gets snapshots from the backup repository via agent
    /// </summary>
    [HttpGet("{id}/snapshots")]
    public async Task<IActionResult> GetBackupSnapshots(Guid id)
    {
        _logger.LogInformation("Getting snapshots for backup job {JobId}", id);

        try
        {
            var snapshots = await _backupJobService.GetSnapshotsFromAgentAsync(id);
            return Ok(snapshots);
        }
        catch (InvalidOperationException ex)
        {
            _logger.LogWarning(ex, "Failed to get snapshots for job {JobId}: {Message}", id, ex.Message);
            return BadRequest(new { error = ex.Message });
        }
        catch (TimeoutException)
        {
            _logger.LogWarning("Timeout getting snapshots for job {JobId}", id);
            return StatusCode(504, new { error = "Request timeout - agent did not respond" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error retrieving snapshots for backup job {JobId}", id);
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>
    /// Triggers an integrity check for a backup job's repository
    /// </summary>
    [HttpPost("{id}/integrity-check")]
    public async Task<IActionResult> TriggerIntegrityCheck(Guid id)
    {
        _logger.LogInformation("Integrity check requested for backup job {JobId}", id);

        try
        {
            var taskId = await _backupJobService.TriggerIntegrityCheckAsync(id);
            return Ok(new
            {
                message = "Integrity check triggered successfully",
                jobId = id,
                taskId = taskId
            });
        }
        catch (InvalidOperationException ex)
        {
            _logger.LogWarning(ex, "Failed to trigger integrity check for job {JobId}: {Message}", id, ex.Message);
            return BadRequest(new { error = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error triggering integrity check for job {JobId}", id);
            return StatusCode(500, new { error = "Internal server error" });
        }
    }
}
