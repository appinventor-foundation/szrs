import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		environment: 'node',
		expect: { requireAssertions: true },
		// Integration tests share one real Postgres database with no per-test
		// isolation, so files must not run concurrently against it.
		fileParallelism: false
	}
});
