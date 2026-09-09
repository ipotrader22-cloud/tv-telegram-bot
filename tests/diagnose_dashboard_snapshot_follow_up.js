'use strict';
const fs = require('fs');
const lines = fs.readFileSync(require.resolve('../app.js'), 'utf8').split(/\r?\n/);
for (const [startLine, endLine, title] of [[5340, 5390, 'Dashboard data builder entry'], [13990, 14082, 'Dashboard route']]) {
  console.log(`\n===== ${title} =====`);
  const start = startLine - 1;
  console.log(lines.slice(start, endLine).map((line, index) => `${start + index + 1}: ${line}`).join('\n'));
}
