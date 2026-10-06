/**
 * Bun-Drive Diagnostic & Audit Logger
 * Maintains in-memory ring buffer for client-side diagnostics
 * and writes to system console.
 */
import { LogEntry } from '../types/drive.js';

class Logger {
  private logs: LogEntry[] = [];
  private maxLogs = 300;

  private add(level: LogEntry['level'], source: string, message: string, details?: unknown) {
    const entry: LogEntry = {
      id: Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toISOString(),
      level,
      source,
      message,
      details,
    };

    this.logs.unshift(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs.pop();
    }

    const prefix = `[${entry.timestamp}] [${level}] [${source}]`;
    if (level === 'ERROR') {
      console.error(`${prefix} ${message}`, details || '');
    } else if (level === 'WARN' || level === 'SECURITY') {
      console.warn(`${prefix} ${message}`, details || '');
    } else {
      console.log(`${prefix} ${message}`);
    }
  }

  info(source: string, message: string, details?: unknown) {
    this.add('INFO', source, message, details);
  }

  warn(source: string, message: string, details?: unknown) {
    this.add('WARN', source, message, details);
  }

  error(source: string, message: string, details?: unknown) {
    this.add('ERROR', source, message, details);
  }

  security(source: string, message: string, details?: unknown) {
    this.add('SECURITY', source, message, details);
  }

  getLogs(limit = 100): LogEntry[] {
    return this.logs.slice(0, limit);
  }

  clear() {
    this.logs = [];
  }
}

export const logger = new Logger();
