namespace Infrastructure.Entities;

/// <summary>
/// Target type for alert rules
/// </summary>
public enum AlertTargetType
{
    /// <summary>
    /// Rule applies to a specific server's overall metrics (CPU, RAM, Load)
    /// </summary>
    Server,
    
    /// <summary>
    /// Rule applies to any disk partition on a server (worst-case check)
    /// </summary>
    Disk,
    
    /// <summary>
    /// Rule applies to any network interface on a server
    /// </summary>
    Network,
    
    /// <summary>
    /// Rule applies to a specific process by exact name match
    /// </summary>
    Process,
    
    /// <summary>
    /// Rule applies to a specific service by name from watchlist
    /// </summary>
    Service
}

/// <summary>
/// Defines a rule that triggers alerts when certain thresholds are exceeded.
/// </summary>
public class AlertRule
{
    public int Id { get; set; }

    /// <summary>
    /// Which metric to monitor (e.g., "CPU", "RAM", "DiskUsage", "Load", "ProcessCpu", "ProcessMemory")
    /// </summary>
    public string Metric { get; set; } = string.Empty;

    /// <summary>
    /// The threshold value to compare against
    /// </summary>
    public double ThresholdValue { get; set; }

    /// <summary>
    /// Comparison operator (e.g., ">", "<", ">=", "<=", "==")
    /// </summary>
    public string Comparison { get; set; } = ">";

    /// <summary>
    /// Alert severity level (e.g., "Info", "Warning", "Critical")
    /// </summary>
    public string Severity { get; set; } = "Warning";

    /// <summary>
    /// Whether this rule is currently active
    /// </summary>
    public bool IsActive { get; set; } = true;

    /// <summary>
    /// Target type (Server, Disk, Network, Process, Service)
    /// </summary>
    public AlertTargetType TargetType { get; set; } = AlertTargetType.Server;

    /// <summary>
    /// Optional target identifier:
    /// - For Process: exact process name (e.g., "python")
    /// - For Service: service name (e.g., "nginx", "postgresql")
    /// - For Disk: device path (e.g., "/dev/sda1") - null means ANY disk
    /// - For Network: interface name (e.g., "eth0") - null means ANY interface
    /// - For Server: not used
    /// </summary>
    public string? TargetId { get; set; }

    /// <summary>
    /// Cooldown period in minutes to prevent alert spam
    /// Default: 15 minutes
    /// </summary>
    public int CooldownMinutes { get; set; } = 15;

    /// <summary>
    /// Last time this rule triggered an alert (used for cooldown tracking)
    /// This is updated even if alerts are deleted, ensuring cooldown works correctly
    /// </summary>
    public DateTime? LastTriggeredAtUtc { get; set; }

    /// <summary>
    /// Optional: additional configuration as JSON
    /// </summary>
    public string? ConfigJson { get; set; }

    /// <summary>
    /// When this rule was created
    /// </summary>
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;

    /// <summary>
    /// Server this rule applies to (required)
    /// </summary>
    public int MonitoredServerId { get; set; }
    public MonitoredServer MonitoredServer { get; set; } = null!;
}
