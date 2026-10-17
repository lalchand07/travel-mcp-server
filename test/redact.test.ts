import { afterEach, describe, expect, it } from 'vitest';
import { clearSecrets, redact, registerSecret } from '../src/lib/redact.js';

afterEach(() => {
  clearSecrets();
});

describe('redact', () => {
  it('removes registered secrets everywhere', () => {
    registerSecret('abcd1234secret');
    expect(redact('a abcd1234secret b abcd1234secret')).toBe('a [REDACTED] b [REDACTED]');
  });
  it('removes key-like query parameters', () => {
    expect(redact('https://x/?api_key=zzz&token=yyy&q=1')).toBe(
      'https://x/?api_key=[REDACTED]&token=[REDACTED]&q=1',
    );
  });
  it('ignores very short secrets to avoid mangling text', () => {
    registerSecret('ab');
    expect(redact('abc')).toBe('abc');
  });
});
