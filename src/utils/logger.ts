import winston from 'winston';
import { config } from '../config';
import { isErrorBlacklisted } from '../config/errorBlacklist';

// Simple format that avoids Winston's automatic error serialization
const logFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.printf(({ timestamp, level, message, error, ...meta }) => {
    // Handle error separately to avoid Winston's automatic serialization
    const logData: any = {
      ...meta
    };
    
    // If error is already serialized, use it as is
    if (error && typeof error === 'object' && 'message' in error) {
      logData.error = error;
    }
    
    // Only include JSON if there are values
    const hasValues = Object.keys(logData).length > 0;
    const jsonString = hasValues ? `\n${JSON.stringify(logData, null, 2)}` : '';
    
    // Format: [timestamp] [LEVEL] message json
    return `[${timestamp}] [${level.toUpperCase()}] ${message}${jsonString}`;
  })
);

// Create a custom logger that checks blacklist before logging
const createFilteredLogger = () => {
  const winstonLogger = winston.createLogger({
    level: config.nodeEnv === 'production' ? 'info' : 'debug',
    format: logFormat,
    transports: [
      new winston.transports.Console({
        format: logFormat,
      }),
      new winston.transports.File({
        filename: 'logs/error.log',
        level: 'error',
      }),
      new winston.transports.File({
        filename: 'logs/combined.log',
      }),
    ],
  });

  // Create a proxy that intercepts error and warn calls
  return new Proxy(winstonLogger, {
    get(target, prop) {
      if (prop === 'error' || prop === 'warn') {
        return function(message: string, meta?: any) {
          // Check if the error in meta should be blacklisted
          if (meta?.error && isErrorBlacklisted(meta.error)) {
            return; // Don't log blacklisted errors
          }
          
          // Call the original method
          return target[prop as keyof typeof target].call(target, message, meta);
        };
      }
      
      // For all other methods, return the original
      return target[prop as keyof typeof target];
    }
  });
};

export const logger = createFilteredLogger();

// Create logs directory if it doesn't exist
import { mkdirSync, existsSync } from 'fs';
import { join } from 'path';

const logsDir = join(process.cwd(), 'logs');
if (!existsSync(logsDir)) {
  mkdirSync(logsDir, { recursive: true });
}

/**
 * Safely serialize an error object for logging
 * Extracts useful information while avoiding circular references
 */
export function serializeError(error: unknown): Record<string, any> {
  try {
    if (error instanceof Error) {
      return {
        message: error.message || 'Unknown error',
        name: error.name || 'Error',
        stack: error.stack || 'No stack trace available',
        // Include additional properties if they exist
        ...(error as any).code && { code: (error as any).code },
        ...(error as any).statusCode && { statusCode: (error as any).statusCode },
      };
    }
    
    if (error === null) {
      return { message: 'null', type: 'null' };
    }
    
    if (error === undefined) {
      return { message: 'undefined', type: 'undefined' };
    }
    
    return {
      message: String(error),
      type: typeof error,
      value: error,
    };
  } catch (serializeErr) {
    return {
      message: 'Error serializing error object',
      originalError: String(error),
      serializeError: String(serializeErr),
    };
  }
}

/**
 * Safely serialize complex objects for logging
 * Extracts useful information while avoiding circular references
 */
export function serializeObject(obj: any, maxDepth = 3, currentDepth = 0): any {
  try {
    if (currentDepth >= maxDepth) {
      return '[Max depth reached]';
    }
    
    if (obj === null || obj === undefined) {
      return obj;
    }
    
    if (typeof obj === 'string' || typeof obj === 'number' || typeof obj === 'boolean') {
      return obj;
    }
    
    if (obj instanceof Date) {
      return obj.toISOString();
    }
    
    if (obj instanceof Error) {
      return serializeError(obj);
    }
    
    if (Array.isArray(obj)) {
      return obj.slice(0, 10).map(item => serializeObject(item, maxDepth, currentDepth + 1));
    }
    
    if (typeof obj === 'object') {
      const result: Record<string, any> = {};
      const keys = Object.keys(obj).slice(0, 20); // Limit to first 20 keys
      
      for (const key of keys) {
        try {
          result[key] = serializeObject(obj[key], maxDepth, currentDepth + 1);
        } catch (err) {
          result[key] = '[Error serializing]';
        }
      }
      
      return result;
    }
    
    return String(obj);
  } catch (err) {
    return `[Error serializing object: ${String(err)}]`;
  }
}



export default logger;
