/**
 * Errors that are safe and useful to show to the end user (and the model).
 * Anything else is reported as a generic failure so internals never leak.
 */
export type ToolErrorCode =
  | 'VALIDATION'
  | 'MISSING_API_KEY'
  | 'RATE_LIMITED'
  | 'UPSTREAM_AUTH'
  | 'UPSTREAM_QUOTA'
  | 'UPSTREAM_NOT_FOUND'
  | 'UPSTREAM_BAD_REQUEST'
  | 'UPSTREAM_ERROR'
  | 'TIMEOUT'
  | 'NETWORK'
  | 'NOT_IMPLEMENTED';

export class ToolError extends Error {
  constructor(
    readonly code: ToolErrorCode,
    message: string,
    readonly hint?: string,
  ) {
    super(message);
    this.name = 'ToolError';
  }
}

/** Error raised by the HTTP client; carries the upstream status when there is one. */
export class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number | undefined,
    readonly kind: 'http' | 'timeout' | 'network' | 'parse',
    readonly body?: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}
