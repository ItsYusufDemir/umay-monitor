using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Logging;

namespace BusinessLayer.Hubs;

/// <summary>
/// SignalR Hub for broadcasting alerts to all authenticated users.
/// Alerts are triggered when alert rules are violated (e.g., CPU > 90%, service offline).
/// 
/// Events broadcast through this hub:
/// - AlertTriggered: When an alert rule condition is met
/// - AlertResolved: When an alert condition is no longer met (future)
/// </summary>
[Authorize]
public class AlertHub : Hub
{
    private readonly ILogger<AlertHub> _logger;

    public AlertHub(ILogger<AlertHub> logger)
    {
        _logger = logger;
    }

    public override async Task OnConnectedAsync()
    {
        _logger.LogInformation("?? AlertHub: Client connected - ConnectionId: {ConnectionId}", 
            Context.ConnectionId[..8] + "...");
        await base.OnConnectedAsync();
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        _logger.LogInformation("?? AlertHub: Client disconnected - ConnectionId: {ConnectionId}", 
            Context.ConnectionId[..8] + "...");
        
        if (exception != null)
        {
            _logger.LogWarning(exception, "AlertHub: Client disconnected with error");
        }
        
        await base.OnDisconnectedAsync(exception);
    }
}

/// <summary>
/// Extension methods for broadcasting alerts via AlertHub
/// </summary>
public static class AlertHubExtensions
{
    /// <summary>
    /// Broadcast an alert triggered notification to all connected clients
    /// </summary>
    public static async Task BroadcastAlertTriggered(
        this IHubContext<AlertHub> hubContext,
        int alertId,
        int serverId,
        string serverName,
        string alertType,
        string severity,
        string message,
        string? metricName,
        double? metricValue,
        double? threshold,
        ILogger? logger = null)
    {
        var alert = new
        {
            Type = "AlertTriggered",
            AlertId = alertId,
            ServerId = serverId,
            ServerName = serverName,
            AlertType = alertType,
            Severity = severity,
            Message = message,
            MetricName = metricName,
            MetricValue = metricValue,
            Threshold = threshold,
            Timestamp = DateTime.UtcNow
        };

        logger?.LogInformation(
            "?? Broadcasting AlertTriggered to all clients: Server={ServerName}, Type={AlertType}, Severity={Severity}",
            serverName, alertType, severity);
        
        await hubContext.Clients.All.SendAsync("AlertTriggered", alert);
        
        logger?.LogInformation("? AlertTriggered notification broadcast successfully");
    }

    /// <summary>
    /// Broadcast a service offline alert to all connected clients
    /// </summary>
    public static async Task BroadcastServiceOfflineAlert(
        this IHubContext<AlertHub> hubContext,
        int alertId,
        int serverId,
        string serverName,
        string serviceName,
        string message,
        ILogger? logger = null)
    {
        var alert = new
        {
            Type = "ServiceOffline",
            AlertId = alertId,
            ServerId = serverId,
            ServerName = serverName,
            ServiceName = serviceName,
            Severity = "critical",
            Message = message,
            Timestamp = DateTime.UtcNow
        };

        logger?.LogInformation(
            "?? Broadcasting ServiceOffline alert to all clients: Server={ServerName}, Service={ServiceName}",
            serverName, serviceName);
        
        await hubContext.Clients.All.SendAsync("AlertTriggered", alert);
        
        logger?.LogInformation("? ServiceOffline alert broadcast successfully");
    }

    /// <summary>
    /// Broadcast a process offline alert to all connected clients
    /// </summary>
    public static async Task BroadcastProcessOfflineAlert(
        this IHubContext<AlertHub> hubContext,
        int alertId,
        int serverId,
        string serverName,
        string processName,
        string message,
        ILogger? logger = null)
    {
        var alert = new
        {
            Type = "ProcessOffline",
            AlertId = alertId,
            ServerId = serverId,
            ServerName = serverName,
            ProcessName = processName,
            Severity = "critical",
            Message = message,
            Timestamp = DateTime.UtcNow
        };

        logger?.LogInformation(
            "?? Broadcasting ProcessOffline alert to all clients: Server={ServerName}, Process={ProcessName}",
            serverName, processName);
        
        await hubContext.Clients.All.SendAsync("AlertTriggered", alert);
        
        logger?.LogInformation("? ProcessOffline alert broadcast successfully");
    }

    /// <summary>
    /// Broadcast a metric threshold alert to all connected clients
    /// </summary>
    public static async Task BroadcastMetricThresholdAlert(
        this IHubContext<AlertHub> hubContext,
        int alertId,
        int serverId,
        string serverName,
        string metricName,
        double currentValue,
        double threshold,
        string comparisonOperator,
        string severity,
        ILogger? logger = null)
    {
        var message = $"{metricName} is {currentValue:F1} ({comparisonOperator} threshold of {threshold:F1})";
        
        var alert = new
        {
            Type = "MetricThreshold",
            AlertId = alertId,
            ServerId = serverId,
            ServerName = serverName,
            MetricName = metricName,
            MetricValue = currentValue,
            Threshold = threshold,
            Operator = comparisonOperator,
            Severity = severity,
            Message = message,
            Timestamp = DateTime.UtcNow
        };

        logger?.LogInformation(
            "?? Broadcasting MetricThreshold alert to all clients: Server={ServerName}, Metric={MetricName}, Value={Value}",
            serverName, metricName, currentValue);
        
        await hubContext.Clients.All.SendAsync("AlertTriggered", alert);
        
        logger?.LogInformation("? MetricThreshold alert broadcast successfully");
    }
}
