using BusinessLayer.DTOs.Agent;
using BusinessLayer.Services.Interfaces;
using Infrastructure;
using Infrastructure.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.AspNetCore.SignalR;
using BusinessLayer.Hubs;

namespace BusinessLayer.Services.Concrete;

public class AlertService : IAlertService
{
    private readonly ServerMonitoringDbContext _dbContext;
    private readonly ILogger<AlertService> _logger;
    private readonly ITelegramNotificationService _telegramService;
    private readonly IHubContext<AlertHub> _alertHubContext;

    public AlertService(
        ServerMonitoringDbContext dbContext,
        ILogger<AlertService> logger,
        ITelegramNotificationService telegramService,
        IHubContext<AlertHub> alertHubContext)
    {
        _dbContext = dbContext;
        _logger = logger;
        _telegramService = telegramService;
        _alertHubContext = alertHubContext;
    }

    public async Task EvaluateMetricsAsync(int serverId, MetricsPayload metrics)
    {
        try
        {
            var activeRules = await GetActiveRulesForServerAsync(serverId);
            
            if (!activeRules.Any())
            {
                return; // No rules to evaluate
            }

            foreach (var rule in activeRules)
            {
                bool thresholdExceeded = false;
                string alertMessage = "";
                double actualValue = 0;

                switch (rule.TargetType)
                {
                    case AlertTargetType.Server:
                        (thresholdExceeded, alertMessage, actualValue) = EvaluateServerMetrics(rule, metrics);
                        break;

                    case AlertTargetType.Disk:
                        (thresholdExceeded, alertMessage, actualValue) = EvaluateDiskMetrics(rule, metrics);
                        break;

                    case AlertTargetType.Network:
                        (thresholdExceeded, alertMessage, actualValue) = EvaluateNetworkMetrics(rule, metrics);
                        break;

                    case AlertTargetType.Process:
                        // Process metrics are evaluated separately (not in MetricsPayload)
                        continue;
                }

                if (thresholdExceeded)
                {
                    // Check cooldown before triggering
                    if (await CanTriggerAlertAsync(rule.Id, serverId))
                    {
                        await TriggerAlertAsync(rule, serverId, alertMessage, actualValue);
                    }
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error evaluating metrics for server {ServerId}", serverId);
        }
    }

    // ?? NEW METHOD: Evaluate watchlist metrics (services and processes)
    public async Task EvaluateWatchlistMetricsAsync(int serverId, BusinessLayer.DTOs.Agent.Watchlist.WatchlistMetricsPayload watchlistMetrics)
    {
        try
        {
            _logger.LogInformation("?? Evaluating watchlist metrics for server {ServerId}: {ServiceCount} services, {ProcessCount} processes",
                serverId, watchlistMetrics.Services.Count, watchlistMetrics.Processes.Count);

            var activeRules = await GetActiveRulesForServerAsync(serverId);
            
            if (!activeRules.Any())
            {
                _logger.LogDebug("No active alert rules found for server {ServerId}", serverId);
                return;
            }

            // Filter to process and service rules
            var processRules = activeRules.Where(r => r.TargetType == AlertTargetType.Process).ToList();
            var serviceRules = activeRules.Where(r => r.TargetType == AlertTargetType.Service).ToList();

            _logger.LogInformation("Found {ProcessCount} process and {ServiceCount} service alert rules for server {ServerId}", 
                processRules.Count, serviceRules.Count, serverId);

            // Evaluate process rules
            foreach (var rule in processRules)
            {
                _logger.LogInformation("?? Checking process rule ID {RuleId}: TargetId='{TargetId}', Metric={Metric}, Threshold={Threshold}",
                    rule.Id, rule.TargetId, rule.Metric, rule.ThresholdValue);

                bool thresholdExceeded = false;
                string alertMessage = "";
                double actualValue = 0;

                (thresholdExceeded, alertMessage, actualValue) = EvaluateProcessMetrics(rule, watchlistMetrics);

                if (thresholdExceeded)
                {
                    _logger.LogWarning("?? Threshold exceeded! Checking cooldown...");
                    if (await CanTriggerAlertAsync(rule.Id, serverId))
                    {
                        _logger.LogWarning("? Triggering alert for rule {RuleId}", rule.Id);
                        await TriggerAlertAsync(rule, serverId, alertMessage, actualValue);
                    }
                    else
                    {
                        _logger.LogInformation("?? Alert suppressed due to cooldown period for rule {RuleId}", rule.Id);
                    }
                }
                else
                {
                    _logger.LogDebug("? Rule {RuleId} condition not met", rule.Id);
                }
            }

            // Evaluate service rules
            foreach (var rule in serviceRules)
            {
                _logger.LogInformation("?? Checking service rule ID {RuleId}: TargetId='{TargetId}', Metric={Metric}, Threshold={Threshold}",
                    rule.Id, rule.TargetId, rule.Metric, rule.ThresholdValue);

                bool thresholdExceeded = false;
                string alertMessage = "";
                double actualValue = 0;

                (thresholdExceeded, alertMessage, actualValue) = EvaluateServiceMetrics(rule, watchlistMetrics);

                if (thresholdExceeded)
                {
                    _logger.LogWarning("?? Service threshold exceeded! Checking cooldown...");
                    if (await CanTriggerAlertAsync(rule.Id, serverId))
                    {
                        _logger.LogWarning("? Triggering service alert for rule {RuleId}", rule.Id);
                        await TriggerAlertAsync(rule, serverId, alertMessage, actualValue);
                    }
                    else
                    {
                        _logger.LogInformation("?? Service alert suppressed due to cooldown period for rule {RuleId}", rule.Id);
                    }
                }
                else
                {
                    _logger.LogDebug("? Service rule {RuleId} condition not met", rule.Id);
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error evaluating watchlist metrics for server {ServerId}", serverId);
        }
    }

    // ?? NEW METHOD: Evaluate process metrics from watchlist
    private (bool exceeded, string message, double value) EvaluateProcessMetrics(
        AlertRule rule, 
        BusinessLayer.DTOs.Agent.Watchlist.WatchlistMetricsPayload watchlistMetrics)
    {
        if (string.IsNullOrEmpty(rule.TargetId))
        {
            return (false, "Process rule requires TargetId (process name)", 0);
        }

        _logger.LogInformation("Evaluating process rule for '{TargetId}': Metric={Metric}, Threshold={Threshold}", 
            rule.TargetId, rule.Metric, rule.ThresholdValue);

        // Find the process by exact name match in cmdline (unwrap the wrapper)
        var targetProcessWrapper = watchlistMetrics.Processes
            .FirstOrDefault(p => p.Status == "ok" && 
                               p.Data != null &&
                               p.Data.Cmdline != null && 
                               p.Data.Cmdline.Contains(rule.TargetId, StringComparison.OrdinalIgnoreCase));

        if (targetProcessWrapper == null || targetProcessWrapper.Data == null)
        {
            // Process not found - check if there's an error message
            var errorProcess = watchlistMetrics.Processes
                .FirstOrDefault(p => p.Status == "error" && 
                               p.Message != null && 
                               p.Message.Contains(rule.TargetId, StringComparison.OrdinalIgnoreCase));

            if (errorProcess != null)
            {
                _logger.LogWarning("Process '{TargetId}' not found: {Message}", rule.TargetId, errorProcess.Message);
                // Process not running - could be an alert condition
                return (true, $"Process '{rule.TargetId}' not found or not running: {errorProcess.Message}", 0);
            }

            _logger.LogDebug("Process '{TargetId}' not found in watchlist metrics", rule.TargetId);
            return (false, "", 0);
        }

        var targetProcess = targetProcessWrapper.Data;

        // Check if process has valid data
        if (targetProcess.Pid == null || targetProcess.Name == null)
        {
            _logger.LogWarning("Process '{TargetId}' data incomplete", rule.TargetId);
            return (false, "Process data incomplete", 0);
        }

        double actualValue = 0;
        string metricName = "";

        switch (rule.Metric.ToUpper())
        {
            case "PROCESSCPU":
            case "CPU":
                actualValue = targetProcess.CpuPercent ?? 0;
                metricName = "CPU";
                break;

            case "PROCESSMEMORY":
            case "PROCESSRAM":
            case "RAM":
            case "MEMORY":
                actualValue = targetProcess.MemoryMb ?? 0;
                metricName = "Memory";
                break;

            default:
                _logger.LogWarning("Unknown process metric: {Metric}", rule.Metric);
                return (false, $"Unknown process metric: {rule.Metric}", 0);
        }

        _logger.LogInformation("Process '{Name}' (PID: {Pid}): {Metric}={Value} MB (Threshold: {Comparison} {Threshold})",
            targetProcess.Name, targetProcess.Pid, metricName, actualValue, rule.Comparison, rule.ThresholdValue);

        bool exceeded = CompareValue(actualValue, rule.Comparison, rule.ThresholdValue);

        string message = exceeded
            ? $"Process '{targetProcess.Name}' (PID: {targetProcess.Pid}) {metricName} is {actualValue:F2} (threshold: {rule.Comparison} {rule.ThresholdValue})"
            : "";

        if (exceeded)
        {
            _logger.LogWarning("?? Process alert threshold exceeded: {Message}", message);
        }

        return (exceeded, message, actualValue);
    }

    // ?? NEW METHOD: Evaluate service metrics from watchlist
    private (bool exceeded, string message, double value) EvaluateServiceMetrics(
        AlertRule rule,
        BusinessLayer.DTOs.Agent.Watchlist.WatchlistMetricsPayload watchlistMetrics)
    {
        if (string.IsNullOrEmpty(rule.TargetId))
        {
            return (false, "Service rule requires TargetId (service name)", 0);
        }

        _logger.LogInformation("Evaluating service rule for '{TargetId}': Metric={Metric}, Threshold={Threshold}",
            rule.TargetId, rule.Metric, rule.ThresholdValue);

        // Find the service by name (unwrap the wrapper)
        var targetServiceWrapper = watchlistMetrics.Services
            .FirstOrDefault(s => s.Status == "ok" &&
                               s.Data != null &&
                               s.Data.Name != null &&
                               s.Data.Name.Contains(rule.TargetId, StringComparison.OrdinalIgnoreCase));

        if (targetServiceWrapper == null || targetServiceWrapper.Data == null)
        {
            // Service not found - check if there's an error message
            var errorService = watchlistMetrics.Services
                .FirstOrDefault(s => s.Status == "error" &&
                               s.Message != null &&
                               s.Message.Contains(rule.TargetId, StringComparison.OrdinalIgnoreCase));

            if (errorService != null)
            {
                _logger.LogWarning("Service '{TargetId}' not found: {Message}", rule.TargetId, errorService.Message);
                // Service not running - could be an alert condition
                return (true, $"Service '{rule.TargetId}' not found or not running: {errorService.Message}", 0);
            }

            _logger.LogDebug("Service '{TargetId}' not found in watchlist metrics", rule.TargetId);
            return (false, "", 0);
        }

        var targetService = targetServiceWrapper.Data;

        // Check if service has valid data
        if (targetService.Name == null)
        {
            _logger.LogWarning("Service '{TargetId}' data incomplete", rule.TargetId);
            return (false, "Service data incomplete", 0);
        }

        double actualValue = 0;
        string metricName = "";

        switch (rule.Metric.ToUpper())
        {
            case "SERVICECPU":
            case "CPU":
                actualValue = targetService.CpuUsagePercent ?? 0;
                metricName = "CPU";
                break;

            case "SERVICEMEMORY":
            case "SERVICERAM":
            case "RAM":
            case "MEMORY":
                actualValue = targetService.MemoryUsage ?? 0;
                metricName = "Memory";
                break;

            default:
                _logger.LogWarning("Unknown service metric: {Metric}", rule.Metric);
                return (false, $"Unknown service metric: {rule.Metric}", 0);
        }

        _logger.LogInformation("Service '{Name}': {Metric}={Value} MB (Threshold: {Comparison} {Threshold})",
            targetService.Name, metricName, actualValue, rule.Comparison, rule.ThresholdValue);

        bool exceeded = CompareValue(actualValue, rule.Comparison, rule.ThresholdValue);

        string message = exceeded
            ? $"Service '{targetService.Name}' {metricName} is {actualValue:F2} (threshold: {rule.Comparison} {rule.ThresholdValue})"
            : "";

        if (exceeded)
        {
            _logger.LogWarning("?? Service alert threshold exceeded: {Message}", message);
        }

        return (exceeded, message, actualValue);
    }

    private (bool exceeded, string message, double value) EvaluateServerMetrics(AlertRule rule, MetricsPayload metrics)
    {
        double actualValue = rule.Metric.ToUpper() switch
        {
            "CPU" => metrics.CpuUsagePercent,
            "RAM" => metrics.RamUsagePercent,
            "LOAD1M" => metrics.NormalizedLoad.OneMinute,
            "LOAD5M" => metrics.NormalizedLoad.FiveMinute,
            "LOAD15M" => metrics.NormalizedLoad.FifteenMinute,
            _ => 0
        };

        bool exceeded = CompareValue(actualValue, rule.Comparison, rule.ThresholdValue);

        string message = exceeded
            ? $"{rule.Metric} is {actualValue:F2} (threshold: {rule.Comparison} {rule.ThresholdValue})"
            : "";

        return (exceeded, message, actualValue);
    }

    private (bool exceeded, string message, double value) EvaluateDiskMetrics(AlertRule rule, MetricsPayload metrics)
    {
        if (rule.Metric.ToUpper() != "DISKUSAGE")
        {
            return (false, "", 0);
        }

        // Worst-case: check if ANY partition exceeds threshold
        var worstPartition = metrics.DiskUsage
            .OrderByDescending(d => d.UsagePercent)
            .FirstOrDefault();

        if (worstPartition == null)
        {
            return (false, "", 0);
        }

        // If TargetId is specified, check only that specific partition
        if (!string.IsNullOrEmpty(rule.TargetId))
        {
            worstPartition = metrics.DiskUsage
                .FirstOrDefault(d => d.Device == rule.TargetId);

            if (worstPartition == null)
            {
                return (false, "", 0);
            }
        }

        bool exceeded = CompareValue(worstPartition.UsagePercent, rule.Comparison, rule.ThresholdValue);

        string message = exceeded
            ? $"Disk {worstPartition.Device} ({worstPartition.Mountpoint}) usage is {worstPartition.UsagePercent:F2}% (threshold: {rule.Comparison} {rule.ThresholdValue})"
            : "";

        return (exceeded, message, worstPartition.UsagePercent);
    }

    private (bool exceeded, string message, double value) EvaluateNetworkMetrics(AlertRule rule, MetricsPayload metrics)
    {
        var metric = rule.Metric.ToUpper();
        if (metric != "NETWORKUPLOAD" && metric != "NETWORKDOWNLOAD")
        {
            return (false, "", 0);
        }

        // Filter by TargetId if specified (interface name)
        var interfaces = string.IsNullOrEmpty(rule.TargetId)
            ? metrics.NetworkInterfaces
            : metrics.NetworkInterfaces.Where(n => n.Name == rule.TargetId).ToList();

        if (!interfaces.Any())
        {
            return (false, "", 0);
        }

        // Get worst-case (highest value)
        double actualValue = metric == "NETWORKUPLOAD"
            ? interfaces.Max(n => n.UploadSpeedMbps)
            : interfaces.Max(n => n.DownloadSpeedMbps);

        var worstInterface = metric == "NETWORKUPLOAD"
            ? interfaces.OrderByDescending(n => n.UploadSpeedMbps).First()
            : interfaces.OrderByDescending(n => n.DownloadSpeedMbps).First();

        bool exceeded = CompareValue(actualValue, rule.Comparison, rule.ThresholdValue);

        string message = exceeded
            ? $"Network {worstInterface.Name} {(metric == "NETWORKUPLOAD" ? "upload" : "download")} is {actualValue:F2} Mbps (threshold: {rule.Comparison} {rule.ThresholdValue})"
            : "";

        return (exceeded, message, actualValue);
    }

    private bool CompareValue(double actualValue, string comparison, double thresholdValue)
    {
        return comparison switch
        {
            ">" => actualValue > thresholdValue,
            ">=" => actualValue >= thresholdValue,
            "<" => actualValue < thresholdValue,
            "<=" => actualValue <= thresholdValue,
            "==" => Math.Abs(actualValue - thresholdValue) < 0.01,
            _ => false
        };
    }

    private async Task TriggerAlertAsync(AlertRule rule, int serverId, string message, double actualValue)
    {
        try
        {
            // Get server name for the alert
            var server = await _dbContext.MonitoredServers.FindAsync(serverId);
            var serverName = server?.Name ?? $"Server {serverId}";

            // Create alert in database
            var alert = new Alert
            {
                CreatedAtUtc = DateTime.UtcNow,
                Title = $"Alert: {rule.Metric} threshold exceeded",
                Message = message,
                Severity = rule.Severity,
                MonitoredServerId = serverId,
                AlertRuleId = rule.Id,
                IsAcknowledged = false
            };

            _dbContext.Alerts.Add(alert);
            
            // Update the rule's LastTriggeredAtUtc for cooldown tracking
            // This ensures cooldown works even if alerts are deleted
            rule.LastTriggeredAtUtc = DateTime.UtcNow;
            
            await _dbContext.SaveChangesAsync();

            _logger.LogWarning("Alert triggered: {Message} (Server: {ServerId}, Rule: {RuleId}, NextTriggerAfter: {NextTrigger})",
                message, serverId, rule.Id, rule.LastTriggeredAtUtc.Value.AddMinutes(rule.CooldownMinutes));

            // Broadcast to ALL connected clients via AlertHub
            await _alertHubContext.BroadcastMetricThresholdAlert(
                alert.Id,
                serverId,
                serverName,
                rule.Metric,
                actualValue,
                rule.ThresholdValue,
                rule.Comparison,
                rule.Severity,
                _logger);

            // Send Telegram notification
            await _telegramService.SendAlertAsync(alert);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error triggering alert for rule {RuleId} on server {ServerId}",
                rule.Id, serverId);
        }
    }

    public async Task<List<AlertRule>> GetActiveRulesForServerAsync(int serverId)
    {
        return await _dbContext.AlertRules
            .Where(r => r.MonitoredServerId == serverId && r.IsActive)
            .ToListAsync();
    }

    public async Task<bool> CanTriggerAlertAsync(int ruleId, int serverId)
    {
        // Get the rule to check cooldown period
        var rule = await _dbContext.AlertRules.FindAsync(ruleId);
        if (rule == null)
        {
            return false;
        }

        // Check if we're still in cooldown based on the rule's LastTriggeredAtUtc
        if (rule.LastTriggeredAtUtc.HasValue)
        {
            var cooldownEnd = rule.LastTriggeredAtUtc.Value.AddMinutes(rule.CooldownMinutes);
            if (DateTime.UtcNow < cooldownEnd)
            {
                _logger.LogDebug(
                    "Alert rule {RuleId} is in cooldown until {CooldownEnd} (last triggered: {LastTriggered})",
                    ruleId, cooldownEnd, rule.LastTriggeredAtUtc);
                return false;
            }
        }

        return true;
    }
}
