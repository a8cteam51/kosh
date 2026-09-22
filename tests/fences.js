const fs = require('fs');

// Every fenced block of one language in a markdown file, with the line its fence opens on.
const fences = (file, lang = 'javascript') => {
  const source = fs.readFileSync(file, 'utf8');
  const fence = new RegExp('^```' + lang + '\\r?\\n([\\s\\S]*?)^```$', 'gm');
  return Array.from(source.matchAll(fence), (match) => ({
    code: match[1],
    line: source.slice(0, match.index).split('\n').length,
  }));
};

module.exports = { fences };
