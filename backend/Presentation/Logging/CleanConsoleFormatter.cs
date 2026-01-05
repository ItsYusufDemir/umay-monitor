using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Logging.Console;
using Microsoft.Extensions.Options;

namespace Presentation.Logging;

public class CleanConsoleFormatter : ConsoleFormatter
{
    public const string FormatterName = "clean";
    
    public CleanConsoleFormatter() : base(FormatterName)
    {
    }

    public override void Write<TState>(
        in LogEntry<TState> logEntry,
        IExternalScopeProvider? scopeProvider,
        TextWriter textWriter)
    {
        var message = logEntry.Formatter?.Invoke(logEntry.State, logEntry.Exception);
        
        if (message is null)
        {
            return;
        }

        // Write only the message, nothing else
        textWriter.WriteLine(message);
        
        // Write exception if present
        if (logEntry.Exception is not null)
        {
            textWriter.WriteLine(logEntry.Exception.ToString());
        }
    }
}

public static class CleanConsoleFormatterExtensions
{
    public static ILoggingBuilder AddCleanConsoleFormatter(this ILoggingBuilder builder)
    {
        return builder.AddConsoleFormatter<CleanConsoleFormatter, ConsoleFormatterOptions>();
    }
}
