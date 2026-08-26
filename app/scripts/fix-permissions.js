const { chmodSync, readdirSync } = require('fs');
const path = require('path');

if (process.platform !== 'win32') {
  const binDir = path.join(__dirname, '..', 'node_modules', '.bin');
  try {
    readdirSync(binDir).forEach((file) => {
      chmodSync(path.join(binDir, file), 0o755);
    });
    console.log('Fixed node_modules/.bin permissions');
  } catch (e) {
    console.log('Skipping permission fix:', e.message);
  }
}