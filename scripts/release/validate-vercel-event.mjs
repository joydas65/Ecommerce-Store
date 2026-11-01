import { appendFile, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export function validateDeploymentEvent(event, { projectId, projectName, repository }) {
  if (!projectId || !/^[a-z0-9-]+$/.test(projectName || '')) {
    throw new Error('Set VERCEL_PROJECT_ID and VERCEL_PROJECT_NAME repository variables first.');
  }
  if (event.action !== 'vercel.deployment.ready' || event.sender?.login !== 'vercel[bot]' || event.sender?.type !== 'Bot') {
    throw new Error('Only deployment-ready events from the Vercel GitHub app are accepted.');
  }
  if (event.repository?.full_name !== repository) throw new Error('The deployment event targets another repository.');
  const deployment = event.client_payload;
  if (deployment?.project?.id !== projectId || deployment.project.name !== projectName) {
    throw new Error('The deployment does not belong to the configured Vercel project.');
  }
  if (!['production', 'preview'].includes(deployment.environment)) throw new Error('Unsupported deployment environment.');
  if (!/^dpl_[A-Za-z0-9]+$/.test(deployment.id || '')) throw new Error('Invalid deployment ID.');
  if (!/^[a-f0-9]{40}$/.test(deployment.git?.sha || '')) throw new Error('Invalid deployment commit.');
  const ref = deployment.git.ref;
  if (typeof ref !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(ref)
    || ref.includes('..') || ref.startsWith('refs/') || ref.startsWith('pull/')) {
    throw new Error('Only repository-owned branch names are accepted.');
  }
  if (deployment.environment === 'production' && ref !== event.repository.default_branch) {
    throw new Error('Production checks require the repository default branch.');
  }
  const url = new URL(deployment.url);
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash || url.pathname !== '/'
    || !url.hostname.startsWith(`${projectName}-`) || !url.hostname.endsWith('.vercel.app')) {
    throw new Error('Expected the immutable HTTPS deployment URL for this Vercel project.');
  }
  return {
    sha: deployment.git.sha,
    ref,
    url: url.origin,
    environment: deployment.environment,
    deploymentId: deployment.id,
    statusContext: `Vercel - ${repository.split('/')[1]}: ${deployment.environment} browser checks`,
  };
}

export function validateBranchHead(deployment, head) {
  if (head?.object?.type !== 'commit' || head.object.sha !== deployment.sha) {
    throw new Error('The deployment is stale or does not match a branch in this repository.');
  }
}

async function main() {
  const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, 'utf8'));
  const repository = process.env.GITHUB_REPOSITORY;
  const deployment = validateDeploymentEvent(event, {
    projectId: process.env.VERCEL_PROJECT_ID,
    projectName: process.env.VERCEL_PROJECT_NAME,
    repository,
  });
  const response = await fetch(`https://api.github.com/repos/${repository}/git/ref/heads/${encodeURIComponent(deployment.ref)}`, {
    headers: {
      Authorization: `Bearer ${process.env.GH_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (!response.ok) throw new Error(`Unable to verify a repository-owned branch (HTTP ${response.status}).`);
  validateBranchHead(deployment, await response.json());
  await appendFile(process.env.GITHUB_OUTPUT, Object.entries(deployment).map(([key, value]) => `${key}=${value}\n`).join(''));
  console.log(`Verified ${deployment.environment} deployment for ${deployment.ref} at ${deployment.sha.slice(0, 7)}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
