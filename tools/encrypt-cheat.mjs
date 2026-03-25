#!/usr/bin/env node
// Usage: node tools/encrypt-cheat.mjs <cheatcode> <javascript-code>
// Outputs a base64 blob that can only be decrypted with the cheat code.
//
// Example:
//   node tools/encrypt-cheat.mjs "QUACKGOD" "await conn.query('UPDATE player SET health=999, armor=100'); log('GOD MODE ACTIVATED', 'c-magenta');"
//
// Then paste the output into the CHEAT_BLOBS object in game.js

import { webcrypto } from 'node:crypto';
const crypto = webcrypto;

async function deriveKey(password) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: enc.encode('duck-theft-auto-salt'), iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  );
}

async function encrypt(password, plaintext) {
  const key = await deriveKey(password);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(plaintext));
  // Combine iv + ciphertext into one buffer, then base64
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(ciphertext), iv.length);
  return btoa(String.fromCharCode(...combined));
}

const [,, code, js] = process.argv;
if (!code || !js) {
  console.error('Usage: node tools/encrypt-cheat.mjs <cheatcode> <javascript-code>');
  process.exit(1);
}

const blob = await encrypt(code.toUpperCase(), js);
console.log(`\nCheat code: ${code.toUpperCase()}`);
console.log(`Encrypted blob:\n'${blob}'`);
console.log(`\nAdd to CHEAT_BLOBS in game.js`);
