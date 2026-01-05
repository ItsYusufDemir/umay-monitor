using BusinessLayer.Services.Interfaces;
using Infrastructure;
using Infrastructure.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Telegram.Bot;
using Telegram.Bot.Exceptions;

namespace BusinessLayer.Services.Concrete;

public class TelegramNotificationService : ITelegramNotificationService
{
    private readonly ServerMonitoringDbContext _dbContext;
    private readonly ILogger<TelegramNotificationService> _logger;

    public TelegramNotificationService(
        ServerMonitoringDbContext dbContext,
        ILogger<TelegramNotificationService> logger)
    {
        _dbContext = dbContext;
        _logger = logger;
    }

    public async Task SendAlertAsync(Alert alert)
    {
        try
        {
            if (!await IsEnabledAsync())
            {
                _logger.LogDebug("Telegram notifications disabled, skipping alert {AlertId}", alert.Id);
                return;
            }

            var settings = await GetSettingsAsync();
            if (settings?.TelegramBotToken == null)
            {
                _logger.LogWarning("Telegram bot token not configured");
                return;
            }

            var chatIds = await _dbContext.TelegramChatIds
                .Where(c => c.NotificationSettingsId == settings.Id)
                .ToListAsync();

            if (!chatIds.Any())
            {
                _logger.LogWarning("No Telegram chat IDs configured");
                return;
            }

            var botClient = new TelegramBotClient(settings.TelegramBotToken);

            var server = await _dbContext.MonitoredServers.FindAsync(alert.MonitoredServerId);
            var serverName = server?.Name ?? $"Server {alert.MonitoredServerId}";

            var alertRule = alert.AlertRuleId.HasValue
                ? await _dbContext.AlertRules.FindAsync(alert.AlertRuleId.Value)
                : null;

            // Severity emojis
            string severityEmoji = alert.Severity.ToLower() switch
            {
                "critical" => "🚨🔥",
                "warning" => "⚠️",
                "info" => "ℹ️",
                _ => "🔔"
            };

            string targetTypeEmoji = "";
            string targetTypeName = "";

            if (alertRule != null)
            {
                (targetTypeEmoji, targetTypeName) = alertRule.TargetType switch
                {
                    AlertTargetType.Server => ("🖥️", "Server"),
                    AlertTargetType.Disk => ("💾", "Disk"),
                    AlertTargetType.Network => ("🌐", "Network"),
                    AlertTargetType.Process => ("⚙️", "Process"),
                    AlertTargetType.Service => ("🧩", "Service"),
                    _ => ("❓", "Unknown")
                };
            }

            var messageBuilder = new System.Text.StringBuilder();

            // Header
            messageBuilder.AppendLine($"{severityEmoji} <b>{alert.Severity.ToUpper()} ALERT</b>");
            messageBuilder.AppendLine("━━━━━━━━━━━━━━━━━━━━━━");
            messageBuilder.AppendLine();

            // Server info
            messageBuilder.AppendLine($"🖥️ <b>Server:</b> {serverName}");

            // Target info
            if (!string.IsNullOrEmpty(targetTypeName))
            {
                messageBuilder.AppendLine($"{targetTypeEmoji} <b>Type:</b> {targetTypeName}");

                if (alertRule != null && !string.IsNullOrEmpty(alertRule.TargetId))
                {
                    messageBuilder.AppendLine($"🆔 <b>Target:</b> <code>{alertRule.TargetId}</code>");
                }
            }

            messageBuilder.AppendLine();

            // Alert details
            messageBuilder.AppendLine($"📌 <b>Alert:</b> {alert.Title.Replace("Alert: ", "")}");
            messageBuilder.AppendLine($"📝 <b>Details:</b> {alert.Message}");

            // Timestamp
            messageBuilder.AppendLine();
            messageBuilder.AppendLine($"⏰ <b>Time:</b> {alert.CreatedAtUtc:yyyy-MM-dd HH:mm:ss} UTC");

            // Footer
            messageBuilder.AppendLine();
            messageBuilder.AppendLine("━━━━━━━━━━━━━━━━━━━━━━");
            messageBuilder.AppendLine($"<i>🆔 Alert ID: #{alert.Id}</i>");

            string message = messageBuilder.ToString();

            int successCount = 0;
            foreach (var chatId in chatIds)
            {
                try
                {
                    await botClient.SendMessage(
                        chatId: chatId.ChatId,
                        text: message,
                        parseMode: Telegram.Bot.Types.Enums.ParseMode.Html
                    );
                    successCount++;

                    _logger.LogInformation(
                        "Alert {AlertId} sent to Telegram chat {ChatId} ({Label})",
                        alert.Id, chatId.ChatId, chatId.Label ?? "Unlabeled"
                    );
                }
                catch (ApiRequestException apiEx)
                {
                    _logger.LogError(
                        apiEx,
                        "Telegram API error sending to chat {ChatId}: {Message}",
                        chatId.ChatId, apiEx.Message
                    );
                }
                catch (Exception ex)
                {
                    _logger.LogError(
                        ex,
                        "Error sending alert to Telegram chat {ChatId}",
                        chatId.ChatId
                    );
                }
            }

            if (successCount > 0)
            {
                _logger.LogInformation(
                    "Alert {AlertId} sent to {Count}/{Total} Telegram chats",
                    alert.Id, successCount, chatIds.Count
                );
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(
                ex,
                "Error sending Telegram notification for alert {AlertId}",
                alert.Id
            );
        }
    }

    public async Task<bool> TestConnectionAsync()
    {
        try
        {
            var settings = await GetSettingsAsync();
            if (settings?.TelegramBotToken == null)
            {
                _logger.LogWarning("Cannot test connection: Telegram bot token not configured");
                return false;
            }

            var botClient = new TelegramBotClient(settings.TelegramBotToken);
            var me = await botClient.GetMe();

            _logger.LogInformation(
                "Telegram bot connection test successful. Bot: @{Username}",
                me.Username
            );
            return true;
        }
        catch (ApiRequestException apiEx)
        {
            _logger.LogError(
                apiEx,
                "Telegram API error during connection test: {Message}",
                apiEx.Message
            );
            return false;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error testing Telegram connection");
            return false;
        }
    }

    public async Task<bool> IsEnabledAsync()
    {
        var settings = await GetSettingsAsync();
        return settings?.IsTelegramEnabled == true &&
               !string.IsNullOrEmpty(settings.TelegramBotToken);
    }

    private async Task<NotificationSettings?> GetSettingsAsync()
    {
        return await _dbContext.NotificationSettings
            .Include(n => n.TelegramChatIds)
            .FirstOrDefaultAsync();
    }
}
