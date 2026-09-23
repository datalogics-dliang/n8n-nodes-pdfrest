const registryOrigin = 'https://registry.npmjs.org';
const packageName = '@pdfrest/n8n-nodes-pdfrest';
const timeoutMs = 20 * 60 * 1000;
const intervalMs = 10 * 1000;

function isTransientStatus(status) {
	return status === 404 || status === 429 || status >= 500;
}

function registryUrl(value, field) {
	const url = new URL(value);
	if (url.origin !== registryOrigin || url.username || url.password) {
		throw new Error(`Missing or unexpected npm ${field} URL`);
	}
	return url;
}

async function responseFor(url, options, fetchImpl) {
	try {
		const response = await fetchImpl(url, { ...options, signal: AbortSignal.timeout(30_000) });
		if (response.ok) return response;
		if (isTransientStatus(response.status)) return undefined;
		throw new Error(`Registry request failed with HTTP ${response.status}`);
	} catch (error) {
		if (error.name === 'TimeoutError' || error.name === 'TypeError') return undefined;
		throw error;
	}
}

export async function publishedPackageIsAvailable(version, fetchImpl = fetch) {
	const manifest = await responseFor(
		`${registryOrigin}/${encodeURIComponent(packageName)}/${version}`,
		{},
		fetchImpl,
	);
	if (!manifest) return false;
	const body = await manifest.json();
	if (body.name !== packageName || body.version !== version) {
		throw new Error('Published package name or version does not match the release');
	}
	const attestation = registryUrl(body.dist?.attestations?.url, 'attestation');
	const tarball = registryUrl(body.dist?.tarball, 'tarball');
	return Boolean(
		(await responseFor(attestation, {}, fetchImpl)) &&
			(await responseFor(tarball, { method: 'HEAD' }, fetchImpl)),
	);
}

export async function waitForPublishedPackage(
	version,
	{ fetchImpl = fetch, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), now = Date.now } = {},
) {
	if (!/^\d+\.\d+\.\d+$/.test(version ?? '')) throw new Error('Invalid package version');
	const deadline = now() + timeoutMs;
	for (;;) {
		if (await publishedPackageIsAvailable(version, fetchImpl)) return;
		if (now() >= deadline) break;
		await sleep(Math.min(intervalMs, deadline - now()));
	}
	throw new Error(`npm package ${packageName}@${version} did not become fully available within 20 minutes`);
}

if (process.argv[1]?.endsWith('/wait-for-published-package.mjs')) {
	waitForPublishedPackage(process.argv[2]).then(
		() => console.log(`npm package ${packageName}@${process.argv[2]} is fully available`),
		(error) => {
			console.error(`Package availability verification failed: ${error.message}`);
			process.exitCode = 1;
		},
	);
}
