const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const gameRoot = path.join(root, 'paper-comics');

function buildGame() {
  const sources = JSON.parse(fs.readFileSync(path.join(gameRoot, 'game-scripts.json'), 'utf8'));
  const bundle = sources.map(source => {
    const file = path.resolve(gameRoot, source);
    if (!file.startsWith(gameRoot + path.sep)) throw new Error('Invalid game source: ' + source);
    return '\n;\n// Source: ' + source + '\n' + fs.readFileSync(file, 'utf8');
  }).join('\n');
  new vm.Script(bundle, {filename:'game-bundle.js'});
  const output = path.join(gameRoot, 'js/game-bundle.js');
  if (!fs.existsSync(output) || fs.readFileSync(output, 'utf8') !== bundle) fs.writeFileSync(output, bundle);
  return {sources:sources.length, bytes:Buffer.byteLength(bundle)};
}

if (require.main === module) console.log('Game bundle:', buildGame());
module.exports = {buildGame};
