#!/usr/bin/env node
// tcg.mjs — a minimal authenticated client for the TCG Sandbox API. Zero dependencies (Node 18+).
//
//   node tcg.mjs <METHOD> <path> [json-body | @file.json]
//   node tcg.mjs GET /games/<id>
//   node tcg.mjs PUT /games/<id> '{"rules":"# Rules"}'
//   node tcg.mjs POST /games @game.json
//
// Credentials (never printed):
//   TCG_SANDBOX_API_KEY       the key itself (tcg_...), or
//   TCG_SANDBOX_API_KEY_FILE  a file holding it (preferred: keeps the key out of shell history)
// Target:
//   TCG_SANDBOX_API           defaults to https://api.tcg-sandbox.com
//
// Prints the JSON response; exits 1 with the status and server message on a non-2xx.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const API_BASE = (process.env.TCG_SANDBOX_API ?? 'https://api.tcg-sandbox.com').replace(/\/$/, '');

export function readCredential() {
  const file = process.env.TCG_SANDBOX_API_KEY_FILE;
  const key = (file ? readFileSync(file, 'utf8') : process.env.TCG_SANDBOX_API_KEY ?? '').trim();
  if (!key) {
    throw new Error('No credential: set TCG_SANDBOX_API_KEY_FILE (preferred) or TCG_SANDBOX_API_KEY. ' +
      'Create a key on tcg-sandbox.com under Account → API Key.');
  }
  return key;
}

export class ApiError extends Error {
  constructor(method, path, status, body) {
    super(`${method} ${path} → ${status}${body ? `: ${body}` : ''}`);
    this.status = status;
    this.body = body;
  }
}

/** One API call. Public reads work without a credential, so auth is attached only when available. */
export async function request(method, path, body, { auth = true } = {}) {
  const headers = { Accept: 'application/json' };
  if (auth) headers.Authorization = `Bearer ${readCredential()}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new ApiError(method, path, res.status, text);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function main() {
  const [method, path, rawBody] = process.argv.slice(2);
  if (!method || !path) {
    console.error('usage: node tcg.mjs <METHOD> <path> [json-body | @file.json]');
    process.exit(2);
  }
  const bodyText = rawBody?.startsWith('@') ? readFileSync(rawBody.slice(1), 'utf8') : rawBody;
  const body = bodyText === undefined ? undefined : JSON.parse(bodyText);
  try {
    const result = await request(method.toUpperCase(), path, body, {
      auth: Boolean(process.env.TCG_SANDBOX_API_KEY_FILE || process.env.TCG_SANDBOX_API_KEY),
    });
    console.log(typeof result === 'string' ? result : JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
