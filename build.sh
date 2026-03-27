#!/bin/bash
# Builds a single playable index.html from the split source files.
# Output: dist/index.html (works with file:// — no server needed)

mkdir -p dist

cat > dist/index.html << 'HTMLHEAD'
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Duck Theft Auto</title>
HTMLHEAD

# Extract <style> block from index.html
sed -n '/<style>/,/<\/style>/p' index.html >> dist/index.html

cat >> dist/index.html << 'HTMLMID'
</head>
<body>
HTMLMID

# Extract body content (between <body> and the first <script)
sed -n '/<body>/,/<script/{ /<body>/d; /<script/d; p; }' index.html >> dist/index.html

# Import map
sed -n '/<script type="importmap">/,/<\/script>/p' index.html >> dist/index.html

# Inline all JS into one module
echo '<script type="module">' >> dist/index.html
echo '// ========================================================' >> dist/index.html
echo '//  DUCK THEFT AUTO — Built from source files' >> dist/index.html
echo '// ========================================================' >> dist/index.html
echo '' >> dist/index.html

# Add CDN imports
echo "import * as THREE from 'three';" >> dist/index.html
echo "import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';" >> dist/index.html
echo "import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';" >> dist/index.html
echo "import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';" >> dist/index.html
echo "import * as duckdb from 'https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.28.0/+esm';" >> dist/index.html
echo "import { joinRoom } from 'trystero/nostr';" >> dist/index.html
echo '' >> dist/index.html
echo 'const $ = id => document.getElementById(id);' >> dist/index.html
echo '' >> dist/index.html

# Inline each source file, stripping imports/exports
for f in js/constants.js js/city.js js/renderer.js js/db.js js/multiplayer.js js/game.js; do
  echo "" >> dist/index.html
  echo "// === $(basename $f) ===" >> dist/index.html
  # Strip single-line imports, multi-line imports, and exports
  perl -0777 -pe '
    s/^import\s+\{[^}]*\}\s+from\s+[^\n]+;//gms;
    s/^import\s+[^\n]+;\n//gm;
    s/^export //gm;
  ' "$f" | grep -v "^const \$ = id => document.getElementById(id);" >> dist/index.html
done

# Add bootstrap
cat >> dist/index.html << 'HTMLBOOT'

// === bootstrap ===
(async () => {
  try {
    initThree();
    createDuck();
    gameLoop();
    await initDB();
    $('loading').style.display = 'none';
    $('title-screen').style.display = 'flex';

    // Join the lobby to discover active games
    joinLobby();
    setOnGamesUpdated(function(games) {
      var listEl = $('mp-game-list');
      if (!listEl) return;
      if (games.size === 0) {
        listEl.innerHTML = '<div style="color:#666;font-size:10px">No games found — host one or enter a code</div>';
        return;
      }
      listEl.innerHTML = '';
      for (var [code, info] of games) {
        var row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:3px;font-size:11px';
        var lock = info.hasPassword ? '<span title="Password required" style="color:#ff8800">&#128274;</span> ' : '';
        var label = document.createElement('span');
        label.style.color = '#aaa';
        var _esc = function(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); };
        label.innerHTML = lock + '<span style="color:#ffcc00">' + _esc(info.host) + '</span> — ' + _esc(info.city) + ' — ' + Math.floor(Number(info.players)||1) + ' player' + (info.players !== 1 ? 's' : '');
        row.appendChild(label);
        var joinBtn = document.createElement('button');
        joinBtn.textContent = 'Join';
        joinBtn.style.cssText = 'font-size:10px;padding:2px 8px';
        joinBtn.className = 'btn';
        joinBtn.addEventListener('click', (function(c, inf) { return function() {
          $('mp-room-input').value = c;
          if (inf.hasPassword && !$('mp-password').value) {
            $('mp-password').focus();
            $('mp-password').placeholder = 'Password required for this game';
            return;
          }
          window.joinMultiplayer();
        }; })(code, info));
        row.appendChild(joinBtn);
        listEl.appendChild(row);
      }
    });
    $('mp-game-list').innerHTML = '<div style="color:#666;font-size:10px">Searching for games...</div>';
    setInterval(function() { if ($('title-screen').style.display !== 'none') queryLobby(); }, 8000);

    // Character card selection
    var cards = document.querySelectorAll('.char-card');
    var nameInput = $('player-name-input');
    cards.forEach(function(card) {
      card.addEventListener('click', function() {
        cards.forEach(function(c) { c.classList.remove('selected'); });
        card.classList.add('selected');
        nameInput.value = '';
      });
    });

    // Populate saved sessions list
    var saveIndex = getSaveIndex();
    var entries = Object.values(saveIndex).sort(function(a, b) { return (b.timestamp || 0) - (a.timestamp || 0); });
    if (entries.length > 0) {
      $('saved-sessions').style.display = 'block';
      var list = $('saved-list');
      for (var s of entries) {
        var btn = document.createElement('button');
        btn.className = 'btn';
        btn.style.cssText = 'font-size:11px;padding:6px 12px;';
        var date = s.timestamp ? new Date(s.timestamp).toLocaleDateString() : '';
        btn.innerHTML = '<span style="color:#ff6600">' + s.name + '</span> <span style="color:#888">' + s.city + ' Day ' + s.day + ' $' + (s.cash||0).toLocaleString() + '</span> <span style="color:#666;font-size:9px">' + date + '</span>';
        btn.addEventListener('click', (function(name) { return function() { window.loadGame(name); }; })(s.name));
        list.appendChild(btn);
      }
    }
    // Room code copy-to-clipboard
    $('mp-room-code').addEventListener('click', function() {
      var code = $('mp-room-code').textContent;
      if (!code) return;
      navigator.clipboard.writeText(code).then(function() {
        var el = $('mp-room-code');
        var orig = el.textContent;
        el.textContent = 'Copied!';
        el.style.color = '#44ff44';
        setTimeout(function() { el.textContent = orig; el.style.color = '#ff6600'; }, 1200);
      });
    });

    // Multiplayer handlers
    window.hostMultiplayer = async function() {
      var card = document.querySelector('.char-card.selected');
      if (!card) { card = document.querySelector('.char-card'); if (card) card.classList.add('selected'); }
      if (!card) return;
      var charName = card.dataset.name || 'CJ';
      var playerName = $('player-name-input').value.trim() || charName;
      var code = generateRoomCode();
      var password = $('mp-password').value;
      hostGame(code, playerName, charName, password);
      try { await window.startNewGame(); } catch(err) { console.error('host failed:', err); alert('Failed: ' + err.message); return; }
      broadcastAction({ action: 'game_start', npcSeed: window._npcSeedValue, city: card.dataset.city });
    };
    window.joinMultiplayer = async function() {
      var code = $('mp-room-input').value.trim().toUpperCase();
      if (!code || code.length < 2) return;
      var card = document.querySelector('.char-card.selected');
      if (!card) { card = document.querySelector('.char-card'); if (card) card.classList.add('selected'); }
      if (!card) return;
      var charName = card.dataset.name || 'CJ';
      var playerName = $('player-name-input').value.trim() || charName;
      var password = $('mp-password').value;
      joinGame(code, playerName, charName, password);
      // Wait for host's worldSync to get correct seed before starting
      $('mp-lobby').style.display = 'block';
      $('mp-room-code').textContent = code;
      $('mp-waiting').textContent = 'Connecting to host...';
      $('mp-waiting').style.display = 'inline';
    };
    window.leaveMultiplayer = function() {
      leaveGame();
      $('mp-lobby').style.display = 'none';
    };
    window.startMultiplayerGame = async function() {
      await window.startNewGame();
      if (getIsHost()) {
        broadcastAction({ action: 'game_start', npcSeed: window._npcSeedValue });
      }
    };

    // Chat input handlers
    var chatInput = $('mp-chat-input');
    if (chatInput) {
      chatInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          var msg = chatInput.value.trim();
          if (msg && isMultiplayer()) {
            var nameEl = $('hud-name');
            var name = nameEl ? nameEl.textContent : 'You';
            broadcastChat(msg, name);
            var logEl = $('event-log');
            if (logEl) {
              var div = document.createElement('div');
              div.className = 'log-entry c-yellow';
              div.textContent = '[' + name + '] ' + msg;
              logEl.appendChild(div);
              logEl.scrollTop = logEl.scrollHeight;
            }
          }
          chatInput.style.display = 'none';
          chatInput.value = '';
          chatInput.blur();
        } else if (e.key === 'Escape') {
          chatInput.style.display = 'none';
          chatInput.value = '';
          chatInput.blur();
        }
        e.stopPropagation();
      });
    }

  } catch (e) {
    $('loading').textContent = 'Failed to load: ' + e.message;
    console.error(e);
  }
})();
</script>
</body>
</html>
HTMLBOOT

echo "Built dist/index.html ($(wc -l < dist/index.html) lines)"
