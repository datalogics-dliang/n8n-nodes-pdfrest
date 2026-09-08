import { pathToFileURL } from 'node:url';

export function releaseVersion(tag, prerelease, ref) {
	if (prerelease !== 'false') throw new Error('Only stable GitHub Releases can publish');
	if (typeof tag !== 'string' || !/^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(tag)) {
		throw new Error('Release tag must be vMAJOR.MINOR.PATCH without leading zeros');
	}
	if (ref !== `refs/tags/${tag}`) throw new Error('Release tag does not match the workflow ref');
	return tag.slice(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	try {
		console.log(releaseVersion(...process.argv.slice(2)));
	} catch (error) {
		console.error(error.message);
		process.exitCode = 1;
	}
}
