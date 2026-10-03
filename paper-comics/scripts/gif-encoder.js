// Minimal, self-contained GIF89a encoder for Node.js without external dependencies
// Produces valid animated GIF89a files with global or local palettes.

class GifEncoder {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.frames = [];
    this.delay = 10; // in 1/100 sec (e.g. 10 = 100ms = 10 fps)
  }

  setDelay(ms) {
    this.delay = Math.round(ms / 10);
  }

  // buffer: raw RGBA Uint8ClampedArray / Buffer of size width * height * 4
  addFrame(rgbaBuffer) {
    this.frames.push(Buffer.from(rgbaBuffer));
  }

  // Generates 256-color palette via uniform/median quantization
  static buildPalette(rgbaBuffer) {
    // 6-7-6 color cube or sampled palette (216 web-safe + grayscale)
    const palette = [];
    // 6x6x6 color cube = 216 colors
    for (let r = 0; r < 6; r++) {
      for (let g = 0; g < 6; g++) {
        for (let b = 0; b < 6; b++) {
          palette.push([Math.round(r * 255 / 5), Math.round(g * 255 / 5), Math.round(b * 255 / 5)]);
        }
      }
    }
    // remaining 40 grayscale/skin/foam tones
    for (let i = 0; i < 40; i++) {
      const v = Math.round(i * 255 / 39);
      palette.push([v, v, v]);
    }
    return palette;
  }

  static quantize(rgba, palette) {
    const indices = new Uint8Array(rgba.length / 4);
    for (let i = 0; i < rgba.length; i += 4) {
      const r = rgba[i];
      const g = rgba[i + 1];
      const b = rgba[i + 2];
      
      // fast color cube index
      const cr = Math.min(5, Math.round(r * 5 / 255));
      const cg = Math.min(5, Math.round(g * 5 / 255));
      const cb = Math.min(5, Math.round(b * 5 / 255));
      const idx = cr * 36 + cg * 6 + cb;
      indices[i / 4] = idx;
    }
    return indices;
  }

  encode() {
    const out = [];

    // 1. Header
    out.push(Buffer.from('GIF89a'));

    // 2. Logical Screen Descriptor
    const lsd = Buffer.alloc(7);
    lsd.writeUInt16LE(this.width, 0);
    lsd.writeUInt16LE(this.height, 2);
    lsd[4] = 0xF7; // 256 colors Global Color Table (8 bits/pixel)
    lsd[5] = 0;    // Background color index
    lsd[6] = 0;    // Pixel aspect ratio
    out.push(lsd);

    // 3. Global Color Table (256 * 3 bytes)
    const firstFrame = this.frames[0];
    const palette = GifEncoder.buildPalette(firstFrame);
    const gct = Buffer.alloc(256 * 3);
    for (let i = 0; i < 256; i++) {
      gct[i * 3] = palette[i][0];
      gct[i * 3 + 1] = palette[i][1];
      gct[i * 3 + 2] = palette[i][2];
    }
    out.push(gct);

    // 4. Netscape Looping Extension (infinite loop)
    const netscape = Buffer.from([
      0x21, 0xFF, 0x0B,
      0x4E, 0x45, 0x54, 0x53, 0x43, 0x41, 0x50, 0x45, // "NETSCAPE"
      0x32, 0x2E, 0x30,                               // "2.0"
      0x03, 0x01, 0x00, 0x00,                         // sub-block: loop count 0 (infinite)
      0x00                                            // block terminator
    ]);
    out.push(netscape);

    // 5. Frames
    for (let f = 0; f < this.frames.length; f++) {
      const frameData = this.frames[f];
      const indexedPixels = GifEncoder.quantize(frameData, palette);

      // Graphics Control Extension
      const gce = Buffer.alloc(8);
      gce[0] = 0x21; // Extension introducer
      gce[1] = 0xF9; // Graphic control label
      gce[2] = 0x04; // Block size
      gce[3] = 0x04; // Disposal method: restore to background (or 0)
      gce.writeUInt16LE(this.delay, 4); // Delay time
      gce[6] = 0;    // Transparent color index (none)
      gce[7] = 0;    // Terminator
      out.push(gce);

      // Image Descriptor
      const id = Buffer.alloc(10);
      id[0] = 0x2C;
      id.writeUInt16LE(0, 1); // Left
      id.writeUInt16LE(0, 3); // Top
      id.writeUInt16LE(this.width, 5);
      id.writeUInt16LE(this.height, 7);
      id[9] = 0x00; // No local color table, not interlaced
      out.push(id);

      // LZW Raster Data
      const lzwData = this.lzwCompress(indexedPixels, 8);
      out.push(lzwData);
    }

    // 6. Trailer
    out.push(Buffer.from([0x3B]));

    return Buffer.concat(out);
  }

  lzwCompress(pixels, minCodeSize) {
    const clearCode = 1 << minCodeSize; // 256
    const eoiCode = clearCode + 1;       // 257

    let codeSize = minCodeSize + 1;
    let nextCode = eoiCode + 1;

    // Bit-packing stream
    const chunks = [];
    let curByte = 0;
    let curBits = 0;

    function writeBits(val, numBits) {
      curByte |= (val << curBits);
      curBits += numBits;
      while (curBits >= 8) {
        chunks.push(curByte & 0xFF);
        curByte >>= 8;
        curBits -= 8;
      }
    }

    function flushBits() {
      if (curBits > 0) {
        chunks.push(curByte & 0xFF);
        curByte = 0;
        curBits = 0;
      }
    }

    writeBits(clearCode, codeSize);

    // Dict map string to code
    let dict = new Map();
    let prefix = pixels[0];

    for (let i = 1; i < pixels.length; i++) {
      const k = pixels[i];
      const key = (prefix << 8) | k;

      if (dict.has(key)) {
        prefix = dict.get(key);
      } else {
        writeBits(prefix, codeSize);

        if (nextCode < 4096) {
          dict.set(key, nextCode++);
          if (nextCode > (1 << codeSize) && codeSize < 12) {
            codeSize++;
          }
        } else {
          // Reset dictionary
          writeBits(clearCode, codeSize);
          dict.clear();
          codeSize = minCodeSize + 1;
          nextCode = eoiCode + 1;
        }
        prefix = k;
      }
    }

    writeBits(prefix, codeSize);
    writeBits(eoiCode, codeSize);
    flushBits();

    // Package into 255-byte sub-blocks
    const out = [];
    out.push(Buffer.from([minCodeSize]));

    let pos = 0;
    while (pos < chunks.length) {
      const len = Math.min(255, chunks.length - pos);
      out.push(Buffer.from([len]));
      out.push(Buffer.from(chunks.slice(pos, pos + len)));
      pos += len;
    }
    out.push(Buffer.from([0x00])); // Block terminator

    return Buffer.concat(out);
  }
}

module.exports = GifEncoder;
