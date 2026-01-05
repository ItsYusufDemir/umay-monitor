using BusinessLayer.DTOs.Agent.ServiceManagement;
using BusinessLayer.DTOs.Agent.Watchlist;
using BusinessLayer.Services.Interfaces;
using Infrastructure;
using Infrastructure.Entities;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using BusinessLayer.Hubs;

namespace BusinessLayer.Services.Concrete;

/// <summary>
/// Handles automatic service restart logic for watchlist items
/// </summary>
public class WatchlistAutoRestartService : IWatchlistAutoRestartService
{
    private readonly IServiceRestartTracker _restartTracker;
    private readonly IAgentCommandService _commandService;
    private readonly ITelegramNotificationService _telegramService;
    private readonly ServerMonitoringDbContext _dbContext;
    private readonly IHubContext<AlertHub> _alertHubContext;
    private readonly ILogger<WatchlistAutoRestartService> _logger;

    public WatchlistAutoRestartService(
        IServiceRestartTracker restartTracker,
        IAgentCommandService commandService,
        ITelegramNotificationService telegramService,
        ServerMonitoringDbContext dbContext,
        IHubContext<AlertHub> alertHubContext,
        ILogger<WatchlistAutoRestartService> logger)
    {
        _restartTracker = restartTracker;
        _commandService = commandService;
        _telegramService = telegramService;
        _dbContext = dbContext;
        _alertHubContext = alertHubContext;
        _logger = logger;
    }

    public async Task ProcessWatchlistMetricsAsync(int serverId, WatchlistMetricsPayload payload)
    {
        _logger.LogInformation(
            "Processing watchlist metrics for server {ServerId}: {ServiceCount} services, {ProcessCount} processes",
            serverId, payload.Services.Count, payload.Processes.Count);

        // Process services - attempt auto-restart if offline
        foreach (var serviceWrapper in payload.Services)
        {
            if (serviceWrapper.Data != null)
            {
                await ProcessServiceAsync(serverId, serviceWrapper);
            }
        }

        // Process processes - only send alerts if offline (no restart)
        foreach (var processWrapper in payload.Processes)
        {
            if (processWrapper.Data != null || !string.IsNullOrEmpty(processWrapper.Message))
            {
                await ProcessProcessAsync(serverId, processWrapper);
            }
        }
    }

    private async Task ProcessServiceAsync(int serverId, WatchlistServiceWrapper serviceWrapper)
    {
        var serviceName = serviceWrapper.Data!.Name;
        var isOnline = serviceWrapper.Data.ActiveState?.ToLower() == "active";

        if (isOnline)
        {
            // Service is online
            var previousAttempts = _restartTracker.GetAttemptCount(serverId, serviceName);
            var wasAlertSent = _restartTracker.WasFailureAlertSent(serverId, serviceName);
            
            if (previousAttempts > 0 || wasAlertSent)
            {
                _logger.LogInformation(
                    "Service {ServiceName} on server {ServerId} is back online (previous attempts: {Attempts}, alert sent: {AlertSent})",
                    serviceName, serverId, previousAttempts, wasAlertSent);

                // Reset all tracking (attempts + alert state)
                _restartTracker.ResetAttempts(serverId, serviceName);

                // Send recovery alert if failure alert was sent before
                if (wasAlertSent)
                {
                    await SendServiceRecoveryAlertAsync(serverId, serviceName, previousAttempts);
                }

                // Broadcast recovery notification to SignalR
                await _alertHubContext.Clients.Group($"server-{serverId}")
                    .SendAsync("ServiceRecovered", new
                    {
                        ServerId = serverId,
                        ServiceName = serviceName,
                        Timestamp = DateTime.UtcNow,
                        PreviousAttempts = previousAttempts
                    });
            }

            return;
        }

        // Service is offline
        _logger.LogWarning(
            "Service {ServiceName} on server {ServerId} is offline (ActiveState: {ActiveState})",
            serviceName, serverId, serviceWrapper.Data.ActiveState);

        // Check if we've already reached max attempts AND already sent alert
        if (_restartTracker.HasReachedMaxAttempts(serverId, serviceName))
        {
            // Only send alert if we haven't sent it yet
            if (!_restartTracker.WasFailureAlertSent(serverId, serviceName))
            {
                _logger.LogError(
                    "Service {ServiceName} on server {ServerId} failed after {Attempts} restart attempts. Sending alert.",
                    serviceName, serverId, 3);

                await SendServiceFailureAlertAsync(serverId, serviceName);
                _restartTracker.MarkFailureAlertSent(serverId, serviceName);
            }
            else
            {
                _logger.LogDebug(
                    "Service {ServiceName} on server {ServerId} still offline, but alert already sent. Skipping duplicate alert.",
                    serviceName, serverId);
            }
            
            return;
        }

        // Check if we're in cooldown period
        if (_restartTracker.IsInCooldown(serverId, serviceName))
        {
            _logger.LogDebug(
                "Service {ServiceName} on server {ServerId} is in cooldown period. Skipping restart attempt.",
                serviceName, serverId);
            return;
        }

        // Attempt restart
        await AttemptServiceRestartAsync(serverId, serviceName);
    }

    private async Task ProcessProcessAsync(int serverId, WatchlistProcessWrapper processWrapper)
    {
        // Use cmdline as the primary identifier since watchlist processes are tracked by cmdline
        // Fall back to name only if cmdline is not available
        var processName = processWrapper.Data?.Cmdline;
        if (string.IsNullOrEmpty(processName))
        {
            processName = processWrapper.Data?.Name;
        }
        if (string.IsNullOrEmpty(processName) && !string.IsNullOrEmpty(processWrapper.Message))
        {
            // Try to extract cmdline from the message (format: "...cmdline: <cmdline>")
            var cmdlineIndex = processWrapper.Message.IndexOf("cmdline:", StringComparison.OrdinalIgnoreCase);
            if (cmdlineIndex >= 0)
            {
                processName = processWrapper.Message.Substring(cmdlineIndex + 8).Trim();
            }
        }
        if (string.IsNullOrEmpty(processName))
        {
            processName = "unknown";
        }
        var isOnline = processWrapper.Status?.ToLower() == "ok" && processWrapper.Data != null;

        if (isOnline)
        {
            // Process is online
            var wasAlertSent = _restartTracker.WasProcessOfflineAlertSent(serverId, processName);
            
            if (wasAlertSent)
            {
                _logger.LogInformation(
                    "Process {ProcessName} on server {ServerId} is back online",
                    processName, serverId);

                // Reset alert tracking
                _restartTracker.ResetProcessAlerts(serverId, processName);

                // Send recovery alert
                await SendProcessRecoveryAlertAsync(serverId, processName);
            }
        }
        else
        {
            // Process is offline
            _logger.LogWarning(
                "Process {ProcessName} on server {ServerId} is offline or not found",
                processName, serverId);

            // Only send alert if we haven't sent it yet
            if (!_restartTracker.WasProcessOfflineAlertSent(serverId, processName))
            {
                await SendProcessOfflineAlertAsync(serverId, processName, processWrapper.Message);
                _restartTracker.MarkProcessOfflineAlertSent(serverId, processName);
            }
            else
            {
                _logger.LogDebug(
                    "Process {ProcessName} on server {ServerId} still offline, but alert already sent. Skipping duplicate alert.",
                    processName, serverId);
            }
        }
    }

    private async Task AttemptServiceRestartAsync(int serverId, string serviceName)
    {
        try
        {
            // Record the attempt
            var attemptNumber = _restartTracker.RecordAttempt(serverId, serviceName);

            _logger.LogInformation(
                "Attempting to restart service {ServiceName} on server {ServerId} (Attempt {Attempt}/3)",
                serviceName, serverId, attemptNumber);

            // Send restart command
            var request = new RestartServiceRequest { Name = serviceName };
            
            // Use fire-and-forget as we'll get the result in next watchlist metrics
            await _commandService.SendCommandToAgentAsync(serverId, "restart-service", request);

            // Set cooldown period (20 seconds)
            _restartTracker.SetCooldown(serverId, serviceName);

            // Get server name for the broadcast
            var server = await _dbContext.MonitoredServers.FindAsync(serverId);
            var serverName = server?.Name ?? $"Server {serverId}";

            // Broadcast restart attempt notification to ALL clients
            await _alertHubContext.Clients.All.SendAsync("ServiceRestartAttempted", new
            {
                ServerId = serverId,
                ServerName = serverName,
                ServiceName = serviceName,
                AttemptNumber = attemptNumber,
                MaxAttempts = 3,
                Timestamp = DateTime.UtcNow
            });

            _logger.LogInformation(
                "Restart command sent for service {ServiceName} on server {ServerId}. Waiting {Cooldown}s before next attempt.",
                serviceName, serverId, 20);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex,
                "Error sending restart command for service {ServiceName} on server {ServerId}",
                serviceName, serverId);
        }
    }

    private async Task SendServiceFailureAlertAsync(int serverId, string serviceName)
    {
        try
        {
            // Get server name
            var server = await _dbContext.MonitoredServers.FindAsync(serverId);
            var serverName = server?.Name ?? $"Server {serverId}";

            // Create alert in database
            var alert = new Alert
            {
                CreatedAtUtc = DateTime.UtcNow,
                Title = $"Service Offline: {serviceName}",
                Message = $"Service '{serviceName}' failed to restart after 3 attempts. Manual intervention required.",
                Severity = "Critical",
                MonitoredServerId = serverId,
                IsAcknowledged = false
            };

            _dbContext.Alerts.Add(alert);
            await _dbContext.SaveChangesAsync();

            _logger.LogError(
                "Alert created: Service {ServiceName} on server {ServerId} failed to restart after 3 attempts",
                serviceName, serverId);

            // Broadcast to ALL connected clients via AlertHub
            await _alertHubContext.BroadcastServiceOfflineAlert(
                alert.Id,
                serverId,
                serverName,
                serviceName,
                alert.Message,
                _logger);

            // Send Telegram notification
            await _telegramService.SendAlertAsync(alert);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex,
                "Error sending service failure alert for {ServiceName} on server {ServerId}",
                serviceName, serverId);
        }
    }

    private async Task SendServiceRecoveryAlertAsync(int serverId, string serviceName, int previousAttempts)
    {
        try
        {
            // Get server name
            var server = await _dbContext.MonitoredServers.FindAsync(serverId);
            var serverName = server?.Name ?? $"Server {serverId}";

            // Create recovery alert in database
            var alert = new Alert
            {
                CreatedAtUtc = DateTime.UtcNow,
                Title = $"Service Recovered: {serviceName}",
                Message = $"Service '{serviceName}' is back online after {previousAttempts} restart attempts.",
                Severity = "Info",
                MonitoredServerId = serverId,
                IsAcknowledged = false
            };

            _dbContext.Alerts.Add(alert);
            await _dbContext.SaveChangesAsync();

            _logger.LogInformation(
                "Recovery alert created: Service {ServiceName} on server {ServerId} is back online",
                serviceName, serverId);

            // Broadcast to ALL connected clients via AlertHub
            await _alertHubContext.Clients.All.SendAsync("AlertTriggered", new
            {
                Type = "ServiceRecovered",
                AlertId = alert.Id,
                ServerId = serverId,
                ServerName = serverName,
                ServiceName = serviceName,
                Severity = alert.Severity,
                Message = alert.Message,
                Timestamp = alert.CreatedAtUtc
            });

            _logger.LogInformation("? ServiceRecovered alert broadcast successfully");

            // Send Telegram notification
            await _telegramService.SendAlertAsync(alert);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex,
                "Error sending service recovery alert for {ServiceName} on server {ServerId}",
                serviceName, serverId);
        }
    }

    private async Task SendProcessOfflineAlertAsync(int serverId, string processName, string? errorMessage)
    {
        try
        {
            // Get server name
            var server = await _dbContext.MonitoredServers.FindAsync(serverId);
            var serverName = server?.Name ?? $"Server {serverId}";

            // Create alert in database
            var alert = new Alert
            {
                CreatedAtUtc = DateTime.UtcNow,
                Title = $"Process Offline: {processName}",
                Message = $"Process '{processName}' is not running or not found.",
                Severity = "Critical",
                MonitoredServerId = serverId,
                IsAcknowledged = false
            };

            _dbContext.Alerts.Add(alert);
            await _dbContext.SaveChangesAsync();

            _logger.LogWarning(
                "Alert created: Process {ProcessName} on server {ServerId} is offline",
                processName, serverId);

            // Broadcast to ALL connected clients via AlertHub
            await _alertHubContext.BroadcastProcessOfflineAlert(
                alert.Id,
                serverId,
                serverName,
                processName,
                alert.Message,
                _logger);

            // Send Telegram notification
            await _telegramService.SendAlertAsync(alert);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex,
                "Error sending process offline alert for {ProcessName} on server {ServerId}",
                processName, serverId);
        }
    }

    private async Task SendProcessRecoveryAlertAsync(int serverId, string processName)
    {
        try
        {
            // Get server name
            var server = await _dbContext.MonitoredServers.FindAsync(serverId);
            var serverName = server?.Name ?? $"Server {serverId}";

            // Create recovery alert in database
            var alert = new Alert
            {
                CreatedAtUtc = DateTime.UtcNow,
                Title = $"Process Recovered: {processName}",
                Message = $"Process '{processName}' is back online and running normally.",
                Severity = "Info",
                MonitoredServerId = serverId,
                IsAcknowledged = false
            };

            _dbContext.Alerts.Add(alert);
            await _dbContext.SaveChangesAsync();

            _logger.LogInformation(
                "Recovery alert created: Process {ProcessName} on server {ServerId} is back online",
                processName, serverId);

            // Broadcast to ALL connected clients via AlertHub
            await _alertHubContext.Clients.All.SendAsync("AlertTriggered", new
            {
                Type = "ProcessRecovered",
                AlertId = alert.Id,
                ServerId = serverId,
                ServerName = serverName,
                ProcessName = processName,
                Severity = alert.Severity,
                Message = alert.Message,
                Timestamp = alert.CreatedAtUtc
            });

            _logger.LogInformation("? ProcessRecovered alert broadcast successfully");

            // Send Telegram notification
            await _telegramService.SendAlertAsync(alert);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex,
                "Error sending process recovery alert for {ProcessName} on server {ServerId}",
                processName, serverId);
        }
    }
}
