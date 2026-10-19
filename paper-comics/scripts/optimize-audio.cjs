const fs = require('fs');
const path = require('path');

function monoWav(buffer) {
  let channels, rate, bits, dataPos, dataSize;
  for (let p = 12; p + 8 <= buffer.length;) {
    const name = buffer.toString('ascii', p, p + 4);
    const size = buffer.readUInt32LE(p + 4);
    if (name === 'fmt ') {
      channels = buffer.readUInt16LE(p + 10);
      rate = buffer.readUInt32LE(p + 12);
      bits = buffer.readUInt16LE(p + 22);
    }
    if (name === 'data') {
      dataPos = p + 8;
      dataSize = size;
      break;
    }
    p += 8 + size + (size % 2);
  }
  if (channels !== 2 || bits !== 16) return null;
  const numSamples = dataSize / 4;
  const monoData = Buffer.alloc(numSamples * 2);
  for (let i = 0; i < numSamples; i++) {
    const left = buffer.readInt16LE(dataPos + i * 4);
    const right = buffer.readInt16LE(dataPos + i * 4 + 2);
    const mono = Math.max(-32768, Math.min(32767, Math.round((left + right) / 2)));
    monoData.writeInt16LE(mono, i * 2);
  }
  const out = Buffer.alloc(44 + monoData.length);
  buffer.copy(out, 0, 0, 12);
  out.write('fmt ', 12);
  out.writeUInt32LE(16, 16);
  out.writeUInt16LE(1, 20); // PCM
  out.writeUInt16LE(1, 22); // mono
  out.writeUInt32LE(rate, 24);
  out.writeUInt32LE(rate * 2, 28);
  out.writeUInt16LE(2, 32);
  out.writeUInt16LE(16, 34);
  out.write('data', 36);
  out.writeUInt32LE(monoData.length, 40);
  monoData.copy(out, 44);
  out.writeUInt32LE(36 + monoData.length, 4);
  return out;
}

const audioFiles = [
  'ocean_ambient.wav',
  'seagull_1.wav',
  'seagull_2.wav',
  'seagull_distant.wav',
  'jetski_loop.wav',
  'crowd_applause_female.wav',
  'crowd_cheer_female.wav',
  'crowd_flight_bonus.wav',
  'crowd_flight_group.wav',
  'crowd_flight_happy.wav',
  'trick_triumph.wav',
  'fanfare_win.wav'
];

const dirs = [
  path.resolve(__dirname, '../assets/audio'),
  path.resolve(__dirname, '../../assets/audio')
];

let totalSaved = 0;
for (const file of audioFiles) {
  for (const dir of dirs) {
    const full = path.join(dir, file);
    if (!fs.existsSync(full)) continue;
    const buf = fs.readFileSync(full);
    const mono = monoWav(buf);
    if (mono) {
      fs.writeFileSync(full, mono);
      totalSaved += (buf.length - mono.length);
      console.log(`Optimized ${file}: ${(buf.length/1024).toFixed(1)} KB -> ${(mono.length/1024).toFixed(1)} KB`);
      break; // only count once for logging
    }
  }
}

console.log(`Total audio transfer saved: ${(totalSaved/1024/1024).toFixed(2)} MB`);
