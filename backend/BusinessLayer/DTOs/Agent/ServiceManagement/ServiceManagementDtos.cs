using System.Text.Json.Serialization;

namespace BusinessLayer.DTOs.Agent.ServiceManagement;

/// <summary>
/// Request to get all services
/// Action: get-services
/// Payload: null
/// </summary>
public class GetServicesRequest
{
    // No payload needed
}

/// <summary>
/// Service information in the services list
/// </summary>
public class ServiceListItem
{
    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;
    
    [JsonPropertyName("activeState")]
    public string ActiveState { get; set; } = string.Empty;
    
    [JsonPropertyName("subState")]
    public string SubState { get; set; } = string.Empty;
}

/// <summary>
/// Response for get-services request
/// </summary>
public class GetServicesResponse : AgentResponse<List<ServiceListItem>>
{
}

/// <summary>
/// Request to get detailed service information
/// Action: get-service
/// </summary>
public class GetServiceRequest
{
    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;
}

/// <summary>
/// Detailed service information
/// </summary>
public class ServiceDetails
{
    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;
    
    [JsonPropertyName("description")]
    public string? Description { get; set; }
    
    [JsonPropertyName("enabled")]
    public string? Enabled { get; set; }
    
    [JsonPropertyName("activeState")]
    public string ActiveState { get; set; } = string.Empty;
    
    [JsonPropertyName("subState")]
    public string SubState { get; set; } = string.Empty;
    
    [JsonPropertyName("mainPID")]
    public int? MainPID { get; set; }
    
    [JsonPropertyName("cpuUsagePercent")]
    public double? CpuUsagePercent { get; set; }
    
    [JsonPropertyName("memoryUsage")]
    public double? MemoryUsage { get; set; }
    
    [JsonPropertyName("startTime")]
    public string? StartTime { get; set; }
    
    [JsonPropertyName("exitTime")]
    public string? ExitTime { get; set; }
    
    /// <summary>
    /// Restart policy from systemd (e.g., "no", "always", "on-failure")
    /// Agent sends this as "restart" field
    /// </summary>
    [JsonPropertyName("restart")]
    public string? RestartPolicy { get; set; }
    
    [JsonPropertyName("error")]
    public string? Error { get; set; }
}

/// <summary>
/// Response for get-service request
/// </summary>
public class GetServiceResponse : AgentResponse<ServiceDetails>
{
}

/// <summary>
/// Request to get service logs
/// Action: get-service-log
/// </summary>
public class GetServiceLogRequest
{
    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;
}

/// <summary>
/// Service log entry
/// </summary>
public class ServiceLogEntry
{
    [JsonPropertyName("log")]
    public string Log { get; set; } = string.Empty;
}

/// <summary>
/// Response for get-service-log request (max 1000 lines)
/// </summary>
public class GetServiceLogResponse : AgentResponse<List<ServiceLogEntry>>
{
}

/// <summary>
/// Request to restart a service
/// Action: restart-service
/// </summary>
public class RestartServiceRequest
{
    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;
}

/// <summary>
/// Response for restart-service request
/// Returns status "ok" or "error" with message
/// </summary>
public class RestartServiceResponse : BaseAgentResponse
{
}
