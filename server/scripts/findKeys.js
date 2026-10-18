const fs = require('fs');
const path = require('path');

function walk(d) {
  fs.readdirSync(d).forEach(f => {
    const p = path.join(d, f);
    if (fs.statSync(p).isDirectory()) {
      if (f !== 'node_modules' && f !== '.git') walk(p);
    } else if (f.endsWith('.tsx') || f.endsWith('.ts') || f.endsWith('.jsx')) {
      const lines = fs.readFileSync(p, 'utf8').split('\n');
      lines.forEach((l, i) => {
        if (l.includes('key=') || l.includes('key =')) {
          console.log(p.replace(/\\/g, '/') + ':' + (i+1) + ': ' + l.trim());
        }
      });
    }
  });
}

walk('client');
