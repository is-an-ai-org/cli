import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRecordPR, getPRStatus } from '../dist/lib/github-client.js';

test('registration and merge checks target the migrated records repository', async (t) => {
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    requests.push({ url, options });
    assert.ok(url.startsWith('https://api.github.com/repos/is-an-ai-org/is-an.ai'));
    if (url.endsWith('/is-an.ai')) return Response.json({ permissions: { push: true } });
    if (url.endsWith('/git/ref/heads/main')) return Response.json({ object: { sha: 'test-main-sha' } });
    if (url.endsWith('/git/refs')) return Response.json({ ref: JSON.parse(options.body).ref });
    if (url.includes('/contents/records/')) return Response.json({ sha: 'record-sha' });
    if (url.endsWith('/pulls')) {
      const body = JSON.parse(options.body);
      assert.equal(body.base, 'main');
      assert.match(body.head, /^add-test-site-/);
      return Response.json({ number: 42, html_url: 'https://github.com/is-an-ai-org/is-an.ai/pull/42' });
    }
    assert.ok(url.endsWith('/pulls/42'));
    return Response.json({ number: 42, state: 'closed', merged: true });
  });

  const result = await createRecordPR('test-token', 'test-site', {
    description: 'test', owner: { github_username: 'test-user', email: 'test@example.com' },
    record: [{ type: 'A', value: '203.0.113.10' }],
  });
  assert.equal(result.prUrl, 'https://github.com/is-an-ai-org/is-an.ai/pull/42');
  assert.equal((await getPRStatus('test-token', result.prNumber)).merged, true);
  assert.equal(requests.length, 6);
});
