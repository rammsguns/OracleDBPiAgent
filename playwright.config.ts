import { defineConfig } from '@playwright/test';
export default defineConfig({
	testDir: './tests/browser',
	globalSetup: './tests/browser/setup.ts',
	workers: 1,
	fullyParallel: false,
	use: { browserName: 'chromium', headless: true },
	outputDir: 'var/browser-results',
	reporter: 'list',
});
