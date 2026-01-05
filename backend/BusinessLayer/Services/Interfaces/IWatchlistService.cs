using BusinessLayer.DTOs.Agent.Configuration;

namespace BusinessLayer.Services.Interfaces;

/// <summary>
/// Service for managing watchlist configuration (services and processes to monitor)
/// </summary>
public interface IWatchlistService
{
    /// <summary>
    /// Get current watchlist configuration for a server
    /// </summary>
    Task<WatchlistConfig> GetWatchlistConfigAsync(int serverId);
    
    /// <summary>
    /// Add a service to the watchlist and update agent configuration
    /// </summary>
    Task AddServiceAsync(int serverId, string serviceName);
    
    /// <summary>
    /// Remove a service from the watchlist and update agent configuration
    /// </summary>
    Task RemoveServiceAsync(int serverId, string serviceName);
    
    /// <summary>
    /// Add a process to the watchlist by cmdline and update agent configuration
    /// </summary>
    Task AddProcessAsync(int serverId, string cmdline);
    
    /// <summary>
    /// Remove a process from the watchlist by cmdline and update agent configuration
    /// </summary>
    Task RemoveProcessAsync(int serverId, string cmdline);
    
    /// <summary>
    /// Get all watched services for a server
    /// </summary>
    Task<List<string>> GetWatchedServicesAsync(int serverId);
    
    /// <summary>
    /// Get all watched processes (cmdlines) for a server
    /// </summary>
    Task<List<string>> GetWatchedProcessesAsync(int serverId);
}
