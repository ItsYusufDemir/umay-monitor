using BusinessLayer.DTOs.Agent.Configuration;
using BusinessLayer.Services.Interfaces;
using Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using WatchlistServiceEntity = Infrastructure.Entities.WatchlistService;
using WatchlistProcessEntity = Infrastructure.Entities.WatchlistProcess;

namespace BusinessLayer.Services.Concrete;

/// <summary>
/// Service for managing watchlist configuration
/// </summary>
public class WatchlistService : IWatchlistService
{
    private readonly ServerMonitoringDbContext _dbContext;
    private readonly IAgentCommandService _commandService;
    private readonly ILogger<WatchlistService> _logger;

    public WatchlistService(
        ServerMonitoringDbContext dbContext,
        IAgentCommandService commandService,
        ILogger<WatchlistService> logger)
    {
        _dbContext = dbContext;
        _commandService = commandService;
        _logger = logger;
    }

    public async Task<WatchlistConfig> GetWatchlistConfigAsync(int serverId)
    {
        var services = await _dbContext.WatchlistServices
            .Where(w => w.MonitoredServerId == serverId && w.IsActive)
            .Select(w => w.ServiceName)
            .ToListAsync();

        // ProcessName column stores the cmdline
        var processes = await _dbContext.WatchlistProcesses
            .Where(w => w.MonitoredServerId == serverId && w.IsActive)
            .Select(w => w.ProcessName)
            .ToListAsync();

        return new WatchlistConfig
        {
            Services = services,
            Processes = processes
        };
    }

    public async Task AddServiceAsync(int serverId, string serviceName)
    {
        // Check if already exists
        var existing = await _dbContext.WatchlistServices
            .FirstOrDefaultAsync(w => w.MonitoredServerId == serverId && w.ServiceName == serviceName);

        if (existing != null)
        {
            if (!existing.IsActive)
            {
                existing.IsActive = true;
                existing.AddedAtUtc = DateTime.UtcNow;
                await _dbContext.SaveChangesAsync();
                _logger.LogInformation("Reactivated service {ServiceName} in watchlist for server {ServerId}", serviceName, serverId);
            }
            else
            {
                _logger.LogInformation("Service {ServiceName} already in watchlist for server {ServerId}", serviceName, serverId);
                return; // Already active, no need to update
            }
        }
        else
        {
            // Add new entry
            var watchlistService = new WatchlistServiceEntity
            {
                MonitoredServerId = serverId,
                ServiceName = serviceName,
                AddedAtUtc = DateTime.UtcNow,
                IsActive = true
            };

            _dbContext.WatchlistServices.Add(watchlistService);
            await _dbContext.SaveChangesAsync();
            _logger.LogInformation("Added service {ServiceName} to watchlist for server {ServerId}", serviceName, serverId);
        }

        // Update agent configuration
        await UpdateAgentConfigurationAsync(serverId);
    }

    public async Task RemoveServiceAsync(int serverId, string serviceName)
    {
        var watchlistService = await _dbContext.WatchlistServices
            .FirstOrDefaultAsync(w => w.MonitoredServerId == serverId && w.ServiceName == serviceName && w.IsActive);

        if (watchlistService == null)
        {
            _logger.LogWarning("Service {ServiceName} not found in watchlist for server {ServerId}", serviceName, serverId);
            return;
        }

        // Soft delete by setting IsActive to false
        watchlistService.IsActive = false;
        await _dbContext.SaveChangesAsync();
        _logger.LogInformation("Removed service {ServiceName} from watchlist for server {ServerId}", serviceName, serverId);

        // Update agent configuration
        await UpdateAgentConfigurationAsync(serverId);
    }

    public async Task AddProcessAsync(int serverId, string cmdline)
    {
        // Check if already exists (ProcessName column stores cmdline)
        var existing = await _dbContext.WatchlistProcesses
            .FirstOrDefaultAsync(w => w.MonitoredServerId == serverId && w.ProcessName == cmdline);

        if (existing != null)
        {
            if (!existing.IsActive)
            {
                existing.IsActive = true;
                existing.AddedAtUtc = DateTime.UtcNow;
                await _dbContext.SaveChangesAsync();
                _logger.LogInformation("Reactivated process '{Cmdline}' in watchlist for server {ServerId}", cmdline, serverId);
            }
            else
            {
                _logger.LogInformation("Process '{Cmdline}' already in watchlist for server {ServerId}", cmdline, serverId);
                return; // Already active, no need to update
            }
        }
        else
        {
            // Add new entry - store cmdline in ProcessName column
            var watchlistProcess = new WatchlistProcessEntity
            {
                MonitoredServerId = serverId,
                ProcessName = cmdline,  // ProcessName column stores cmdline
                AddedAtUtc = DateTime.UtcNow,
                IsActive = true
            };

            _dbContext.WatchlistProcesses.Add(watchlistProcess);
            await _dbContext.SaveChangesAsync();
            _logger.LogInformation("Added process '{Cmdline}' to watchlist for server {ServerId}", cmdline, serverId);
        }

        // Update agent configuration
        await UpdateAgentConfigurationAsync(serverId);
    }

    public async Task RemoveProcessAsync(int serverId, string cmdline)
    {
        // ProcessName column stores cmdline
        var watchlistProcess = await _dbContext.WatchlistProcesses
            .FirstOrDefaultAsync(w => w.MonitoredServerId == serverId && w.ProcessName == cmdline && w.IsActive);

        if (watchlistProcess == null)
        {
            _logger.LogWarning("Process '{Cmdline}' not found in watchlist for server {ServerId}", cmdline, serverId);
            return;
        }

        // Soft delete by setting IsActive to false
        watchlistProcess.IsActive = false;
        await _dbContext.SaveChangesAsync();
        _logger.LogInformation("Removed process '{Cmdline}' from watchlist for server {ServerId}", cmdline, serverId);

        // Update agent configuration
        await UpdateAgentConfigurationAsync(serverId);
    }

    public async Task<List<string>> GetWatchedServicesAsync(int serverId)
    {
        return await _dbContext.WatchlistServices
            .Where(w => w.MonitoredServerId == serverId && w.IsActive)
            .Select(w => w.ServiceName)
            .ToListAsync();
    }

    public async Task<List<string>> GetWatchedProcessesAsync(int serverId)
    {
        // ProcessName column stores cmdline
        return await _dbContext.WatchlistProcesses
            .Where(w => w.MonitoredServerId == serverId && w.IsActive)
            .Select(w => w.ProcessName)
            .ToListAsync();
    }

    /// <summary>
    /// Send updated watchlist configuration to the agent
    /// </summary>
    private async Task UpdateAgentConfigurationAsync(int serverId)
    {
        var config = await GetWatchlistConfigAsync(serverId);

        var updateRequest = new UpdateAgentConfigRequest
        {
            Watchlist = config
        };

        try
        {
            var response = await _commandService.SendCommandAsync<UpdateAgentConfigRequest, UpdateAgentConfigResponse>(
                serverId,
                "update-agent-config",
                updateRequest,
                cancellationToken: CancellationToken.None
            );

            if (response.Status == "ok")
            {
                _logger.LogInformation("Successfully updated agent configuration for server {ServerId}", serverId);
            }
            else
            {
                _logger.LogWarning("Failed to update agent configuration for server {ServerId}: {Message}",
                    serverId, response.Message);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating agent configuration for server {ServerId}", serverId);
            throw;
        }
    }
}
