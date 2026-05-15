import * as Sentry from "@sentry/react";

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  [key: string]: unknown;
}

class Logger {
  private isDevelopment = import.meta.env.DEV;
  private isTest = import.meta.env.MODE === 'test';

  private shouldLog(level: LogLevel): boolean {
    if (this.isTest) return false;
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
    console.debug(this.formatMessage('debug', message, context));
  }

  info(message: string, context?: LogContext) {
    if (!this.shouldLog('info')) return;
    console.info(this.formatMessage('info', message, context));
  }

  warn(message: string, context?: LogContext) {
    if (!this.shouldLog('warn')) return;
    console.warn(this.formatMessage('warn', message, context));
    if (!this.isDevelopment) {
      Sentry.captureMessage(message, { level: 'warning', extra: context });
    }
  }

  error(message: string, error?: unknown, context?: LogContext) {
    if (!this.shouldLog('error')) return;

    const isErrorObj = error != null && typeof error === 'object' && 'message' in error;

    const errorContext = {
      ...context,
      error: isErrorObj ? {
        message: (error as Error).message,
        stack: (error as Error).stack,
        name: (error as Error).name,
      } : String(error),
    };

    console.error(this.formatMessage('error', message, errorContext));

    if (!this.isDevelopment) {
      const sentryError = isErrorObj
        ? (error as Error)
        : new Error(message);
      Sentry.captureException(sentryError, { extra: errorContext });
    }
  }
}

export const logger = new Logger();

export const log = logger.info.bind(logger);
export const logError = logger.error.bind(logger);
export const logWarn = logger.warn.bind(logger);
export const logDebug = logger.debug.bind(logger);
