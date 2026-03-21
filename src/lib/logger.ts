/**
 * Production-ready logging utility
 * - Development: Logs to console
 * - Production: Can be extended to send to logging service (Sentry, LogRocket, etc.)
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  [key: string]: unknown;
}

class Logger {
  private isDevelopment = import.meta.env.DEV;
  private isTest = import.meta.env.MODE === 'test';

  private shouldLog(level: LogLevel): boolean {
    // Don't log in tests unless explicitly needed
    if (this.isTest) return false;
    
    // In production, only log warnings and errors
    if (!this.isDevelopment && (level === 'debug' || level === 'info')) {
      return false;
    }
    
    return true;
  }

  private formatMessage(level: LogLevel, message: string, context?: LogContext): string {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
    
    if (context && Object.keys(context).length > 0) {
      return `${prefix} ${message} ${JSON.stringify(context)}`;
    }
    
    return `${prefix} ${message}`;
  }

  debug(message: string, context?: LogContext) {
    if (!this.shouldLog('debug')) return;
    
    if (this.isDevelopment) {
      console.debug(this.formatMessage('debug', message, context));
    }
  }

  info(message: string, context?: LogContext) {
    if (!this.shouldLog('info')) return;
    
    if (this.isDevelopment) {
      console.info(this.formatMessage('info', message, context));
    }
  }

  warn(message: string, context?: LogContext) {
    if (!this.shouldLog('warn')) return;
    
    console.warn(this.formatMessage('warn', message, context));
    
    // In production, send to monitoring service
    if (!this.isDevelopment) {
      this.sendToMonitoring('warn', message, context);
    }
  }

  error(message: string, error?: Error | unknown, context?: LogContext) {
    if (!this.shouldLog('error')) return;
    
    const errorContext = {
      ...context,
      error: error instanceof Error ? {
        message: error.message,
        stack: error.stack,
        name: error.name,
      } : error,
    };

    console.error(this.formatMessage('error', message, errorContext));
    
    // In production, send to monitoring service
    if (!this.isDevelopment) {
      this.sendToMonitoring('error', message, errorContext);
    }
  }

  private sendToMonitoring(level: LogLevel, message: string, context?: LogContext) {
    // TODO: Integrate with Sentry, LogRocket, or your monitoring service
    // Example with Sentry:
    // if (window.Sentry) {
    //   window.Sentry.captureMessage(message, {
    //     level: level as SeverityLevel,
    //     extra: context,
    //   });
    // }
    
    // For now, we'll just ensure errors are captured
    if (level === 'error' && context?.error instanceof Error) {
      // Store in localStorage for debugging (temporary solution)
      try {
        const errors = JSON.parse(localStorage.getItem('app_errors') || '[]');
        errors.push({
          timestamp: new Date().toISOString(),
          message,
          context,
        });
        // Keep only last 50 errors
        localStorage.setItem('app_errors', JSON.stringify(errors.slice(-50)));
      } catch {
        // Silently fail if localStorage is unavailable
      }
    }
  }
}

export const logger = new Logger();

// Convenience exports for common patterns
export const log = logger.info.bind(logger);
export const logError = logger.error.bind(logger);
export const logWarn = logger.warn.bind(logger);
export const logDebug = logger.debug.bind(logger);
