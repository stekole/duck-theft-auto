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

# Add the two CDN imports
echo "import * as THREE from 'three';" >> dist/index.html
echo "import * as duckdb from 'https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.28.0/+esm';" >> dist/index.html
echo '' >> dist/index.html
echo 'const $ = id => document.getElementById(id);' >> dist/index.html
echo '' >> dist/index.html

# Inline each source file, stripping imports/exports
for f in js/constants.js js/city.js js/renderer.js js/db.js js/game.js; do
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

    // Character card selection
    const cards = document.querySelectorAll('.char-card');
    const nameInput = $('player-name-input');
    cards.forEach(card => {
      card.addEventListener('click', () => {
        cards.forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        nameInput.value = '';
      });
    });
    nameInput.addEventListener('input', () => {
      if (nameInput.value.trim()) cards.forEach(c => c.classList.remove('selected'));
    });

    // Populate saved sessions list
    const saveIndex = getSaveIndex();
    const entries = Object.values(saveIndex).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    if (entries.length > 0) {
      $('saved-sessions').style.display = 'block';
      const list = $('saved-list');
      for (const s of entries) {
        const btn = document.createElement('button');
        btn.className = 'btn';
        btn.style.cssText = 'font-size:11px;padding:6px 12px;';
        const date = s.timestamp ? new Date(s.timestamp).toLocaleDateString() : '';
        btn.innerHTML = '<span style="color:#ff6600">' + s.name + '</span> <span style="color:#888">' + s.city + ' Day ' + s.day + ' $' + (s.cash||0).toLocaleString() + '</span> <span style="color:#666;font-size:9px">' + date + '</span>';
        btn.addEventListener('click', () => window.loadGame(s.name));
        list.appendChild(btn);
      }
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
