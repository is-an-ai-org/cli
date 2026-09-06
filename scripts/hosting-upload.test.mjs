import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deployHosting } from '../dist/lib/api-client.js';

test('hosting uploads directly to S3 before confirming, and stops on upload failure', async (t) => {
  const calls = [];
  let failUpload = false;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push(url);
    if (url.endsWith('/prepare')) {
      assert.equal(options.method, 'POST');
      assert.equal(options.headers.Authorization, 'Bearer test-jwt');
      assert.deepEqual(JSON.parse(options.body), { files: [
        { path: 'index.html', size: 5, contentType: 'text/html' },
      ] });
      return Response.json({ uploadUrls: [{ path: 'index.html', url: 'https://s3.example.com/index.html' }] });
    }
    if (url.startsWith('https://s3.example.com/')) {
      assert.equal(options.method, 'PUT');
      assert.equal(options.headers.Authorization, undefined);
      assert.equal(Buffer.from(options.body).toString(), 'hello');
      return new Response(null, { status: failUpload ? 500 : 200 });
    }
    assert.ok(url.endsWith('/confirm'));
    assert.deepEqual(JSON.parse(options.body), { files: [{ path: 'index.html', size: 5 }] });
    return Response.json({ subdomain: 'test-site', url: 'https://test-site.is-an.ai', fileCount: 1, totalSize: 5 });
  });
  const files = new Map([['index.html', Buffer.from('hello')]]);
  assert.equal((await deployHosting('test-jwt', 'test-site', files)).fileCount, 1);
  assert.deepEqual(calls, [
    'https://api.is-an.ai/v3/hosting/test-site/prepare',
    'https://s3.example.com/index.html',
    'https://api.is-an.ai/v3/hosting/test-site/confirm',
  ]);
  calls.length = 0;
  failUpload = true;
  await assert.rejects(deployHosting('test-jwt', 'test-site', files), /Upload failed/);
  assert.equal(calls.length, 2);
});
