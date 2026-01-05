using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using BusinessLayer.DTOs.Agent;
using BusinessLayer.Services.Infrastructure;
using BusinessLayer.Services.Interfaces;
using Microsoft.Extensions.Logging;

namespace BusinessLayer.Services.Concrete;

public class AgentCommandService : IAgentCommandService
{
    private readonly IWebSocketConnectionManager _connectionManager;
    private readonly IRequestResponseManager _requestResponseManager;
    private readonly ILogger<AgentCommandService> _logger;
    private static readonly TimeSpan DefaultTimeout = TimeSpan.FromSeconds(30);
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.Never
    };

    public AgentCommandService(
        IWebSocketConnectionManager connectionManager,
        IRequestResponseManager requestResponseManager,
        ILogger<AgentCommandService> logger)
    {
        _connectionManager = connectionManager;
        _requestResponseManager = requestResponseManager;
        _logger = logger;
        
        // Subscribe to retry events
        _requestResponseManager.OnRetryNeeded += HandleRetryNeeded;
    }

    /// <summary>
    /// Handle retry requests from RequestResponseManager
    /// </summary>
    private async void HandleRetryNeeded(PendingRequest request)
    {
        try
        {
            await ResendRequestAsync(request.MessageId, request.ServerId, request.Action, request.Payload);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to resend request {MessageId}", request.MessageId);
        }
        finally
        {
            // Reset the flag so the request can be retried again if needed
            request.IsRetrying = false;
        }
    }

    /// <summary>
    /// Resend a request with the same message ID (for retries)
    /// </summary>
    private async Task ResendRequestAsync(int messageId, int serverId, string action, object? payload)
    {
        var socket = _connectionManager.GetSocket(serverId.ToString());
        if (socket == null || socket.State != WebSocketState.Open)
        {
            _logger.LogWarning("Cannot resend request {MessageId}: Server {ServerId} not connected", messageId, serverId);
            return;
        }

        var requestMessage = new
        {
            type = MessageTypes.Request,
            id = messageId,  // CRITICAL: Use same ID for retry
            action = action,
            payload = payload,
            timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
        };

        var messageJson = JsonSerializer.Serialize(requestMessage, JsonOptions);
        var messageBytes = Encoding.UTF8.GetBytes(messageJson);

        _logger.LogInformation("🔄 Resending request {MessageId} to server {ServerId}: Action='{Action}', Message: {MessageJson}", 
            messageId, serverId, action, messageJson);

        await socket.SendAsync(
            new ArraySegment<byte>(messageBytes),
            WebSocketMessageType.Text,
            endOfMessage: true,
            CancellationToken.None
        );
    }

    public async Task<TResponse> SendCommandAsync<TRequest, TResponse>(
        int serverId,
        string action,
        TRequest? requestPayload,
        TimeSpan? timeout = null,
        CancellationToken cancellationToken = default
    ) where TRequest : class
      where TResponse : class
    {
        var effectiveTimeout = timeout ?? DefaultTimeout;
        
        // Get the WebSocket connection for this server
        var socket = _connectionManager.GetSocket(serverId.ToString());
        if (socket == null || socket.State != WebSocketState.Open)
        {
            throw new InvalidOperationException($"Server {serverId} is not connected");
        }

        // Register the pending request with payload and get unique message ID
        var messageId = _requestResponseManager.RegisterRequest(serverId, action, requestPayload, effectiveTimeout);
        
        _logger.LogInformation("Sending command to server {ServerId}: Action='{Action}', MessageId={MessageId}", 
            serverId, action, messageId);

        try
        {
            // Build the request message
            // IMPORTANT: Agent expects null for empty payload, not {}
            var requestMessage = new
            {
                type = MessageTypes.Request,
                id = messageId,
                action = action,
                payload = requestPayload as object,  // This will be null if requestPayload is null
                timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
            };

            var messageJson = JsonSerializer.Serialize(requestMessage, JsonOptions);
            var messageBytes = Encoding.UTF8.GetBytes(messageJson);

            // Log the exact message being sent to agent
            _logger.LogInformation("📤 Outgoing to Agent {ServerId} | Action: {Action} | MessageId: {MessageId} | Message: {MessageJson}", 
                serverId, action, messageId, messageJson);

            // Send the message
            await socket.SendAsync(
                new ArraySegment<byte>(messageBytes),
                WebSocketMessageType.Text,
                endOfMessage: true,
                cancellationToken
            );

            _logger.LogInformation("Command sent successfully to server {ServerId}, waiting for response...", serverId);

            // Wait for the response
            var responseJson = await _requestResponseManager.WaitForResponseAsync(messageId, cancellationToken);

            _logger.LogDebug("Received response: {Response}", responseJson);

            // Deserialize the base response wrapper
            var options = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
            var baseResponse = JsonSerializer.Deserialize<BaseAgentMessage>(responseJson, options);
            if (baseResponse == null)
            {
                throw new InvalidOperationException("Failed to deserialize agent response");
            }

            // Extract the payload and deserialize it to the expected response type
            // Use case-insensitive deserialization to handle snake_case from Python agent
            var payloadJson = JsonSerializer.Serialize(baseResponse.Payload);
            var response = JsonSerializer.Deserialize<TResponse>(payloadJson, options);
            
            if (response == null)
            {
                throw new InvalidOperationException($"Failed to deserialize response payload as {typeof(TResponse).Name}");
            }

            _logger.LogInformation("Successfully received and parsed response from server {ServerId}", serverId);

            return response;
        }
        catch (TimeoutException ex)
        {
            _logger.LogError(ex, "Timeout waiting for response from server {ServerId} for action '{Action}'", 
                serverId, action);
            throw;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error sending command to server {ServerId}", serverId);
            _requestResponseManager.CancelRequest(messageId, $"Error: {ex.Message}");
            throw;
        }
    }

    /// <summary>
    /// Send a command to an agent without waiting for response (fire-and-forget)
    /// Used for commands where we get an event callback later (like backup triggers)
    /// </summary>
    public async Task SendCommandToAgentAsync(int serverId, string action, object? payload)
    {
        var socket = _connectionManager.GetSocket(serverId.ToString());
        if (socket == null || socket.State != WebSocketState.Open)
        {
            throw new InvalidOperationException($"Server {serverId} is not connected");
        }

        // Generate a unique message ID using the same mechanism as tracked requests
        // We register it but don't wait for response (timeout will clean it up)
        var messageId = _requestResponseManager.RegisterRequest(serverId, action, payload, TimeSpan.FromSeconds(10));

        var requestMessage = new
        {
            type = MessageTypes.Request,
            id = messageId,
            action = action,
            payload = payload,
            timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
        };

        var messageJson = JsonSerializer.Serialize(requestMessage, JsonOptions);
        var messageBytes = Encoding.UTF8.GetBytes(messageJson);

        _logger.LogInformation("📤 Fire-and-Forget to Agent {ServerId} | Action: {Action} | MessageId: {MessageId} | Message: {MessageJson}",
            serverId, action, messageId, messageJson);

        await socket.SendAsync(
            new ArraySegment<byte>(messageBytes),
            WebSocketMessageType.Text,
            endOfMessage: true,
            CancellationToken.None
        );

        _logger.LogInformation("Fire-and-forget command sent successfully to server {ServerId}", serverId);
    }
}


