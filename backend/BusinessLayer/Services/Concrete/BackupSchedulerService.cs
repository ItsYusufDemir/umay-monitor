using BusinessLayer.Services.Interfaces;
using Cronos;
using Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace BusinessLayer.Services.Concrete;

/// <summary>
/// Background service that evaluates cron schedules and triggers backup jobs
/// </summary>
public class BackupSchedulerService : BackgroundService, IBackupSchedulerService
{
    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<BackupSchedulerService> _logger;
    private readonly TimeSpan _checkInterval = TimeSpan.FromMinutes(1);

    public BackupSchedulerService(
        IServiceProvider serviceProvider,
        ILogger<BackupSchedulerService> logger)
    {
        _serviceProvider = serviceProvider;
        _logger = logger;
    }

    public Task StartAsync(CancellationToken cancellationToken)
    {
        _logger.LogInformation("Backup Scheduler Service is starting");
        return base.StartAsync(cancellationToken);
    }

    public Task StopAsync(CancellationToken cancellationToken)
    {
        _logger.LogInformation("Backup Scheduler Service is stopping");
        return base.StopAsync(cancellationToken);
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("Backup Scheduler Service is running");

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await CheckScheduledJobsAsync();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error occurred while checking scheduled backup jobs");
            }

            await Task.Delay(_checkInterval, stoppingToken);
        }

        _logger.LogInformation("Backup Scheduler Service has stopped");
    }

    private async Task CheckScheduledJobsAsync()
    {
        using var scope = _serviceProvider.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<ServerMonitoringDbContext>();
        var agentCommandService = scope.ServiceProvider.GetRequiredService<IAgentCommandService>();

        var now = DateTime.UtcNow;

        // Get all active backup jobs
        var activeJobs = await context.BackupJobs
            .Where(j => j.IsActive)
            .ToListAsync();

        foreach (var job in activeJobs)
        {
            try
            {
                // Parse cron expression
                var cronExpression = CronExpression.Parse(job.ScheduleCron, CronFormat.Standard);
                
                // Get the next occurrence from the last run (or creation time if never run)
                var fromTime = job.LastRunAtUtc ?? job.CreatedAtUtc;
                var nextOccurrence = cronExpression.GetNextOccurrence(fromTime, TimeZoneInfo.Local);

                if (nextOccurrence.HasValue && nextOccurrence.Value <= now)
                {
                    _logger.LogInformation(
                        "Triggering scheduled backup job {JobId} ({JobName}) for agent {AgentId}",
                        job.Id, job.Name, job.AgentId);

                    // Trigger the backup
                    await TriggerBackupJobInternalAsync(job.Id, scope.ServiceProvider);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, 
                    "Failed to process schedule for backup job {JobId}. Cron expression: {CronExpression}", 
                    job.Id, job.ScheduleCron);
            }
        }
    }

    public async Task<Guid> TriggerBackupJobAsync(Guid jobId)
    {
        using var scope = _serviceProvider.CreateScope();
        return await TriggerBackupJobInternalAsync(jobId, scope.ServiceProvider);
    }

    private async Task<Guid> TriggerBackupJobInternalAsync(Guid jobId, IServiceProvider serviceProvider)
    {
        var context = serviceProvider.GetRequiredService<ServerMonitoringDbContext>();
        var backupJobService = serviceProvider.GetRequiredService<IBackupJobService>();
        var agentCommandService = serviceProvider.GetRequiredService<IAgentCommandService>();
        var encryptionService = serviceProvider.GetRequiredService<IEncryptionService>();

        // Get job details
        var job = await context.BackupJobs.FindAsync(jobId);
        if (job == null)
        {
            _logger.LogWarning("Attempted to trigger non-existent backup job {JobId}", jobId);
            throw new InvalidOperationException($"Backup job {jobId} not found");
        }

        // Check if agent is online
        var agent = await context.MonitoredServers.FindAsync(job.AgentId);
        if (agent == null || !agent.IsOnline)
        {
            _logger.LogWarning(
                "Cannot trigger backup job {JobId}: agent {AgentId} is offline",
                jobId, job.AgentId);
            
            var errorTaskId = Guid.NewGuid();
            await backupJobService.CreateBackupLogAsync(
                jobId, errorTaskId, "error",
                message: "Backup failed",
                errorMessage: "Agent is offline");
            await backupJobService.UpdateJobStatusAsync(jobId, "error");
            
            return errorTaskId;
        }

        // Decrypt credentials
        var credentials = await backupJobService.GetDecryptedCredentialsAsync(jobId);
        if (credentials == null)
        {
            _logger.LogError("Failed to decrypt credentials for backup job {JobId}", jobId);
            throw new InvalidOperationException($"Failed to decrypt credentials for job {jobId}");
        }

        // Generate task ID for tracking
        var taskId = Guid.NewGuid();

        // Create running log entry
        await backupJobService.CreateBackupLogAsync(jobId, taskId, "running",
            message: "Backup started");
        await backupJobService.UpdateJobStatusAsync(jobId, "running");

        // Send trigger command to agent
        var payload = new
        {
            taskId = taskId.ToString(),
            source = job.SourcePath,
            repo = job.RepoUrl,
            password = credentials.Value.repoPassword,
            sshKey = credentials.Value.sshPrivateKey
        };

        await agentCommandService.SendCommandToAgentAsync(
            job.AgentId,
            "trigger-backup",
            payload);

        _logger.LogInformation(
            "Triggered backup job {JobId} with task ID {TaskId} for agent {AgentId}",
            jobId, taskId, job.AgentId);

        return taskId;
    }
}
