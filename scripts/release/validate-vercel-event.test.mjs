import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateBranchHead, validateDeploymentEvent } from './validate-vercel-event.mjs';

const sha = 'a'.repeat(40);
const settings = { projectId: 'prj_fixture', projectName: 'ecommerce-store', repository: 'joydas65/Ecommerce-Store' };
const fixture = () => ({
  action: 'vercel.deployment.ready',
  sender: { login: 'vercel[bot]', type: 'Bot' },
  repository: { full_name: settings.repository, default_branch: 'main' },
  client_payload: {
    project: { id: settings.projectId, name: settings.projectName },
    id: 'dpl_fixture', environment: 'production', git: { ref: 'main', sha },
    url: 'https://ecommerce-store-abc123-joys-projects.vercel.app',
  },
});

test('attributes a trusted deployment to its own commit and environment', () => {
  const deployment = validateDeploymentEvent(fixture(), settings);
  assert.equal(deployment.sha, sha);
  assert.equal(deployment.statusContext, 'Vercel - Ecommerce-Store: production browser checks');
  assert.equal(deployment.url, fixture().client_payload.url);
  validateBranchHead(deployment, { object: { type: 'commit', sha } });
});

test('allows a current repository-owned preview branch without sharing production status', () => {
  const event = fixture();
  event.client_payload.environment = 'preview';
  event.client_payload.git.ref = 'codex/release-preview';
  assert.equal(validateDeploymentEvent(event, settings).statusContext, 'Vercel - Ecommerce-Store: preview browser checks');
});

for (const [name, mutate] of [
  ['untrusted sender', (event) => { event.sender.login = 'someone-else'; }],
  ['post-promotion event', (event) => { event.action = 'vercel.deployment.success'; }],
  ['another project', (event) => { event.client_payload.project.id = 'prj_other'; }],
  ['another repository', (event) => { event.repository.full_name = 'someone/fork'; }],
  ['fork pull ref', (event) => { event.client_payload.git.ref = 'pull/1/head'; }],
  ['non-main production', (event) => { event.client_payload.git.ref = 'feature'; }],
  ['injected commit', (event) => { event.client_payload.git.sha = `${sha}\nextra=value`; }],
  ['foreign host', (event) => { event.client_payload.url = 'https://ecommerce-store.example.com'; }],
  ['credentials in URL', (event) => { event.client_payload.url = 'https://user:password@ecommerce-store-ab.vercel.app'; }],
  ['redirect query', (event) => { event.client_payload.url += '?redirect=https://example.com'; }],
]) {
  test(`rejects ${name} before any browser secret is available`, () => {
    const event = fixture();
    mutate(event);
    assert.throws(() => validateDeploymentEvent(event, settings));
  });
}

test('rejects a stale commit and missing repository branch', () => {
  const deployment = validateDeploymentEvent(fixture(), settings);
  assert.throws(() => validateBranchHead(deployment, { object: { type: 'commit', sha: 'b'.repeat(40) } }));
  assert.throws(() => validateBranchHead(deployment, {}));
});
