// --------------------------------------------------------
//  MULTIPLAYER P2P MODULE (Trystero + Nostr signaling)
// --------------------------------------------------------
import { joinRoom } from 'trystero/nostr';
import { logConnection, upsertRemotePlayer, removeRemotePlayer as dbRemoveRemotePlayer } from './db.js';

let room = null;
let isHost = false;
let localPeerId = null;
let peers = new Map(); // peerId -> { name, char, ready }
let tick = 0;

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

export function hostGame(roomCode, playerName, charType) {
  isHost = true;
  return _joinRoom(roomCode, playerName, charType);
}

export function joinGame(roomCode, playerName, charType) {
  isHost = false;
  return _joinRoom(roomCode, playerName, charType);
}

export function leaveGame() {
  if (room) {
    room.leave();
    room = null;
  }
  peers.clear();
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

function _joinRoom(roomCode, playerName, charType) {
  const roomId = roomCode.trim().toLowerCase();

  try {
    room = joinRoom({ appId: APP_ID }, roomId);
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

  // Wire up receive handlers
  onMove((data, peerId) => {
    _updatePeerData(peerId, data);
    upsertRemotePlayer(peerId, data).catch(() => {});
    if (_onRemoteMove) _onRemoteMove(peerId, data);
  });

  onShoot((data, peerId) => {
    if (_onRemoteShoot) _onRemoteShoot(peerId, data);
  });

  onChat((data, peerId) => {
    if (_onRemoteChat) _onRemoteChat(peerId, data);
  });

  onWorldSync((data, peerId) => {
    if (_onWorldSyncReceived) _onWorldSyncReceived(peerId, data);
  });

  onPlayerJoin((data, peerId) => {
    peers.set(peerId, { name: data.name, char: data.char, ready: false });
    _logFn(`[MP] ${data.name} joined the room`);
    _updateLobbyUI();
    if (_onPeerJoin) _onPeerJoin(peerId, data);
  });

  onPlayerLeave((data, peerId) => {
    _logFn(`[MP] ${peers.get(peerId)?.name || peerId} left`);
    peers.delete(peerId);
    _updateLobbyUI();
    if (_onPeerLeave) _onPeerLeave(peerId, data);
  });

  onAction((data, peerId) => {
    if (_onRemoteAction) _onRemoteAction(peerId, data);
  });

  // Peer lifecycle
  room.onPeerJoin(peerId => {
    _logFn(`[MP] Peer connected: ${peerId.slice(0, 8)}...`);
    // Send our info to the new peer
    if (sendPlayerJoin) {
      sendPlayerJoin({ name: playerName, char: charType });
    }
    _logConnectionEvent(peerId, 'joined');
    _updateLobbyUI();
  });

  room.onPeerLeave(peerId => {
    const peerInfo = peers.get(peerId);
    _logFn(`[MP] Peer disconnected: ${peerInfo?.name || peerId.slice(0, 8)}`);
    peers.delete(peerId);
    dbRemoveRemotePlayer(peerId).catch(() => {});
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

// Generate a random 4-character room code
export function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}
