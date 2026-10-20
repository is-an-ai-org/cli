import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { isJwtExpired } from '../dist/lib/auth.js';

const jwt = (payload) => `test.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.signature`;

test('API sessions reject expired, missing and malformed expiry claims', () => {
  assert.equal(isJwtExpired(jwt({ exp: Date.now() / 1000 + 60 })), false);
  for (const token of [jwt({ exp: 0 }), jwt({}), jwt({ exp: '9999999999' }), jwt(null), 'invalid']) {
    assert.equal(isJwtExpired(token), true);
  }
});

test('whoami and hosting require an active local API session even with a GitHub token', () => {
  const directory = mkdtempSync(join(tmpdir(), 'is-an-ai-auth-test-'));
  const configDir = join(directory, 'is-an-ai');
  mkdirSync(configDir);
  const user = { id: 'test-id', name: 'Test User', email: 'test@example.com' };
  const run = (command) => spawnSync(process.execPath, ['dist/index.js', ...command], {
    encoding: 'utf8', env: { ...process.env, XDG_CONFIG_HOME: directory, GITHUB_TOKEN: 'test-github-token' },
  });
  try {
    writeFileSync(join(configDir, 'config.json'), JSON.stringify({ user, jwt: jwt({ exp: 0 }) }));
    for (const command of [['whoami'], ['hosting', 'test-site']]) {
      const result = run(command);
      assert.equal(result.status, 1);
      assert.match(result.stdout + result.stderr, /No active API session.*is-an-ai login/);
      assert.ok(!(result.stdout + result.stderr).includes(user.email));
      assert.ok(!(result.stdout + result.stderr).includes('test-github-token'));
    }
    writeFileSync(join(configDir, 'config.json'), JSON.stringify({ user, jwt: jwt({ exp: Date.now() / 1000 + 60 }) }));
    const active = run(['whoami']);
    assert.equal(active.status, 0);
    assert.match(active.stdout, /Test User/);
    rmSync(join(configDir, 'config.json'));
    assert.equal(run(['whoami']).status, 1);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('the CLI reports the packaged version', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  const result = spawnSync(process.execPath, ['dist/index.js', '--version'], { encoding: 'utf8' });
  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), pkg.version);
});
