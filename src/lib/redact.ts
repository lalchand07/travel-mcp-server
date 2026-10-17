const secrets = new Set<string>();

/** Registers a secret value so it is scrubbed from every log line and tool output. */
export function registerSecret(value: string | undefined): void {
  if (value && value.length >= 4) secrets.add(value);
}

/** Replaces every registered secret (and obvious key-like query params) with a placeholder. */
export function redact(text: string): string {
  let out = text;
  for (const s of secrets) out = out.split(s).join('[REDACTED]');
  return out.replace(/((?:api[_-]?key|token|access_key|apikey)=)[^&\s"']+/gi, '$1[REDACTED]');
}

/** For tests only. */
export function clearSecrets(): void {
  secrets.clear();
}
