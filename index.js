'use strict';

const { appendFileSync } = require('node:fs');
const { randomUUID } = require('node:crypto');
const { EOL } = require('node:os');

class ActionError extends Error {}

// The runner preserves hyphens: api-key becomes INPUT_API-KEY.
function input(name, preserveWhitespace = false) {
  const value = process.env[`INPUT_${name.replace(/ /g, '_').toUpperCase()}`] || '';
  if (!value.trim()) throw new ActionError(`Input "${name}" is required.`);
  return preserveWhitespace ? value : value.trim();
}

function escapeCommand(value) {
  return String(value).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
}

function hasError(value) {
  return Boolean(value) && (typeof value !== 'object' || Object.keys(value).length > 0);
}

function rejectionMessage(result, status, secrets) {
  const variants = secrets.flatMap((secret) => {
    const url = encodeURIComponent(secret);
    const html = secret.replace(/[&<>"']/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[char]);
    const encodings = [secret, url, encodeURI(secret),
      new URLSearchParams({ value: secret }).toString().slice(6),
      html, html.replace(/&#39;/g, '&#x27;'), html.replace(/&#39;/g, '&apos;'),
      Buffer.from(secret).toString('base64'), Buffer.from(secret).toString('base64url')];
    return encodings.flatMap((value) => [value,
      value.replace(/%[0-9A-F]{2}/g, (hex) => hex.toLowerCase())]);
  }).filter(Boolean).sort((a, b) => b.length - a.length);
  const details = [result?.code, result?.error, result?.data?.code,
    result?.data?.error, result?.data?.errors]
    .filter((value) => typeof value === 'string' && value.trim())
    .map((value) => {
      for (const variant of variants) value = value.split(variant).join('***');
      return value.slice(0, 200);
    });
  const summary = `Alive5 rejected the request (HTTP ${status})`;
  return details.length ? `${summary}: ${details.join('; ')}` : summary;
}

function writeOutput(name, value) {
  const text = String(value ?? '');
  let delimiter;
  do { delimiter = `alive5_${randomUUID()}`; } while (text.includes(delimiter));
  appendFileSync(process.env.GITHUB_OUTPUT,
    `${name}<<${delimiter}${EOL}${text}${EOL}${delimiter}${EOL}`, 'utf8');
}

async function main() {
  const apiKey = input('api-key');
  console.log(`::add-mask::${apiKey.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A')}`);
  const to = input('to');
  const phonePattern = /^\+[1-9]\d{7,14}$/;
  if (!phonePattern.test(to)) {
    throw new ActionError('Input "to" must be an E.164 number: + followed by 8–15 digits.');
  }
  const message = input('message', true);
  const from = input('from');
  if (!phonePattern.test(from)) {
    throw new ActionError('Input "from" must be an E.164 number: + followed by 8–15 digits.');
  }
  const channelId = input('channel-id');
  const userId = input('user-id');
  if (!process.env.GITHUB_OUTPUT) throw new ActionError('GITHUB_OUTPUT is required.');
  // Check output access before submitting an SMS.
  appendFileSync(process.env.GITHUB_OUTPUT, '', 'utf8');

  let response;
  let body;
  try {
    response = await fetch('https://api.alive5.com/public/1.0/conversations/sms/send', {
      method: 'POST',
      headers: { 'X-A5-APIKEY': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channel_id: channelId,
        user_id: userId,
        phone_number_from: from,
        phone_number_to: to,
        message,
      }),
      redirect: 'error',
      signal: AbortSignal.timeout(20000),
    });
    body = await response.text();
  } catch {
    throw new ActionError('Alive5 request failed. Check conversation history before retrying.');
  }

  let result;
  try { result = JSON.parse(body); } catch { /* Handle non-JSON errors below. */ }
  if (!response.ok) {
    throw new ActionError(rejectionMessage(result, response.status, [apiKey, message]));
  }
  const code = Number(result?.code);
  if (!Number.isFinite(code) || code < 200 || code >= 400
      || hasError(result?.error) || Number(result?.data?.code) >= 400
      || hasError(result?.data?.error) || hasError(result?.data?.errors)) {
    throw new ActionError(rejectionMessage(result, response.status, [apiKey, message]));
  }
  const sent = result?.data?.data;
  if (!sent?.message_id) {
    throw new ActionError(`Alive5 rejected the request (HTTP ${response.status})`);
  }
  writeOutput('message-id', sent.message_id);
  writeOutput('conversation-id', sent.thread_id);
  console.log('Alive5 accepted the SMS submission.');
}

main().catch((error) => {
  const message = error instanceof ActionError ? error.message : 'Alive5 action failed.';
  console.error(`::error::${escapeCommand(message)}`);
  process.exitCode = 1;
});
