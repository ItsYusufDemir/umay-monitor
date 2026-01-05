using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Logging;

namespace BusinessLayer.Hubs;

/// <summary>
/// SignalR Hub for broadcasting notifications to all authenticated users.
/// Unlike MonitoringHub which uses server-specific groups, this hub broadcasts to all connected clients.
/// 
/// Events broadcast through this hub:
/// - BackupCompleted: When a backup operation completes (success or error)
/// - IntegrityCheckCompleted: When an integrity check completes
/// - CommandFailed: When a command to an agent fails after retries
/// - AlertTriggered: When an alert rule is triggered (future)
/// </summary>
[Authorize]
public class NotificationHub : Hub
{
    private readonly ILogger<NotificationHub> _logger;

    public NotificationHub(ILogger<NotificationHub> logger)
    {
        _logger = logger;
    }

    public override async Task OnConnectedAsync()
    {
        _logger.LogInformation("?? NotificationHub: Client connected - ConnectionId: {ConnectionId}", 
            Context.ConnectionId[..8] + "...");
        await base.OnConnectedAsync();
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        _logger.LogInformation("?? NotificationHub: Client disconnected - ConnectionId: {ConnectionId}", 
            Context.ConnectionId[..8] + "...");
        
        if (exception != null)
        {
            _logger.LogWarning(exception, "NotificationHub: Client disconnected with error");
        }
        
        await base.OnDisconnectedAsync(exception);
    }
}

/// <summary>
/// Extension methods for broadcasting notifications via NotificationHub
/// </summary>
public static class NotificationHubExtensions
{
    /// <summary>
    /// Broadcast a backup completed notification to all connected clients
    /// </summary>
    public static async Task BroadcastBackupCompleted(
        this IHubContext<NotificationHub> hubContext,
        int serverId,
        Guid jobId,
        Guid taskId,
        string status,
        string message,
        string? snapshotId,
        int? filesNew,
        long? dataAdded,
        double? durationSeconds,
        string? errorMessage,
        ILogger? logger = null)
    {
        var notification = new
        {
            Type = "BackupCompleted",
            ServerId = serverId,
            JobId = jobId,
            TaskId = taskId,
            Status = status,
            Message = message,
            SnapshotId = snapshotId,
            FilesNew = filesNew,
            DataAdded = dataAdded,
            DurationSeconds = durationSeconds,
            ErrorMessage = errorMessage,
            Timestamp = DateTime.UtcNow
        };

        logger?.LogInformation("?? Broadcasting BackupCompleted notification to all clients for job {JobId}", jobId);
        
        await hubContext.Clients.All.SendAsync("BackupCompleted", notification);
        
        logger?.LogInformation("? BackupCompleted notification broadcast successfully");
    }

    /// <summary>
    /// Broadcast an integrity check completed notification to all connected clients
    /// </summary>
    public static async Task BroadcastIntegrityCheckCompleted(
        this IHubContext<NotificationHub> hubContext,
        int serverId,
        Guid jobId,
        Guid taskId,
        string status,
        string message,
        string? errorMessage,
        ILogger? logger = null)
    {
        var notification = new
        {
            Type = "IntegrityCheckCompleted",
            ServerId = serverId,
            JobId = jobId,
            TaskId = taskId,
            Status = status,
            Message = message,
            ErrorMessage = errorMessage,
            Timestamp = DateTime.UtcNow
        };

        logger?.LogInformation("?? Broadcasting IntegrityCheckCompleted notification to all clients for job {JobId}", jobId);
        
        await hubContext.Clients.All.SendAsync("IntegrityCheckCompleted", notification);
        
        logger?.LogInformation("? IntegrityCheckCompleted notification broadcast successfully");
    }

    /// <summary>
    /// Broadcast a command failed notification to all connected clients
    /// </summary>
    public static async Task BroadcastCommandFailed(
        this IHubContext<NotificationHub> hubContext,
        int serverId,
        string action,
        int messageId,
        string message,
        int retryCount,
        ILogger? logger = null)
    {
        var notification = new
        {
            Type = "CommandFailed",
            ServerId = serverId,
            Action = action,
            MessageId = messageId,
            Message = message,
            RetryCount = retryCount,
            Timestamp = DateTime.UtcNow
        };

        logger?.LogInformation("?? Broadcasting CommandFailed notification to all clients for action '{Action}' on server {ServerId}", 
            action, serverId);
        
        await hubContext.Clients.All.SendAsync("CommandFailed", notification);
        
        logger?.LogInformation("? CommandFailed notification broadcast successfully");
    }
}
