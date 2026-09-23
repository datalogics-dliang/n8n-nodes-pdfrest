import { describe, expect, it, vi } from 'vitest';
// @ts-expect-error CI helper is plain ESM and has no TypeScript declarations.
import {
	publishedPackageIsAvailable,
	waitForPublishedPackage,
} from '../../scripts/release/wait-for-published-package.mjs';

const version = '0.2.0';
const manifestUrl = `https://registry.npmjs.org/%40pdfrest%2Fn8n-nodes-pdfrest/${version}`;
const attestationUrl =
	`https://registry.npmjs.org/-/npm/v1/attestations/%40pdfrest%2Fn8n-nodes-pdfrest@${version}`;
const tarballUrl =
	`https://registry.npmjs.org/@pdfrest/n8n-nodes-pdfrest/-/n8n-nodes-pdfrest-${version}.tgz`;

function response(status: number, body?: unknown) {
	return { ok: status >= 200 && status < 300, status, json: async () => body };
}
function packageManifest() {
	return {
		name: '@pdfrest/n8n-nodes-pdfrest',
		version,
		dist: { attestations: { url: attestationUrl }, tarball: tarballUrl },
	};
}

describe('published package availability', () => {
	it('requires the manifest, attestation, and downloadable tarball', async () => {
		const fetch = vi.fn(async (url: URL | string) => {
			if (String(url) === manifestUrl) return response(200, packageManifest());
			return response(200);
		});
		await expect(publishedPackageIsAvailable(version, fetch)).resolves.toBe(true);
		expect(String(fetch.mock.calls[2][0])).toBe(tarballUrl);
		expect(fetch.mock.calls[2][1]).toEqual(expect.objectContaining({ method: 'HEAD' }));
	});
	it.each([manifestUrl, attestationUrl, tarballUrl])('waits when %s is temporarily unavailable', async (missing) => {
		const fetch = vi.fn(async (url: URL | string) => {
			if (String(url) === manifestUrl) {
				return response(String(url) === missing ? 404 : 200, packageManifest());
			}
			return response(String(url) === missing ? 404 : 200);
		});
		await expect(publishedPackageIsAvailable(version, fetch)).resolves.toBe(false);
	});
	it('retries transient availability failures before succeeding', async () => {
		let manifestAttempts = 0;
		const fetch = vi.fn(async (url: URL | string) => {
			if (String(url) === manifestUrl && manifestAttempts++ === 0) return response(404);
			if (String(url) === manifestUrl) return response(200, packageManifest());
			return response(200);
		});
		const sleep = vi.fn().mockResolvedValue(undefined);
		await waitForPublishedPackage(version, { fetchImpl: fetch, sleep });
		expect(sleep).toHaveBeenCalledOnce();
	});
	it('fails immediately for a non-transient registry response', async () => {
		await expect(
			publishedPackageIsAvailable(version, vi.fn().mockResolvedValue(response(401))),
		).rejects.toThrow('HTTP 401');
	});
});
