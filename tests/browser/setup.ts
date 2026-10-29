import { createServer } from 'node:http';
import { startFakeServer } from './fake-server.js';
export default async function setup() {
	const fake = await startFakeServer();
	process.env.PIAGENT_BROWSER_URL = fake.url;
	// Separate test-only control listener; the production HTTP surface is untouched.
	const control = createServer((req, res) => {
		void (async () => {
			if (req.url === '/expire') await fake.expire();
			res.end(JSON.stringify(fake.stats));
		})();
	});
	await new Promise<void>(resolve => control.listen(0, '127.0.0.1', resolve));
	const address = control.address();
	if (!address || typeof address === 'string') throw new Error('Missing control port');
	process.env.PIAGENT_BROWSER_CONTROL = `http://127.0.0.1:${address.port}`;
	return async () => { control.closeAllConnections(); await new Promise<void>(resolve => control.close(() => resolve())); await fake.close(); };
}
