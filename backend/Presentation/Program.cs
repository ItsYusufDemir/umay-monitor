using Microsoft.Extensions.DependencyInjection;
using Presentation;
using Presentation.WebSockets;
using BusinessLayer.Hubs;
using BusinessLayer.Configuration;
using Presentation.Configuration;
using Presentation.Helpers;
using Microsoft.AspNetCore.Server.Kestrel.Https;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using System.Text;
using Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.OpenApi.Models;

var builder = WebApplication.CreateBuilder(args);

var certificateOptions = builder.Configuration
    .GetSection(CertificateOptions.SectionName)
    .Get<CertificateOptions>();

if (certificateOptions != null && !string.IsNullOrEmpty(certificateOptions.CertPath))
{
    builder.WebHost.ConfigureKestrel(serverOptions =>
    {
        serverOptions.ConfigureHttpsDefaults(httpsOptions =>
        {
            var certPath = Path.Combine(builder.Environment.ContentRootPath, certificateOptions.CertPath);
            var keyPath = Path.Combine(builder.Environment.ContentRootPath, certificateOptions.KeyPath);
            
            var logger = builder.Services.BuildServiceProvider().GetRequiredService<ILogger<Program>>();
            logger.LogInformation("Loading SSL certificate from {CertPath}", certPath);
            
            httpsOptions.ServerCertificate = Presentation.Helpers.CertificateLoader.LoadFromPemFiles(
                certPath, 
                keyPath, 
                certificateOptions.Password
            );
            
            httpsOptions.ClientCertificateMode = ClientCertificateMode.NoCertificate;
            
            logger.LogInformation("SSL certificate loaded successfully. HTTPS/WSS is now enabled.");
        });
    });
}

// Configure JWT settings
builder.Services.Configure<JwtSettings>(
    builder.Configuration.GetSection(JwtSettings.SectionName)
);

var jwtSettings = builder.Configuration
    .GetSection(JwtSettings.SectionName)
    .Get<JwtSettings>();

// Configure JWT Authentication
builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = jwtSettings?.Issuer,
            ValidAudience = jwtSettings?.Audience,
            IssuerSigningKey = new SymmetricSecurityKey(
                Encoding.UTF8.GetBytes(jwtSettings?.SecretKey ?? string.Empty)
            ),
            ClockSkew = TimeSpan.Zero
        };

        // Support SignalR authentication via query string
        options.Events = new JwtBearerEvents
        {
            OnMessageReceived = context =>
            {
                var accessToken = context.Request.Query["access_token"];
                var path = context.HttpContext.Request.Path;
                
                if (!string.IsNullOrEmpty(accessToken) && 
                    path.StartsWithSegments("/monitoring-hub"))
                {
                    context.Token = accessToken;
                }
                return Task.CompletedTask;
            }
        };
    });

builder.Services.AddAuthorization();

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(options =>
{
    // Add JWT Bearer authentication to Swagger
    options.AddSecurityDefinition("Bearer", new Microsoft.OpenApi.Models.OpenApiSecurityScheme
    {
        Name = "Authorization",
        Type = Microsoft.OpenApi.Models.SecuritySchemeType.Http,
        Scheme = "Bearer",
        BearerFormat = "JWT",
        In = Microsoft.OpenApi.Models.ParameterLocation.Header,
        Description = "Enter 'Bearer' followed by a space and your JWT token.\n\nExample: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
    });

    options.AddSecurityRequirement(new Microsoft.OpenApi.Models.OpenApiSecurityRequirement
    {
        {
            new Microsoft.OpenApi.Models.OpenApiSecurityScheme
            {
                Reference = new Microsoft.OpenApi.Models.OpenApiReference
                {
                    Type = Microsoft.OpenApi.Models.ReferenceType.SecurityScheme,
                    Id = "Bearer"
                }
            },
            Array.Empty<string>()
        }
    });

    // Add API documentation
    options.SwaggerDoc("v1", new Microsoft.OpenApi.Models.OpenApiInfo
    {
        Title = "Server Monitoring API",
        Version = "v1",
        Description = "Backend API for Server Monitoring System with Backup Module"
    });
});
builder.Services.AddServices(builder.Configuration);





// 1. Get the domain from Docker (or default to localhost:3000)
var allowedOrigin = Environment.GetEnvironmentVariable("ALLOWED_ORIGINS") ?? "http://localhost:3000";

builder.Services.AddCors(options =>
{
    // Policy for Local Development (Visual Studio) - Allows Everything
    options.AddPolicy("DevelopmentPolicy", policy =>
    {
        policy.SetIsOriginAllowed(_ => true) 
              .AllowAnyHeader()
              .AllowAnyMethod()
              .AllowCredentials();
    });

    // Policy for Production (Docker) - Strict, uses the Env Variable
    options.AddPolicy("ProductionPolicy", policy =>
    {
        policy.WithOrigins(allowedOrigin) // <--- Dynamic!
              .AllowAnyHeader()
              .AllowAnyMethod()
              .AllowCredentials();
    });
});

var app = builder.Build();

await DatabaseSeeder.SeedAsync(app.Services);

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
    app.UseCors("DevelopmentPolicy");
}
else
{
    app.UseCors("ProductionPolicy");
}

// Enable static files with custom MIME types
var provider = new Microsoft.AspNetCore.StaticFiles.FileExtensionContentTypeProvider();
provider.Mappings[".deb"] = "application/vnd.debian.binary-package";

app.UseStaticFiles(new StaticFileOptions
{
    ContentTypeProvider = provider
});

// Authentication must come before Authorization
app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();
app.MapHub<MonitoringHub>("/monitoring-hub");

var webSocketOptions = new WebSocketOptions
{
    KeepAliveInterval = TimeSpan.FromMinutes(2)
};

app.UseWebSockets(webSocketOptions);

// Agent WebSocket handler - only for non-SignalR WebSocket requests
app.Use(async (context, next) =>
{
    // Skip if this is a SignalR connection
    if (context.Request.Path.StartsWithSegments("/monitoring-hub"))
    {
        await next();
        return;
    }

    // Handle agent WebSocket connections
    if (context.WebSockets.IsWebSocketRequest)
    {
        // CRITICAL FIX: Create a manual service scope that lasts for the entire WebSocket lifetime
        // Without this, the scoped services (AgentMessageHandler, DbContext) get disposed 
        // when the HTTP request scope ends, but the WebSocket connection continues.
        // This caused responses to fail silently because _messageHandler was disposed.
        using var scope = context.RequestServices.CreateScope();
        var handler = scope.ServiceProvider.GetRequiredService<WebSocketHandler>();
        await handler.HandleConnection(context);
    }
    else
    {
        await next();
    }
});

app.Logger.LogInformation("Server starting...");
app.Logger.LogInformation("HTTP endpoint: http://localhost:5123");
app.Logger.LogInformation("HTTPS endpoint: https://localhost:7287");
app.Logger.LogInformation("WebSocket endpoint (agents): ws://localhost:5123 or wss://localhost:7287");
app.Logger.LogInformation("SignalR Hub (frontend): /monitoring-hub");

await app.RunAsync();
