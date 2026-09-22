const fs = require('fs');

// Every fenced javascript block in a markdown file, with the line its fence opens on.
const fences = (file) => {
  const source = fs.readFileSync(file, 'utf8');
  return Array.from(source.matchAll(/^```javascript\r?\n([\s\S]*?)^```$/gm), (match) => ({
    code: match[1],
    line: source.slice(0, match.index).split('\n').length,
  }));
};

module.exports = { fences };
