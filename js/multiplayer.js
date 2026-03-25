// --------------------------------------------------------
//  MULTIPLAYER P2P MODULE (Trystero + Nostr signaling)
// --------------------------------------------------------
import { joinRoom } from 'trystero/nostr';
import { logConnection, upsertRemotePlayer, removeRemotePlayer as dbRemoveRemotePlayer } from './db.js';

let room = null;
let isHost = false;
let localPeerId = null;
let hostPeerId = null; // H3: track who the host peer is (for clients)
let peers = new Map(); // peerId -> { name, char, ready }
let tick = 0;
const kickedPeers = new Set(); // H4: track kicked peers

// Action senders (set when room is joined)
let sendMove = null, onMove = null;
let sendShoot = null, onShoot = null;
let sendChat = null, onChat = null;
let sendWorldSync = null, onWorldSync = null;
let sendPlayerJoin = null, onPlayerJoin = null;
let sendPlayerLeave = null, onPlayerLeave = null;
let sendAction = null, onAction = null;

// Callbacks set by game.js
let _onPeerJoin = null;
let _onPeerLeave = null;
let _onRemoteMove = null;
let _onRemoteShoot = null;
let _onRemoteChat = null;
let _onWorldSyncReceived = null;
let _onRemoteAction = null;
let _logFn = console.log;

const APP_ID = 'duck-theft-auto';

// --------------------------------------------------------
//  PUBLIC API
// --------------------------------------------------------

export function isMultiplayer() { return room !== null; }
export function getIsHost() { return isHost; }
export function getPeers() { return peers; }
export function getLocalPeerId() { return localPeerId; }
export function nextTick() { return ++tick; }

export function setCallbacks({ onPeerJoin, onPeerLeave, onRemoteMove, onRemoteShoot, onRemoteChat, onWorldSyncReceived, onRemoteAction, logFn }) {
  if (onPeerJoin) _onPeerJoin = onPeerJoin;
  if (onPeerLeave) _onPeerLeave = onPeerLeave;
  if (onRemoteMove) _onRemoteMove = onRemoteMove;
  if (onRemoteShoot) _onRemoteShoot = onRemoteShoot;
  if (onRemoteChat) _onRemoteChat = onRemoteChat;
  if (onWorldSyncReceived) _onWorldSyncReceived = onWorldSyncReceived;
  if (onRemoteAction) _onRemoteAction = onRemoteAction;
  if (logFn) _logFn = logFn;
}

export function hostGame(roomCode, playerName, charType, password = '') {
  isHost = true;
  return _joinRoom(roomCode, playerName, charType, password);
}

export function joinGame(roomCode, playerName, charType, password = '') {
  isHost = false;
  return _joinRoom(roomCode, playerName, charType, password);
}

export function leaveGame() {
  if (room) {
    room.leave();
    room = null;
  }
  peers.clear();
  kickedPeers.clear();
  hostPeerId = null;
  isHost = false;
  sendMove = null;
  onMove = null;
  sendShoot = null;
  onShoot = null;
  sendChat = null;
  onChat = null;
  sendWorldSync = null;
  onWorldSync = null;
  sendPlayerJoin = null;
  onPlayerJoin = null;
  sendPlayerLeave = null;
  onPlayerLeave = null;
  sendAction = null;
  onAction = null;
  _logFn('[MP] Left game');
  _updateLobbyUI();
}

// Send functions (called by game.js)
export function broadcastMove(data) {
  if (sendMove) sendMove({ ...data, tick: nextTick() });
}

export function broadcastShoot(data) {
  if (sendShoot) sendShoot({ ...data, tick: nextTick() });
}

export function broadcastChat(msg, name) {
  if (sendChat) sendChat({ msg, name, tick: nextTick() });
}

export function broadcastWorldSync(data) {
  if (sendWorldSync) sendWorldSync(data);
}

export function broadcastAction(data) {
  if (sendAction) sendAction({ ...data, tick: nextTick() });
}

// --------------------------------------------------------
//  ROOM SETUP (INTERNAL)
// --------------------------------------------------------

function _joinRoom(roomCode, playerName, charType, password = '') {
  const roomId = roomCode.trim().toLowerCase();

  try {
    const config = { appId: APP_ID };
    // Encrypt signaling via Nostr relays if password provided
    // This prevents MITM attacks and hides SDP from relay operators
    if (password) config.password = password;
    room = joinRoom(config, roomId);
  } catch (e) {
    _logFn('[MP] Failed to join room: ' + e.message);
    return false;
  }

  // Create actions
  [sendMove, onMove] = room.makeAction('move');
  [sendShoot, onShoot] = room.makeAction('shoot');
  [sendChat, onChat] = room.makeAction('chat');
  [sendWorldSync, onWorldSync] = room.makeAction('worldSync');
  [sendPlayerJoin, onPlayerJoin] = room.makeAction('playerJoin');
  [sendPlayerLeave, onPlayerLeave] = room.makeAction('playerLeave');
  [sendAction, onAction] = room.makeAction('action');

  // Wire up receive handlers (with security checks)
  onMove((data, peerId) => {
    if (kickedPeers.has(peerId)) return;
    if (!_checkRateLimit(peerId)) return;
    if (!_validateTick(peerId, data.tick)) return;
    if (!_validateMove(peerId, data)) return;
    _updatePeerData(peerId, data);
    upsertRemotePlayer(peerId, data).catch(e => console.warn('[MP]', e.message));
    if (_onRemoteMove) _onRemoteMove(peerId, data);
  });

  onShoot((data, peerId) => {
    if (kickedPeers.has(peerId)) return;
    if (!_checkRateLimit(peerId)) return;
    if (!_validateTick(peerId, data.tick)) return;
    if (_onRemoteShoot) _onRemoteShoot(peerId, data);
  });

  onChat((data, peerId) => {
    if (kickedPeers.has(peerId)) return;
    if (!_checkRateLimit(peerId)) return;
    if (!_validateTick(peerId, data.tick)) return;
    if (_onRemoteChat) _onRemoteChat(peerId, data);
  });

  onWorldSync((data, peerId) => {
    if (kickedPeers.has(peerId)) return;
    if (!_checkRateLimit(peerId)) return;
    // Only clients accept worldSync, and only from the known host
    if (isHost) return;
    if (hostPeerId && peerId !== hostPeerId) return;
    // Accept first worldSync sender as the host
    if (!hostPeerId) hostPeerId = peerId;
    if (_onWorldSyncReceived) _onWorldSyncReceived(peerId, data);
  });

  onPlayerJoin((data, peerId) => {
    if (kickedPeers.has(peerId)) return;
    peers.set(peerId, { name: data.name, char: data.char, ready: false });
    _logFn(`[MP] ${data.name} joined the room`);
    _updateLobbyUI();
    if (_onPeerJoin) _onPeerJoin(peerId, data);
  });

  onPlayerLeave((data, peerId) => {
    if (kickedPeers.has(peerId)) return;
    _logFn(`[MP] ${peers.get(peerId)?.name || peerId} left`);
    peers.delete(peerId);
    _updateLobbyUI();
    if (_onPeerLeave) _onPeerLeave(peerId, data);
  });

  onAction((data, peerId) => {
    if (kickedPeers.has(peerId)) return;
    if (!_checkRateLimit(peerId)) return;
    // Handle kick votes
    if (data.action === 'vote_kick' && data.target) {
      if (!kickVotes.has(data.target)) kickVotes.set(data.target, new Set());
      kickVotes.get(data.target).add(peerId);
      const totalPeers = peers.size + 1;
      const votes = kickVotes.get(data.target).size;
      if (isHost && votes >= Math.ceil(totalPeers / 2)) {
        kickPeer(data.target);
        kickVotes.delete(data.target);
      }
    }
    if (_onRemoteAction) _onRemoteAction(peerId, data);
  });

  // Peer lifecycle
  room.onPeerJoin(peerId => {
    _logFn(`[MP] Peer connected: ${peerId.slice(0, 8)}...`);
    // For clients, track the first peer as the host
    if (!isHost && !hostPeerId) hostPeerId = peerId;
    // Send our info to the new peer
    if (sendPlayerJoin) {
      sendPlayerJoin({ name: playerName, char: charType });
    }
    _logConnectionEvent(peerId, 'joined');
    _updateLobbyUI();
  });

  room.onPeerLeave(peerId => {
    if (!peers.has(peerId)) return; // M8: guard against double-firing
    const peerInfo = peers.get(peerId);
    _logFn(`[MP] Peer disconnected: ${peerInfo?.name || peerId.slice(0, 8)}`);
    peers.delete(peerId);
    dbRemoveRemotePlayer(peerId).catch(e => console.warn('[MP]', e.message));
    _logConnectionEvent(peerId, 'left');
    _updateLobbyUI();
    if (_onPeerLeave) _onPeerLeave(peerId, {});
  });

  // Get our own peer ID from the room selfId
  localPeerId = room.selfId || 'local';

  _logFn(`[MP] ${isHost ? 'Hosting' : 'Joined'} room: ${roomId}`);
  _updateLobbyUI();
  return true;
}

// --------------------------------------------------------
//  PEER DATA
// --------------------------------------------------------

function _updatePeerData(peerId, data) {
  const existing = peers.get(peerId) || {};
  peers.set(peerId, {
    ...existing,
    name: data.name || existing.name,
    char: data.char || existing.char,
    x: data.x ?? existing.x,
    y: data.y ?? existing.y,
    health: data.health ?? existing.health,
    wanted: data.wanted ?? existing.wanted,
    lastUpdate: Date.now()
  });
}

// --------------------------------------------------------
//  CONNECTION LOGGING
// --------------------------------------------------------

async function _logConnectionEvent(peerId, event) {
  let remoteIp = 'unknown';
  try {
    // Trystero exposes getPeers() which returns RTCPeerConnections
    const peerConnections = room?.getPeers?.() || {};
    const pc = peerConnections[peerId];
    if (pc && pc.getStats) {
      const stats = await pc.getStats();
      stats.forEach(report => {
        if (report.type === 'remote-candidate' && report.ip) {
          remoteIp = report.ip;
        }
      });
    }
  } catch (_) { /* IP extraction is best-effort */ }

  try {
    await logConnection(peerId, remoteIp, event);
  } catch (_) { /* DB may not be ready yet */ }
}

// --------------------------------------------------------
//  LOBBY UI
// --------------------------------------------------------

function _updateLobbyUI() {
  const lobbyEl = document.getElementById('mp-lobby');
  if (!lobbyEl) return;

  const playerList = document.getElementById('mp-player-list');
  if (!playerList) return;

  playerList.innerHTML = '';

  // Show self
  const selfEl = document.createElement('div');
  selfEl.style.cssText = 'color:#00ff00;font-size:11px;padding:2px 0';
  selfEl.textContent = `You ${isHost ? '(Host)' : '(Client)'}`;
  playerList.appendChild(selfEl);

  // Show peers
  for (const [peerId, info] of peers) {
    const el = document.createElement('div');
    el.style.cssText = 'color:#ffcc00;font-size:11px;padding:2px 0';
    el.textContent = `${info.name || peerId.slice(0, 8)} - ${info.char || '?'}`;
    playerList.appendChild(el);
  }

  // Update peer count
  const countEl = document.getElementById('mp-peer-count');
  if (countEl) countEl.textContent = peers.size + 1;
}

// Generate a random 6-character room code (crypto-secure)
export function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const arr = new Uint8Array(6);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => chars[b % chars.length]).join('');
}

// --------------------------------------------------------
//  SECURITY: Rate Limiting
// --------------------------------------------------------

const peerRateLimits = new Map(); // peerId -> { count, resetTime }
const RATE_LIMIT_WINDOW = 1000; // 1 second
const RATE_LIMIT_MAX = 30; // max events per second per peer

function _checkRateLimit(peerId) {
  const now = Date.now();
  let rl = peerRateLimits.get(peerId);
  if (!rl || now > rl.resetTime) {
    rl = { count: 0, resetTime: now + RATE_LIMIT_WINDOW };
    peerRateLimits.set(peerId, rl);
  }
  rl.count++;
  if (rl.count > RATE_LIMIT_MAX) {
    _logFn(`[SEC] Rate limit exceeded by ${peers.get(peerId)?.name || peerId.slice(0, 8)}`);
    return false;
  }
  return true;
}

// --------------------------------------------------------
//  SECURITY: Tick Validation (reject old/duplicate events)
// --------------------------------------------------------

const peerTicks = new Map(); // peerId -> lastTick

function _validateTick(peerId, eventTick) {
  if (eventTick == null || typeof eventTick !== 'number') return false; // reject events without valid tick
  const lastTick = peerTicks.get(peerId) || 0;
  if (eventTick <= lastTick) {
    return false; // stale or duplicate
  }
  peerTicks.set(peerId, eventTick);
  return true;
}

// --------------------------------------------------------
//  SECURITY: Peer Kick (host only)
// --------------------------------------------------------

const kickVotes = new Map(); // peerId -> Set of voter peerIds

export function kickPeer(peerId) {
  if (!isHost || !room) return;
  const peerInfo = peers.get(peerId);
  _logFn(`[MP] Kicked ${peerInfo?.name || peerId.slice(0, 8)}`);
  _logConnectionEvent(peerId, 'kicked');
  // Track kicked peer so their messages are ignored
  kickedPeers.add(peerId);
  // Try to close the WebRTC connection
  try {
    const peerConnections = room?.getPeers?.() || {};
    const pc = peerConnections[peerId];
    if (pc && pc.close) pc.close();
  } catch (_) { /* best-effort close */ }
  peers.delete(peerId);
  dbRemoveRemotePlayer(peerId).catch(e => console.warn('[MP]', e.message));
  if (sendAction) sendAction({ action: 'peer_kicked', peerId, name: peerInfo?.name });
  _updateLobbyUI();
}

export function voteKick(targetPeerId) {
  if (!room) return;
  if (!kickVotes.has(targetPeerId)) kickVotes.set(targetPeerId, new Set());
  kickVotes.get(targetPeerId).add(localPeerId);
  if (sendAction) sendAction({ action: 'vote_kick', target: targetPeerId });
  // Check if majority voted
  const totalPeers = peers.size + 1;
  const votes = kickVotes.get(targetPeerId).size;
  if (votes >= Math.ceil(totalPeers / 2)) {
    if (isHost) kickPeer(targetPeerId);
    _logFn(`[MP] Kick vote passed for ${peers.get(targetPeerId)?.name || targetPeerId.slice(0, 8)}`);
    kickVotes.delete(targetPeerId);
  }
}

// --------------------------------------------------------
//  SECURITY: Movement Validation (host-side)
// --------------------------------------------------------

function _validateMove(peerId, data) {
  const peer = peers.get(peerId);
  if (!peer || peer.x === undefined) return true; // first move, allow
  const dx = Math.abs((data.x || 0) - (peer.x || 0));
  const dy = Math.abs((data.y || 0) - (peer.y || 0));
  // Reject teleporting (more than 3 tiles per move)
  if (dx > 3 || dy > 3) {
    _logFn(`[SEC] Suspicious move from ${peer.name || peerId.slice(0, 8)}: dx=${dx} dy=${dy}`);
    return false;
  }
  return true;
}
