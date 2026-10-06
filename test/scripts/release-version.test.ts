/* eslint-disable @n8n/community-nodes/no-restricted-imports -- CI-only release tooling tests, excluded from the published package. */
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { env } from 'node:process';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
// @ts-expect-error Release helper is plain ESM without TypeScript declarations.
import { releaseVersion } from '../../scripts/release/release-version.mjs';
// @ts-expect-error Vitest supports raw-file imports.
import publishWorkflow from '../../.github/workflows/publish.yml?raw';

const execute = promisify(execFile);

describe('GitHub Release version', () => {
	it.each(['v0.0.0', 'v0.1.2', 'v1.1.2', 'v12.34.56'])(
		'derives %s without consulting a source manifest',
		(tag) => {
			expect(releaseVersion(tag, 'false', `refs/tags/${tag}`)).toBe(tag.slice(1));
		},
	);
	it.each([
		'1.1.2',
		'v01.1.2',
		'v1.01.2',
		'v1.1.02',
		'v1.2',
		'v1.2.3-beta.1',
		'v1.2.3+build',
		'v1.2.3\n',
		'v1.2.3;echo nope',
	])('rejects malformed tag %s', (tag) => {
		expect(() => releaseVersion(tag, 'false', `refs/tags/${tag}`)).toThrow();
	});
	it('rejects a release marked as prerelease even with a stable tag', () => {
		expect(() => releaseVersion('v1.1.2', 'true', 'refs/tags/v1.1.2')).toThrow();
	});
	it('rejects a release tag that differs from the checked-out event ref', () => {
		expect(() => releaseVersion('v1.1.2', 'false', 'refs/tags/v1.1.1')).toThrow();
	});
	it('uses only the published release trigger and versions all build jobs before installation', () => {
		expect(publishWorkflow).toMatch(/on:\n {2}release:\n {4}types: \[published\]/);
		expect(publishWorkflow).not.toMatch(/^ {2}(push|workflow_dispatch):/m);
		for (const name of ['static', 'live', 'publish']) {
			const job = publishWorkflow.split(`\n  ${name}:\n`)[1].split(/\n {2}[a-z-]+:\n/)[0];
			expect(job).toContain('validate-tag');
			expect(job.indexOf('Apply release version to temporary checkout')).toBeLessThan(
				job.indexOf('Install dependencies'),
			);
			expect(job).toContain('PACKAGE_VERSION: ${{ needs.validate-tag.outputs.version }}');
		}
	});
	it('waits for the published package before provenance verification and scanning', () => {
		const job = publishWorkflow.split('\n  verify-published:\n')[1];
		expect(job).toContain('Wait for complete npm package availability');
		expect(job.indexOf('Wait for complete npm package availability')).toBeLessThan(
			job.indexOf('Verify release provenance'),
		);
		expect(job.indexOf('Verify release provenance')).toBeLessThan(
			job.indexOf('Run n8n community package scan'),
		);
	});
	it.each(['0.1.1', '1.1.2'])(
		'updates both manifests from %s without executing lifecycle scripts',
		async (initialVersion) => {
			const directory = await mkdtemp(join(tmpdir(), 'pdfrest-release-version-'));
			try {
				const manifest = {
					name: '@pdfrest/n8n-nodes-pdfrest',
					version: initialVersion,
					scripts: {
						preversion: 'node -e "process.exit(91)"',
						version: 'node -e "process.exit(92)"',
						postversion: 'node -e "process.exit(93)"',
					},
				};
				const lock = {
					name: manifest.name,
					version: initialVersion,
					lockfileVersion: 3,
					requires: true,
					packages: { '': { name: manifest.name, version: initialVersion } },
				};
				await writeFile(join(directory, 'package.json'), JSON.stringify(manifest));
				await writeFile(join(directory, 'package-lock.json'), JSON.stringify(lock));
				const command = publishWorkflow.match(/run: (npm version[^\n]+)/)[1];
				await execute('bash', ['-c', command], {
					cwd: directory,
					env: {
						...env,
						PACKAGE_VERSION: releaseVersion('v1.1.2', 'false', 'refs/tags/v1.1.2'),
					},
				});
				const updated = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'));
				const updatedLock = JSON.parse(
					await readFile(join(directory, 'package-lock.json'), 'utf8'),
				);
				expect(updated).toEqual({ ...manifest, version: '1.1.2' });
				expect(updatedLock.version).toBe('1.1.2');
				expect(updatedLock.packages[''].version).toBe('1.1.2');
			} finally {
				await rm(directory, { recursive: true, force: true });
			}
		},
	);
});
