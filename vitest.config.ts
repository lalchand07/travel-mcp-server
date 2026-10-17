import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    restoreMocks: true,
    // Tests must never touch the network or need a real key.
    env: { FLIGHTAPI_KEY: '' },
  },
});
