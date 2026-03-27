// --------------------------------------------------------
//  MULTIPLAYER P2P MODULE (Trystero + Nostr signaling)
// --------------------------------------------------------
import { joinRoom } from 'trystero/nostr';
import { logConnection, upsertRemotePlayer, removeRemotePlayer } from './db.js';

let room = null;
let isHost = false;
let localPeerId = null;
let hostPeerId = null; // H3: track who the host peer is (for clients)
let peers = new Map(); // peerId -> { name, char, ready }
let tick = 0;
const kickedPeers = new Set(); // H4: track kicked peers

// --------------------------------------------------------
//  LOBBY DISCOVERY — shared room for game announcements
// --------------------------------------------------------
let lobbyRoom = null;
let sendLobbyAnnounce = null, onLobbyAnnounce = null;
let sendLobbyQuery = null, onLobbyQuery = null;
const discoveredGames = new Map(); // roomCode -> { host, players, city, hasPassword, ts }
let _onGamesUpdated = null; // callback for UI
let lobbyAnnounceInterval = null;

export function setOnGamesUpdated(fn) { _onGamesUpdated = fn; }

export function getDiscoveredGames() { return discoveredGames; }

export function joinLobby() {
  if (lobbyRoom) return;
  try {
    lobbyRoom = joinRoom({ appId: APP_ID }, '__lobby__');
  } catch (e) {
    console.warn('[MP] Lobby join failed:', e.message);
    return;
  }

  [sendLobbyAnnounce, onLobbyAnnounce] = lobbyRoom.makeAction('announce');
  [sendLobbyQuery, onLobbyQuery] = lobbyRoom.makeAction('query');

  // When we hear a game announcement, store it
  onLobbyAnnounce((data) => {
    if (!data.code) return;
    discoveredGames.set(data.code, {
      host: data.host || '?',
      players: data.players || 1,
      city: data.city || '?',
      hasPassword: !!data.hasPassword,
      ts: Date.now()
    });
    _pruneStaleGames();
    if (_onGamesUpdated) _onGamesUpdated(discoveredGames);
  });

  // Respond to queries with our game info (if hosting)
  onLobbyQuery(() => {
    if (isHost && room && sendLobbyAnnounce) {
      _broadcastGameToLobby();
    }
  });

  // On joining lobby, ask existing hosts to announce themselves
  lobbyRoom.onPeerJoin(() => {
    if (sendLobbyQuery) sendLobbyQuery({});
  });

  // Query immediately for any existing hosts
  setTimeout(() => { if (sendLobbyQuery) sendLobbyQuery({}); }, 500);
}

export function queryLobby() {
  _pruneStaleGames();
  if (_onGamesUpdated) _onGamesUpdated(discoveredGames);
  if (sendLobbyQuery) sendLobbyQuery({});
}

export function leaveLobby() {
  if (lobbyRoom) {
    lobbyRoom.leave();
    lobbyRoom = null;
  }
  sendLobbyAnnounce = null;
  onLobbyAnnounce = null;
  sendLobbyQuery = null;
  onLobbyQuery = null;
  if (lobbyAnnounceInterval) { clearInterval(lobbyAnnounceInterval); lobbyAnnounceInterval = null; }
}

function _broadcastGameToLobby() {
  if (!sendLobbyAnnounce || !room) return;
  sendLobbyAnnounce({
    code: _currentRoomCode,
    host: _currentPlayerName,
    players: peers.size + 1,
    city: _currentCity || '?',
    hasPassword: _currentHasPassword
  });
}

function _pruneStaleGames() {
  const cutoff = Date.now() - 30000; // 30s stale
  for (const [code, info] of discoveredGames) {
    if (info.ts < cutoff) discoveredGames.delete(code);
  }
}

// Host announces periodically
function _startLobbyAnnouncing() {
  if (lobbyAnnounceInterval) clearInterval(lobbyAnnounceInterval);
  _broadcastGameToLobby();
  lobbyAnnounceInterval = setInterval(() => _broadcastGameToLobby(), 10000);
}

let _currentRoomCode = '';
let _currentPlayerName = '';
let _currentCharType = '';
let _currentHasPassword = false;
let _currentCity = '';

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
export function getLocalPeerId() {
  // Re-check selfId in case it was set after room creation
  if (!localPeerId && room?.selfId) localPeerId = room.selfId;
  return localPeerId;
}
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
  _currentRoomCode = roomCode;
  _currentPlayerName = playerName;
  _currentCharType = charType;
  _currentHasPassword = !!password;
  const result = _joinRoom(roomCode, playerName, charType, password);
  if (result) _startLobbyAnnouncing();
  return result;
}

export function joinGame(roomCode, playerName, charType, password = '') {
  isHost = false;
  _currentCharType = charType;
  return _joinRoom(roomCode, playerName, charType, password);
}

export function setCurrentCity(city) { _currentCity = city; }

export function leaveGame() {
  if (lobbyAnnounceInterval) { clearInterval(lobbyAnnounceInterval); lobbyAnnounceInterval = null; }
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

export function broadcastWorldSync(data, targetPeerId) {
  if (sendWorldSync) {
    if (targetPeerId) sendWorldSync(data, targetPeerId);
    else sendWorldSync(data);
  }
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
    console.log('[MP] Connecting to room:', roomId, 'config:', { ...config, password: password ? '***' : undefined });
    room = joinRoom(config, roomId);
    console.log('[MP] Room object created, waiting for peers...');
  } catch (e) {
    _logFn('[MP] Failed to join room: ' + e.message);
    console.error('[MP] Room join error:', e);
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
      if (isHost && votes >= Math.max(2, Math.ceil(totalPeers / 2))) {
        kickPeer(data.target);
        kickVotes.delete(data.target);
      }
    }
    if (_onRemoteAction) _onRemoteAction(peerId, data);
  });

  // Peer lifecycle
  room.onPeerJoin(peerId => {
    _logFn(`[MP] Peer connected: ${peerId.slice(0, 8)}...`);
    // hostPeerId is set only when we receive a worldSync (not on first peer join)
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
    peerRateLimits.delete(peerId);
    peerTicks.delete(peerId);
    removeRemotePlayer(peerId).catch(e => console.warn('[MP]', e.message));
    _logConnectionEvent(peerId, 'left');

    // Host migration: if the host left, promote ourselves
    if (!isHost && peerId === hostPeerId) {
      hostPeerId = null;
      // Become the new host if there are remaining peers (or we're alone)
      if (peers.size === 0 || _shouldBecomeHost()) {
        isHost = true;
        _currentRoomCode = roomCode;
        _currentPlayerName = playerName;
        _currentHasPassword = !!password;
        _logFn('[MP] Host left — you are now the host!');
        _startLobbyAnnouncing();
      }
    }

    _updateLobbyUI();
    if (_onPeerLeave) _onPeerLeave(peerId, {});
  });

  // Get our own peer ID from the room selfId
  // selfId may not be available immediately — also capture it on first peer join
  localPeerId = room.selfId || null;

  _logFn(`[MP] ${isHost ? 'Hosting' : 'Joined'} room: ${roomId}`);
  _updateLobbyUI();
  return true;
}

// Deterministic host election: peer with lowest ID becomes host
function _shouldBecomeHost() {
  const myId = getLocalPeerId();
  if (!myId) return true; // if we can't determine, just take it
  for (const [peerId] of peers) {
    if (peerId < myId) return false; // someone else has a lower ID
  }
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
    gang: data.gang ?? existing.gang ?? '',
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

function _updateMPHud() {
  const bar = document.getElementById('mp-hud-bar');
  if (!bar || !room) { if (bar) bar.style.display = 'none'; return; }
  bar.style.display = 'block';
  const codeEl = document.getElementById('mp-hud-code');
  const countEl = document.getElementById('mp-hud-count');
  const playersEl = document.getElementById('mp-hud-players');
  if (codeEl) codeEl.textContent = _currentRoomCode;
  if (countEl) countEl.textContent = peers.size + 1;
  if (playersEl) {
    playersEl.innerHTML = '';
    // Self
    const selfDiv = document.createElement('div');
    selfDiv.style.cssText = 'color:#00ff00;font-size:10px;padding:1px 0';
    selfDiv.textContent = `${_currentPlayerName || 'You'} (${_currentCharType || '?'}) ${isHost ? '- Host' : ''}`;
    playersEl.appendChild(selfDiv);
    // Peers
    const charColors = { CJ:'#44ff44', Tommy:'#ff4488', Claude:'#aaa', Niko:'#556644', Catalina:'#cc2222', Oz:'#ff00ff' };
    for (const [, info] of peers) {
      const div = document.createElement('div');
      div.style.cssText = `color:${charColors[info.char] || '#ffcc00'};font-size:10px;padding:1px 0`;
      let txt = `${info.name || '?'} (${info.char || '?'})`;
      if (info.gang) txt += ` [${info.gang}]`;
      if (info.health != null) txt += ` ${info.health}HP`;
      if (info.wanted > 0) txt += ' ' + '\u2605'.repeat(info.wanted);
      div.textContent = txt;
      playersEl.appendChild(div);
    }
  }
  // Wire toggle button once
  const toggleBtn = document.getElementById('mp-hud-toggle');
  if (toggleBtn && !toggleBtn._wired) {
    toggleBtn._wired = true;
    toggleBtn.addEventListener('click', () => {
      const pl = document.getElementById('mp-hud-players');
      if (pl) {
        const show = pl.style.display === 'none';
        pl.style.display = show ? 'block' : 'none';
        toggleBtn.textContent = show ? 'Hide' : 'Show';
      }
    });
    // Copy room code
    const codeEl2 = document.getElementById('mp-hud-code');
    if (codeEl2) codeEl2.addEventListener('click', () => {
      navigator.clipboard.writeText(codeEl2.textContent).then(() => {
        const orig = codeEl2.textContent;
        codeEl2.textContent = 'Copied!'; codeEl2.style.color = '#44ff44';
        setTimeout(() => { codeEl2.textContent = orig; codeEl2.style.color = '#ff6600'; }, 1200);
      });
    });
  }
}

function _updateLobbyUI() {
  _updateMPHud();
  const lobbyEl = document.getElementById('mp-lobby');
  if (!lobbyEl) return;

  const playerList = document.getElementById('mp-player-list');
  if (!playerList) return;

  playerList.innerHTML = '';

  // Show self with character badge
  const selfCharColors = { CJ: '#44ff44', Tommy: '#ff4488', Claude: '#aaaaaa', Niko: '#556644', Catalina: '#cc2222', Oz: '#ff00ff' };
  const selfEl = document.createElement('div');
  selfEl.style.cssText = 'display:flex;align-items:center;gap:4px;font-size:11px;padding:2px 0';
  const selfName = document.createElement('span');
  selfName.style.color = '#00ff00';
  selfName.textContent = `${_currentPlayerName || 'You'} ${isHost ? '(Host)' : '(Client)'}`;
  selfEl.appendChild(selfName);
  if (_currentCharType) {
    const selfChar = document.createElement('span');
    const sc = selfCharColors[_currentCharType] || '#ffcc00';
    selfChar.style.cssText = `color:${sc};font-size:10px;border:1px solid ${sc};padding:0 3px;border-radius:3px`;
    selfChar.textContent = _currentCharType;
    selfEl.appendChild(selfChar);
  }
  playerList.appendChild(selfEl);

  // Show peers with character type
  const charColors = { CJ: '#44ff44', Tommy: '#ff4488', Claude: '#aaaaaa', Niko: '#556644', Catalina: '#cc2222', Oz: '#ff00ff' };
  for (const [peerId, info] of peers) {
    const el = document.createElement('div');
    el.style.cssText = 'display:flex;align-items:center;gap:4px;font-size:11px;padding:2px 0';
    const charName = info.char || '?';
    const charColor = charColors[charName] || '#ffcc00';
    const nameSpan = document.createElement('span');
    nameSpan.style.color = '#ffcc00';
    nameSpan.textContent = info.name || peerId.slice(0, 8);
    const charSpan = document.createElement('span');
    charSpan.style.cssText = `color:${charColor};font-size:10px;border:1px solid ${charColor};padding:0 3px;border-radius:3px`;
    charSpan.textContent = charName;
    el.appendChild(nameSpan);
    el.appendChild(charSpan);
    // Show health/wanted if available
    if (info.health != null) {
      const hpSpan = document.createElement('span');
      hpSpan.style.cssText = `color:${info.health > 50 ? '#44ff44' : info.health > 25 ? '#ffcc00' : '#ff4444'};font-size:9px`;
      hpSpan.textContent = `${info.health}HP`;
      el.appendChild(hpSpan);
    }
    if (info.gang) {
      const gSpan = document.createElement('span');
      gSpan.style.cssText = 'color:#aa44ff;font-size:9px';
      gSpan.textContent = info.gang;
      el.appendChild(gSpan);
    }
    if (info.wanted > 0) {
      const wSpan = document.createElement('span');
      wSpan.style.cssText = 'color:#ff4444;font-size:9px';
      wSpan.textContent = '\u2605'.repeat(info.wanted);
      el.appendChild(wSpan);
    }
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
  removeRemotePlayer(peerId).catch(e => console.warn('[MP]', e.message));
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
  if (votes >= Math.max(2, Math.ceil(totalPeers / 2))) {
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
  // Allow reasonable jumps: vehicles move up to 6 tiles, local travel can teleport within city
  // Reject teleporting across the entire map
  if (dx > 200 || dy > 200) {
    _logFn(`[SEC] Suspicious move from ${peer.name || peerId.slice(0, 8)}: dx=${dx} dy=${dy}`);
    return false;
  }
  return true;
}
