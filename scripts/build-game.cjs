const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const gameRoot = path.join(root, 'paper-comics');

// The shared paper UI uses several navy ink shades. Remap those shades only
// for Aviasales and keep the original alpha for borders, shadows and overlays.
const aviasalesBlue = '0c73fe';
const navyInk = new Set([
  '062c40', '082e3d', '09202d', '092f44', '0b2a35', '0b364a', '0c2d3d', '0d3d4b',
  '0d5267', '0f3448', '102f3c', '103f58', '123b4c', '123c49', '123d49', '123d4c',
  '123f58', '12475a', '125267', '125577', '143b4b', '153c4b', '153d4b', '153e4c',
  '163d4c', '163e50', '164e60', '165964', '165973', '172d38', '173747', '173842',
  '173846', '173949', '173a43', '173a45', '173b44', '173b4b', '173d47', '173e46',
  '17414d', '17444c', '183e46', '185b67', '193b44', '1a3c46', '20434b', '20434c',
  '214a54', '214c56', '234b54', '236779', '24545c', '245568', '275261', '32565d',
]);

function aviasalesStyles(css) {
  return css.replace(/#([\da-f]{6})([\da-f]{2})?\b/gi, (color, rgb, alpha = '') =>
    navyInk.has(rgb.toLowerCase()) ? '#' + aviasalesBlue + alpha : color
  ).replace(/rgba\((25,\s*59,\s*68|20,\s*59,\s*75),\s*/g, 'rgba(12, 115, 254, ')
    .replace(/(start-poster|button-play(?:-base)?|ink-blank)\.webp/g, '$1-aviasales.webp');
}

function writeIfChanged(file, contents) {
  if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== contents) fs.writeFileSync(file, contents);
}

function buildGame() {
  const sources = JSON.parse(fs.readFileSync(path.join(gameRoot, 'game-scripts.json'), 'utf8'));
  const bundle = sources.map(source => {
    const file = path.resolve(gameRoot, source);
    if (!file.startsWith(gameRoot + path.sep)) throw new Error('Invalid game source: ' + source);
    return '\n;\n// Source: ' + source + '\n' + fs.readFileSync(file, 'utf8');
  }).join('\n');
  new vm.Script(bundle, {filename:'game-bundle.js'});
  writeIfChanged(path.join(gameRoot, 'js/game-bundle.js'), bundle);

  const stylesFile = path.join(gameRoot, 'game-styles.json');
  let cssStats = null;
  if (fs.existsSync(stylesFile)) {
    const styleSources = JSON.parse(fs.readFileSync(stylesFile, 'utf8'));
    const cssBundle = styleSources.map(source => {
      const file = path.resolve(gameRoot, source);
      if (!file.startsWith(gameRoot + path.sep)) throw new Error('Invalid style source: ' + source);
      return '/* Source: ' + source + ' */\n' + fs.readFileSync(file, 'utf8');
    }).join('\n\n');
    writeIfChanged(path.join(gameRoot, 'css/game-bundle.css'), cssBundle);
    writeIfChanged(path.join(gameRoot, 'css/game-bundle-aviasales.css'), aviasalesStyles(cssBundle));
    cssStats = {styles: styleSources.length, bytes: Buffer.byteLength(cssBundle)};
  }

  return {sources:sources.length, bytes:Buffer.byteLength(bundle), css:cssStats};
}

if (require.main === module) console.log('Game bundle:', buildGame());
module.exports = {buildGame};
