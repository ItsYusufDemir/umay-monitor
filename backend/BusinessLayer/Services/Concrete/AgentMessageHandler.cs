using BusinessLayer.Services.Interfaces;
using BusinessLayer.Services.Infrastructure;
using Microsoft.Extensions.Logging;
using BusinessLayer.DTOs.Agent;
using BusinessLayer.DTOs.Response;
using System.Text.Json;
using Infrastructure;
using Infrastructure.Entities;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using BusinessLayer.Hubs;

namespace BusinessLayer.Services.Concrete;

public class AgentMessageHandler : IAgentMessageHandler
{
    private readonly ILogger<AgentMessageHandler> _logger;
    private readonly ServerMonitoringDbContext _dbContext;
    private readonly IHubContext<MonitoringHub> _monitoringHubContext;
    private readonly IHubContext<NotificationHub> _notificationHubContext;
    private readonly IRequestResponseManager _requestResponseManager;
    private readonly IAlertService _alertService;
    private readonly IWatchlistAutoRestartService _watchlistAutoRestartService;

    public AgentMessageHandler(
        ILogger<AgentMessageHandler> logger,
        ServerMonitoringDbContext dbContext,
        IHubContext<MonitoringHub> monitoringHubContext,
        IHubContext<NotificationHub> notificationHubContext,
        IRequestResponseManager requestResponseManager,
        IAlertService alertService,
        IWatchlistAutoRestartService watchlistAutoRestartService)
    {
        _logger = logger;
        _dbContext = dbContext;
        _monitoringHubContext = monitoringHubContext;
        _notificationHubContext = notificationHubContext;
        _requestResponseManager = requestResponseManager;
        _alertService = alertService;
        _watchlistAutoRestartService = watchlistAutoRestartService;
        
        // Subscribe to request failure events
        _requestResponseManager.OnRequestFailed += HandleRequestFailed;
    }

    public async Task HandleMessageAsync(string message, int serverId)
    {
        try
        {
            var options = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
            var baseMessage = JsonSerializer.Deserialize<BaseAgentMessage>(message, options);

            if (baseMessage == null)
            {
                _logger.LogWarning("Failed to deserialize message from server {ServerId}", serverId);
                return;
            }

            // Log raw message except for high-frequency metrics
            if (baseMessage.Action != AgentActions.Metrics && baseMessage.Action != AgentActions.WatchlistMetrics)
            {
                _logger.LogInformation("📩 Incoming from Agent {ServerId} | Type: {Type} | Action: {Action} | Message: {Message}", 
                    serverId, baseMessage.Type, baseMessage.Action, message);
            }

            // Route based on message type
            switch (baseMessage.Type)
            {
                case MessageTypes.Event:
                    await HandleEvent(serverId, baseMessage, options);
                    break;

                case MessageTypes.Response:
                    await HandleResponse(serverId, baseMessage, options);
                    break;

                case MessageTypes.Request:
                    _logger.LogDebug("Received request from agent (unexpected): {Action}", baseMessage.Action);
                    break;

                default:
                    _logger.LogWarning("Unknown message type: {Type} from server {ServerId}", baseMessage.Type, serverId);
                    break;
            }
        }
        catch (JsonException ex)
        {
            _logger.LogError(ex, "Failed to parse WebSocket message from server {ServerId}", serverId);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error handling message from server {ServerId}", serverId);
        }
    }

    private async Task HandleEvent(int serverId, BaseAgentMessage baseMessage, JsonSerializerOptions options)
    {
        switch (baseMessage.Action)
        {
            case AgentActions.Metrics:
                var metrics = baseMessage.Payload.Deserialize<MetricsPayload>(options);
                if (metrics != null)
                {
                    await ProcessMetrics(serverId, metrics);
                }
                break;

            case AgentActions.WatchlistMetrics:
                var watchlistMetrics = baseMessage.Payload.Deserialize<BusinessLayer.DTOs.Agent.Watchlist.WatchlistMetricsPayload>(options);
                if (watchlistMetrics != null)
                {
                    await ProcessWatchlistMetrics(serverId, watchlistMetrics);
                }
                break;

            case AgentActions.BackupCompleted:
                var backupEvent = baseMessage.Payload.Deserialize<BusinessLayer.DTOs.Agent.Backup.BackupCompletedEvent>(options);
                if (backupEvent != null)
                {
                    await ProcessBackupCompleted(serverId, backupEvent);
                }
                else
                {
                    _logger.LogWarning("Failed to deserialize backup-completed payload for server {ServerId}", serverId);
                }
                break;

            case AgentActions.IntegrityCheckCompleted:
                var integrityEvent = baseMessage.Payload.Deserialize<BusinessLayer.DTOs.Agent.Backup.IntegrityCheckCompletedEvent>(options);
                if (integrityEvent != null)
                {
                    await ProcessIntegrityCheckCompleted(serverId, integrityEvent);
                }
                else
                {
                    _logger.LogWarning("Failed to deserialize integrity-check-completed payload for server {ServerId}", serverId);
                }
                break;

            default:
                _logger.LogWarning("Unknown event action: {Action} from server {ServerId}", baseMessage.Action, serverId);
                break;
        }
    }

    private async Task HandleResponse(int serverId, BaseAgentMessage baseMessage, JsonSerializerOptions options)
    {        
        // Serialize the full message for the waiting handler
        var responseJson = JsonSerializer.Serialize(baseMessage, options);
                
        // Complete the pending request
        var completed = _requestResponseManager.CompleteRequest(baseMessage.Id, responseJson);
        
        if (!completed)
        {
            _logger.LogWarning(
                "⚠️ Response with ID {ResponseId} from server {ServerId} for action '{Action}' did not match any pending request. " +
                "Attempting to find matching request by action...",
                baseMessage.Id, serverId, baseMessage.Action);
            
            // Try to find a pending request for the same action and server (ID mismatch recovery)
            var pendingRequests = _requestResponseManager.GetPendingRequests()
                .Where(r => r.ServerId == serverId && r.Action == baseMessage.Action)
                .ToList();
            
            if (pendingRequests.Count == 1)
            {
                // Found exactly one matching request - complete it
                var matchedRequest = pendingRequests[0];
                _logger.LogInformation(
                    "🔧 Found matching pending request {MessageId} for action '{Action}' on server {ServerId}. " +
                    "Agent responded with ID {ResponseId} but expected {ExpectedId}. Completing request.",
                    matchedRequest.MessageId, baseMessage.Action, serverId, baseMessage.Id, matchedRequest.MessageId);
                
                _requestResponseManager.CompleteRequest(matchedRequest.MessageId, responseJson);
            }
            else if (pendingRequests.Count > 1)
            {
                _logger.LogWarning(
                    "⚠️ Multiple pending requests ({Count}) found for action '{Action}' on server {ServerId}. " +
                    "Cannot auto-match response with ID {ResponseId}.",
                    pendingRequests.Count, baseMessage.Action, serverId, baseMessage.Id);
            }
            else
            {
                _logger.LogDebug(
                    "No pending request found for action '{Action}' on server {ServerId}. " +
                    "Response may have arrived after timeout.",
                    baseMessage.Action, serverId);
            }
        }
    }

    private async Task ProcessMetrics(int serverId, MetricsPayload payload)
    {
        var metricSample = new MetricSample
        {
            MonitoredServerId = serverId,
            TimestampUtc = DateTime.UtcNow,
            CpuUsagePercent = payload.CpuUsagePercent,
            RamUsagePercent = payload.RamUsagePercent,
            RamUsedGb = payload.RamUsedGB,
            UptimeSeconds = payload.UptimeSeconds,
            Load1m = payload.NormalizedLoad.OneMinute,
            Load5m = payload.NormalizedLoad.FiveMinute,
            Load15m = payload.NormalizedLoad.FifteenMinute,
            DiskReadSpeedMBps = payload.DiskReadSpeedMBps,
            DiskWriteSpeedMBps = payload.DiskWriteSpeedMBps
        };

        foreach (var disk in payload.DiskUsage)
        {
            metricSample.DiskPartitions.Add(new DiskPartitionMetric
            {
                Device = disk.Device,
                MountPoint = disk.Mountpoint,
                FileSystemType = disk.Fstype,
                TotalGb = disk.TotalGB,
                UsedGb = disk.UsedGB,
                UsagePercent = disk.UsagePercent
            });
        }

        foreach (var iface in payload.NetworkInterfaces)
        {
            metricSample.NetworkInterfaces.Add(new NetworkInterfaceMetric
            {
                Name = iface.Name,
                MacAddress = iface.Mac ?? string.Empty,
                Ipv4 = iface.Ipv4,
                Ipv6 = iface.Ipv6,
                UploadSpeedMbps = iface.UploadSpeedMbps,
                DownloadSpeedMbps = iface.DownloadSpeedMbps
            });
        }

        _dbContext.MetricSamples.Add(metricSample);
        await _dbContext.SaveChangesAsync();

        // 🆕 Log successful save
        _logger.LogInformation("✅ Saved metrics to DB for server {ServerId} - Metric ID: {MetricId}", 
            serverId, metricSample.Id);

        var metricDto = new MetricDto
        {
            Id = metricSample.Id,
            MonitoredServerId = serverId,
            TimestampUtc = metricSample.TimestampUtc,
            CpuUsagePercent = metricSample.CpuUsagePercent,
            RamUsagePercent = metricSample.RamUsagePercent,
            RamUsedGb = metricSample.RamUsedGb,
            UptimeSeconds = metricSample.UptimeSeconds,
            Load1m = metricSample.Load1m,
            Load5m = metricSample.Load5m,
            Load15m = metricSample.Load15m,
            DiskReadSpeedMBps = metricSample.DiskReadSpeedMBps,
            DiskWriteSpeedMBps = metricSample.DiskWriteSpeedMBps,
            DiskPartitions = metricSample.DiskPartitions.Select(d => new DiskPartitionDto
            {
                Device = d.Device,
                MountPoint = d.MountPoint,
                FileSystemType = d.FileSystemType,
                TotalGb = d.TotalGb,
                UsedGb = d.UsedGb,
                UsagePercent = d.UsagePercent
            }).ToList(),
            NetworkInterfaces = metricSample.NetworkInterfaces.Select(n => new NetworkInterfaceDto
            {
                Name = n.Name,
                MacAddress = n.MacAddress,
                Ipv4 = n.Ipv4,
                Ipv6 = n.Ipv6,
                UploadSpeedMbps = n.UploadSpeedMbps,
                DownloadSpeedMbps = n.DownloadSpeedMbps
            }).ToList()
        };

        await _monitoringHubContext.Clients.Group($"server-{serverId}").SendAsync("MetricsUpdated", metricDto);

        _logger.LogDebug("📡 Broadcast metrics via SignalR for server {ServerId}", serverId);

        // Evaluate alert rules against these metrics
        await _alertService.EvaluateMetricsAsync(serverId, payload);
    }

    private async Task ProcessWatchlistMetrics(int serverId, BusinessLayer.DTOs.Agent.Watchlist.WatchlistMetricsPayload payload)
    {
        _logger.LogInformation("Received watchlist metrics for server {ServerId}: {ServiceCount} services, {ProcessCount} processes", 
            serverId, payload.Services.Count, payload.Processes.Count);

        // Broadcast via SignalR to subscribed frontend clients
        await _monitoringHubContext.Clients.Group($"server-{serverId}").SendAsync("WatchlistMetricsUpdated", new
        {
            ServerId = serverId,
            TimestampUtc = DateTime.UtcNow,
            Services = payload.Services,
            Processes = payload.Processes
        });

        _logger.LogDebug("Broadcast watchlist metrics for server {ServerId}", serverId);

        // Process watchlist metrics for auto-restart and alerts
        await _watchlistAutoRestartService.ProcessWatchlistMetricsAsync(serverId, payload);
        
        // Evaluate alert rules for processes (existing alert system)
        await _alertService.EvaluateWatchlistMetricsAsync(serverId, payload);
    }

    /// <summary>
    /// Handle request failures (max retries exceeded)
    /// </summary>
    private async void HandleRequestFailed(PendingRequest request)
    {
        try
        {
            // Broadcast command failed notification to ALL connected clients via NotificationHub
            await _notificationHubContext.BroadcastCommandFailed(
                request.ServerId,
                request.Action,
                request.MessageId,
                $"Command '{request.Action}' failed after {request.RetryCount} retries",
                request.RetryCount,
                _logger);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to broadcast CommandFailed event");
        }
    }

    /// <summary>
    /// Process backup-completed event from agent
    /// </summary>
    private async Task ProcessBackupCompleted(int serverId, BusinessLayer.DTOs.Agent.Backup.BackupCompletedEvent backupEvent)
    {
        _logger.LogInformation(
            "Backup completed event received for server {ServerId}, TaskId: {TaskId}, Status: {Status}",
            serverId, backupEvent.TaskId, backupEvent.Result.Status);

        try
        {
            // Parse taskId (which is the backup log ID)
            if (!Guid.TryParse(backupEvent.TaskId, out var taskId))
            {
                _logger.LogError("Invalid taskId format in backup-completed event: {TaskId}", backupEvent.TaskId);
                return;
            }

            // Find the backup log entry
            var log = await _dbContext.BackupLogs.FindAsync(taskId);
            if (log == null)
            {
                _logger.LogWarning("Backup log not found for taskId {TaskId}", taskId);
                return;
            }

            // Store short snapshot ID (first 8 characters) for consistency with restic
            var shortSnapshotId = !string.IsNullOrEmpty(backupEvent.Result.SnapshotId) && backupEvent.Result.SnapshotId.Length >= 8
                ? backupEvent.Result.SnapshotId[..8]
                : backupEvent.Result.SnapshotId;

            // Update log with results
            log.Status = backupEvent.Result.Status == "ok" ? "success" : "error";
            log.Message = backupEvent.Result.Status == "ok" ? "Backup completed successfully" : "Backup failed";
            log.SnapshotId = shortSnapshotId;
            log.FilesNew = backupEvent.Result.FilesNew;
            log.DataAdded = backupEvent.Result.DataAdded;
            log.DurationSeconds = backupEvent.Result.Duration;
            log.ErrorMessage = backupEvent.Result.ErrorMessage;

            await _dbContext.SaveChangesAsync();

            _logger.LogInformation(
                "Updated backup log {LogId} with status {Status}, SnapshotId: {SnapshotId}",
                taskId, log.Status, log.SnapshotId);

            // Update job status using ExecuteUpdateAsync for reliable update
            _logger.LogInformation("🔍 Updating backup job {JobId} status to '{Status}'", log.JobId, log.Status);
            
            var updatedRows = await _dbContext.BackupJobs
                .Where(j => j.Id == log.JobId)
                .ExecuteUpdateAsync(setters => setters
                    .SetProperty(j => j.LastRunStatus, log.Status)
                    .SetProperty(j => j.LastRunAtUtc, DateTime.UtcNow));
            
            if (updatedRows > 0)
            {
                _logger.LogInformation(
                    "✅ Successfully updated job {JobId}: Status='{Status}', Rows affected={Rows}",
                    log.JobId, log.Status, updatedRows);
            }
            else
            {
                _logger.LogError("❌ Failed to update backup job {JobId} - no rows affected", log.JobId);
            }

            _logger.LogInformation(
                "Backup processing completed for log {LogId} and job {JobId}. Now broadcasting notification...",
                taskId, log.JobId);

            // Broadcast backup completion notification to ALL connected clients via NotificationHub
            await _notificationHubContext.BroadcastBackupCompleted(
                serverId,
                log.JobId,
                taskId,
                log.Status,
                log.Message ?? "Backup completed",
                log.SnapshotId,
                log.FilesNew,
                log.DataAdded,
                log.DurationSeconds,
                log.ErrorMessage,
                _logger);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "❌ Error in ProcessBackupCompleted for server {ServerId}, TaskId: {TaskId}", 
                serverId, backupEvent.TaskId);
        }
    }

    /// <summary>
    /// Process integrity-check-completed event from agent
    /// </summary>
    private async Task ProcessIntegrityCheckCompleted(int serverId, BusinessLayer.DTOs.Agent.Backup.IntegrityCheckCompletedEvent integrityEvent)
    {
        _logger.LogInformation(
            "Integrity check completed event received for server {ServerId}, TaskId: {TaskId}, Status: {Status}",
            serverId, integrityEvent.TaskId, integrityEvent.Result.Status);

        try
        {
            // Parse taskId (which is the backup log ID used for tracking)
            if (!Guid.TryParse(integrityEvent.TaskId, out var taskId))
            {
                _logger.LogError("Invalid taskId format in integrity-check-completed event: {TaskId}", integrityEvent.TaskId);
                return;
            }

            // Find the backup log entry (we reuse backup_logs table for integrity checks)
            var log = await _dbContext.BackupLogs.FindAsync(taskId);
            if (log == null)
            {
                _logger.LogWarning("Backup log not found for integrity check taskId {TaskId}", taskId);
                return;
            }

            // Update log with results - use Message for description, ErrorMessage only for errors
            log.Status = integrityEvent.Result.Status == "ok" ? "success" : "error";
            log.Message = integrityEvent.Result.Status == "ok" 
                ? "Integrity check passed" 
                : "Integrity check failed";
            
            if (integrityEvent.Result.Status != "ok")
            {
                log.ErrorMessage = integrityEvent.Result.Message;
            }
            log.DurationSeconds = 0;

            await _dbContext.SaveChangesAsync();

            _logger.LogInformation(
                "Updated integrity check log {LogId} for job {JobId} with status {Status}. Now broadcasting notification...",
                taskId, log.JobId, log.Status);

            // Broadcast integrity check completion notification to ALL connected clients via NotificationHub
            await _notificationHubContext.BroadcastIntegrityCheckCompleted(
                serverId,
                log.JobId,
                taskId,
                log.Status,
                log.Message ?? "Integrity check completed",
                log.ErrorMessage,
                _logger);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "❌ Error in ProcessIntegrityCheckCompleted for server {ServerId}, TaskId: {TaskId}", 
                serverId, integrityEvent.TaskId);
        }
    }
}
