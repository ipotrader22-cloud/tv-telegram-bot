'use strict';

const fs = require('fs');
const source = fs.readFileSync(require.resolve('../app.js'), 'utf8');
const lines = source.split(/\r?\n/);

function printRange(startLine, endLine, title) {
  console.log(`\n===== ${title} lines ${startLine}-${endLine} =====`);
  const start = Math.max(0, startLine - 1);
  const end = Math.min(lines.length, endLine);
  console.log(lines.slice(start, end).map((line, index) => `${start + index + 1}: ${line}`).join('\n'));
}

printRange(5380, 5468, 'Dashboard data summary builder');
printRange(10280, 10420, 'Dashboard hero and metric renderer');

console.log('\n===== CSS selector lines =====');
for (let i = 0; i < lines.length; i += 1) {
  if (/\.topline|\.strategy-notes|\.strategy-note|\.cards\b|@media/i.test(lines[i]) && i > 9600 && i < 10300) {
    console.log(`${i + 1}: ${lines[i]}`);
  }
}
