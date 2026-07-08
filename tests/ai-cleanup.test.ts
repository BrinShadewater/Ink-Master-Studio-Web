import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import editImageHandler, { getAiCleanupPrompt, isAllowedOrigin } from '../api/edit-image';
import statusHandler from '../api/ai-cleanup-status';
import { editImageWithGemini, getAiCleanupStatus } from '../services/geminiService';

const createResponse = () => {
  const headers = new Map<string, string>();
  return {
    statusCode: 200,
    body: null as unknown,
    setHeader(name: string, value: string) {
      headers.set(name, value);
    },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
    headers,
  };
};

test('reports AI cleanup unavailable without exposing server secrets', async () => {
  const previous = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  const response = createResponse();

  await statusHandler({ method: 'GET' }, response);

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, {
    configured: false,
    status: 'unavailable',
    provider: 'gemini',
    maxImageBytes: 8 * 1024 * 1024,
    dailyLimitPerOperator: 25,
    supportedActions: [],
  });
  assert.equal(response.headers.get('Cache-Control'), 'no-store');

  if (previous === undefined) {
    delete process.env.GEMINI_API_KEY;
  } else {
    process.env.GEMINI_API_KEY = previous;
  }
});

test('reports AI cleanup supported actions when server key is configured', async () => {
  const previous = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = 'server-only-test-key';
  const response = createResponse();

  await statusHandler({ method: 'GET' }, response);

  assert.equal(response.statusCode, 200);
  assert.equal((response.body as { configured: boolean }).configured, true);
  assert.deepEqual((response.body as { supportedActions: string[] }).supportedActions, ['edge-cleanup']);

  if (previous === undefined) {
    delete process.env.GEMINI_API_KEY;
  } else {
    process.env.GEMINI_API_KEY = previous;
  }
});

test('normalizes AI cleanup capability for the browser UI', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({
    configured: true,
    status: 'available',
    maxImageBytes: 1024,
    dailyLimitPerOperator: 3,
    supportedActions: ['edge-cleanup', 42],
  }), { status: 200 })) as typeof fetch;

  const status = await getAiCleanupStatus();

  assert.equal(status.availability, 'available');
  assert.equal(status.maxImageBytes, 1024);
  assert.equal(status.dailyLimitPerOperator, 3);
  assert.deepEqual(status.supportedActions, ['edge-cleanup']);

  globalThis.fetch = originalFetch;
});

test('browser AI cleanup requests send fixed action ids instead of prompts', async () => {
  const originalFetch = globalThis.fetch;
  let parsedBody: { action?: string; prompt?: string; mimeType?: string } | null = null;
  globalThis.fetch = (async (_input, init) => {
    parsedBody = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ image: 'cleaned-base64' }), { status: 200 });
  }) as typeof fetch;

  const image = await editImageWithGemini('source-base64', 'image/png');

  assert.equal(image, 'cleaned-base64');
  assert.equal(parsedBody?.action, 'edge-cleanup');
  assert.equal(parsedBody?.prompt, undefined);
  assert.equal(parsedBody?.mimeType, 'image/png');

  globalThis.fetch = originalFetch;
});

test('server maps only supported AI cleanup action ids to prompts', () => {
  assert.match(getAiCleanupPrompt('edge-cleanup') ?? '', /edge cleanup/i);
  assert.equal(getAiCleanupPrompt('rewrite-the-design'), null);
  assert.equal(getAiCleanupPrompt(''), null);
});

test('AI cleanup API rejects legacy prompt-only request bodies before Gemini calls', async () => {
  const previous = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = 'server-only-test-key';
  const response = createResponse();

  await editImageHandler({
    method: 'POST',
    headers: { host: 'inkmaster.example' },
    body: {
      base64Image: 'AAAA',
      prompt: 'remove the background',
      mimeType: 'image/png',
    },
  }, response);

  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.body, { error: 'Invalid image request.' });

  if (previous === undefined) {
    delete process.env.GEMINI_API_KEY;
  } else {
    process.env.GEMINI_API_KEY = previous;
  }
});

test('AI cleanup API allows same-origin requests and rejects foreign origins', () => {
  assert.equal(isAllowedOrigin({ headers: { origin: 'https://inkmaster.example', host: 'inkmaster.example' } }), true);
  assert.equal(isAllowedOrigin({ headers: { origin: 'https://evil.example', host: 'inkmaster.example' } }), false);
  assert.equal(isAllowedOrigin({ headers: { host: 'inkmaster.example' } }), true);
});

test('keeps Gemini API keys out of browser-bundled source files', () => {
  const sourceRoots = ['components', 'services'];
  const sourceFiles = sourceRoots.flatMap((root) => {
    const files: string[] = [];
    const visit = (directory: string) => {
      for (const entry of readdirSync(directory)) {
        const path = join(directory, entry);
        if (statSync(path).isDirectory()) {
          visit(path);
        } else if (/\.(ts|tsx)$/.test(path)) {
          files.push(path);
        }
      }
    };
    visit(root);
    return files;
  });

  for (const file of sourceFiles) {
    const source = readFileSync(file, 'utf8');
    assert.equal(source.includes('process.env.GEMINI_API_KEY'), false, `${file} reads server-only Gemini env`);
    assert.equal(source.includes('VITE_GEMINI_API_KEY'), false, `${file} references a browser-public Gemini env`);
    assert.equal(source.includes('NEXT_PUBLIC_GEMINI_API_KEY'), false, `${file} references a browser-public Gemini env`);
  }
});
