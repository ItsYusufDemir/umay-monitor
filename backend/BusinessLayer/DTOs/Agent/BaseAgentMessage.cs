using System.Text.Json;
using System.Text.Json.Serialization;

namespace BusinessLayer.DTOs.Agent;

/// <summary>
/// Base structure for all agent messages (requests, responses, events)
/// </summary>
public class BaseAgentMessage
{
    /// <summary>
    /// Message type: "request", "response", or "event"
    /// </summary>
    [JsonPropertyName("type")]
    public string Type { get; set; } = string.Empty;
    
    /// <summary>
    /// Message ID - used for matching responses to requests
    /// CRITICAL: Agent caches responses by ID, so backend must generate unique IDs
    /// </summary>
    [JsonPropertyName("id")]
    public int Id { get; set; }
    
    /// <summary>
    /// Action identifier (e.g., "authenticate", "metrics", "get-server-info")
    /// </summary>
    [JsonPropertyName("action")]
    public string Action { get; set; } = string.Empty;
    
    /// <summary>
    /// Message payload - deserialized based on action
    /// </summary>
    [JsonPropertyName("payload")]
    public JsonElement Payload { get; set; }
    
    /// <summary>
    /// Unix timestamp in milliseconds
    /// </summary>
    [JsonPropertyName("timestamp")]
    public long Timestamp { get; set; }
}

/// <summary>
/// Constants for message types
/// </summary>
public static class MessageTypes
{
    public const string Request = "request";
    public const string Response = "response";
    public const string Event = "event";
}

/// <summary>
/// Constants for agent actions
/// </summary>
public static class AgentActions
{
    // Authentication
    public const string Authenticate = "authenticate";
    
    // Events from agent
    public const string Metrics = "metrics";
    public const string WatchlistMetrics = "watchlist-metrics";
    public const string BackupCompleted = "backup-completed";
    public const string IntegrityCheckCompleted = "integrity-check-completed";
    
    // Requests to agent
    public const string GetServerInfo = "get-server-info";
    public const string GetServices = "get-services";
    public const string GetService = "get-service";
    public const string GetServiceLog = "get-service-log";
    public const string RestartService = "restart-service";
    public const string GetProcesses = "get-processes";
    public const string GetProcess = "get-process";
    public const string UpdateAgentConfig = "update-agent-config";
    public const string TriggerBackup = "trigger-backup";
    public const string BrowseFilesystem = "browse-filesystem";
    public const string GetBackupSnapshots = "get-backup-snapshots";
    public const string CheckBackupIntegrity = "check-backup-integrity";
}