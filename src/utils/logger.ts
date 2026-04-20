const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 } as const;
type LogLevel = keyof typeof LEVELS;

function getConfiguredLevel(): number {
  const env = (process.env['LOG_LEVEL'] ?? 'info').toLowerCase();
  return LEVELS[env as LogLevel] ?? LEVELS.info;
}

function format(level: string, message: string, meta?: Record<string, unknown>): string {
  const ts = new Date().toISOString();
  let line = `[${ts}] [${level.toUpperCase()}] ${message}`;
  if (meta && Object.keys(meta).length > 0) {
    line += ` ${JSON.stringify(meta)}`;
  }
  return line;
}

function debug(message: string, meta?: Record<string, unknown>): void {
  if (LEVELS.debug >= getConfiguredLevel()) {
    console.log(format('debug', message, meta));
  }
}

function info(message: string, meta?: Record<string, unknown>): void {
  if (LEVELS.info >= getConfiguredLevel()) {
    console.log(format('info', message, meta));
  }
}

function warn(message: string, meta?: Record<string, unknown>): void {
  if (LEVELS.warn >= getConfiguredLevel()) {
    console.warn(format('warn', message, meta));
  }
}

function error(message: string, meta?: Record<string, unknown>): void {
  if (LEVELS.error >= getConfiguredLevel()) {
    console.error(format('error', message, meta));
  }
}

export const logger = { debug, info, warn, error };
