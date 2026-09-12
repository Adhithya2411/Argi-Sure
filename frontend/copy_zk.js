const fs = require('fs');
const path = require('path');

const ZK_CIRCUIT_DIR = path.join(__dirname, '..', 'zk-circuit');
const PUBLIC_DIR = path.join(__dirname, 'public');

// Ensure public directory exists
if (!fs.existsSync(PUBLIC_DIR)) {
  fs.mkdirSync(PUBLIC_DIR, { recursive: true });
}

const filesToCopy = [
  {
    src: path.join(ZK_CIRCUIT_DIR, 'LocationVerifier_js', 'LocationVerifier.wasm'),
    dest: path.join(PUBLIC_DIR, 'LocationVerifier.wasm')
  },
  {
    src: path.join(ZK_CIRCUIT_DIR, 'circuit_final.zkey'),
    dest: path.join(PUBLIC_DIR, 'circuit_final.zkey')
  }
];

filesToCopy.forEach(({ src, dest }) => {
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    console.log(`✅ Copied ${path.basename(src)} to public/`);
  } else {
    console.warn(`⚠️ Warning: Source file not found: ${src}`);
  }
});
