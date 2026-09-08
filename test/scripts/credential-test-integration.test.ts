/* eslint-disable @n8n/community-nodes/no-restricted-imports -- CI-only harness tests; this file is not shipped in the npm package. */
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const execute = promisify(execFile);

describe('live n8n credential test check', () => {
	it.each([
		['successful test', 200, JSON.stringify({ data: { status: 'OK' } }), true],
		[
			'failed test',
			200,
			JSON.stringify({ data: { status: 'Error', message: 'private-key' } }),
			false,
		],
		['missing result', 200, JSON.stringify({ data: {} }), false],
		['malformed response', 200, 'private-key', false],
		['HTTP failure', 403, 'private-key', false],
	] as const)('handles %s without exposing raw responses', async (_, status, response, passed) => {
		const directory = await mkdtemp(join(tmpdir(), 'pdfrest-credential-check-'));
		let received: { url?: string; method?: string; cookie?: string; body: string } | undefined;
		const server = createServer(async (request, reply) => {
			let body = '';
			for await (const chunk of request) body += chunk;
			received = { url: request.url, method: request.method, cookie: request.headers.cookie, body };
			reply.writeHead(status, { 'Content-Type': 'application/json' });
			reply.end(response);
		});
		try {
			await new Promise<void>((resolve, reject) => {
				server.once('error', reject);
				server.listen(0, '127.0.0.1', resolve);
			});
			const address = server.address();
			if (!address || typeof address === 'string') throw new Error('Expected TCP address');
			const cookies = join(directory, 'cookies.txt');
			const credential = join(directory, 'credential.json');
			await writeFile(
				cookies,
				'# Netscape HTTP Cookie File\n127.0.0.1\tFALSE\t/\tFALSE\t0\tn8n-auth\towner-session\n',
			);
			await writeFile(
				credential,
				JSON.stringify({ apiKey: 'private-key', baseUrl: 'https://api.pdfrest.com' }),
			);
			const result = await execute('bash', [
				resolve('scripts/integration/test-credential.sh'),
				`http://127.0.0.1:${address.port}`,
				cookies,
				'credential-id',
				credential,
				directory,
			]).then(
				(output) => ({ ...output, passed: true }),
				(error: { stdout: string; stderr: string }) => ({ ...error, passed: false }),
			);
			expect(result.passed).toBe(passed);
			expect(result.stdout + result.stderr).not.toContain('private-key');
			expect(received).toMatchObject({
				url: '/rest/credentials/test',
				method: 'POST',
				cookie: 'n8n-auth=owner-session',
			});
			expect(JSON.parse(received!.body)).toEqual({
				credentials: {
					id: 'credential-id',
					name: 'pdfRest CI',
					type: 'pdfRestApi',
					data: { apiKey: 'private-key', baseUrl: 'https://api.pdfrest.com' },
				},
			});
			expect(await readFile(join(directory, 'credential-test-response.json'), 'utf8')).toBe(
				response,
			);
		} finally {
			await new Promise<void>((resolve) => server.close(() => resolve()));
			await rm(directory, { recursive: true, force: true });
		}
	});
});
