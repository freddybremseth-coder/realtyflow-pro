/**
 * Dependency-free branded 560x720 artwork thumbnail side panel.
 *
 * The bundled ffmpeg-static executable omits the drawtext filter. Render a
 * compact editorial bitmap type treatment in Node instead, then use FFmpeg's
 * universally available overlay filter to combine it with an UNcropped work.
 * The PPM encoder is intentionally small: no fonts, network or native canvas
 * packages are needed in a production serverless function.
 */
const WIDTH = 560;
const HEIGHT = 720;
type RGB = [number, number, number];

// 5x7 block glyphs. Unknown punctuation is rendered as a blank, not executed
// as FFmpeg filter syntax. This also avoids subtitle/filter injection.
const GLYPHS: Record<string, string[]> = {
  A: ['01110','10001','10001','11111','10001','10001','10001'],
  B: ['11110','10001','10001','11110','10001','10001','11110'],
  C: ['01111','10000','10000','10000','10000','10000','01111'],
  D: ['11110','10001','10001','10001','10001','10001','11110'],
  E: ['11111','10000','10000','11110','10000','10000','11111'],
  F: ['11111','10000','10000','11110','10000','10000','10000'],
  G: ['01111','10000','10000','10111','10001','10001','01111'],
  H: ['10001','10001','10001','11111','10001','10001','10001'],
  I: ['11111','00100','00100','00100','00100','00100','11111'],
  J: ['00111','00010','00010','00010','10010','10010','01100'],
  K: ['10001','10010','10100','11000','10100','10010','10001'],
  L: ['10000','10000','10000','10000','10000','10000','11111'],
  M: ['10001','11011','10101','10101','10001','10001','10001'],
  N: ['10001','11001','10101','10011','10001','10001','10001'],
  O: ['01110','10001','10001','10001','10001','10001','01110'],
  P: ['11110','10001','10001','11110','10000','10000','10000'],
  Q: ['01110','10001','10001','10001','10101','10010','01101'],
  R: ['11110','10001','10001','11110','10100','10010','10001'],
  S: ['01111','10000','10000','01110','00001','00001','11110'],
  T: ['11111','00100','00100','00100','00100','00100','00100'],
  U: ['10001','10001','10001','10001','10001','10001','01110'],
  V: ['10001','10001','10001','10001','10001','01010','00100'],
  W: ['10001','10001','10001','10101','10101','10101','01010'],
  X: ['10001','10001','01010','00100','01010','10001','10001'],
  Y: ['10001','10001','01010','00100','00100','00100','00100'],
  Z: ['11111','00001','00010','00100','01000','10000','11111'],
  '0': ['01110','10001','10011','10101','11001','10001','01110'],
  '1': ['00100','01100','00100','00100','00100','00100','01110'],
  '2': ['01110','10001','00001','00010','00100','01000','11111'],
  '3': ['11110','00001','00001','01110','00001','00001','11110'],
  '4': ['00010','00110','01010','10010','11111','00010','00010'],
  '5': ['11111','10000','10000','11110','00001','00001','11110'],
  '6': ['01111','10000','10000','11110','10001','10001','01110'],
  '7': ['11111','00001','00010','00100','01000','01000','01000'],
  '8': ['01110','10001','10001','01110','10001','10001','01110'],
  '9': ['01110','10001','10001','01111','00001','00001','11110'],
  '-': ['00000','00000','00000','11111','00000','00000','00000'],
  '.': ['00000','00000','00000','00000','00000','01100','01100'],
  ':': ['00000','01100','01100','00000','01100','01100','00000'],
  '&': ['01100','10010','10100','01000','10101','10010','01101'],
  '!': ['00100','00100','00100','00100','00100','00000','00100'],
  '?': ['01110','10001','00001','00010','00100','00000','00100'],
  '/': ['00001','00001','00010','00100','01000','10000','10000'],
  "'": ['00100','00100','01000','00000','00000','00000','00000'],
};

function safeUpper(input: string): string {
  return input.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toUpperCase()
    .replace(/[^A-Z0-9 .:&!?/'-]/g, ' ').replace(/\s+/g, ' ').trim();
}

function titleLines(input: string, max = 19): string[] {
  const words = safeUpper(input).split(' ').filter(Boolean);
  const lines: string[] = [];
  for (const word of words) {
    const current = lines[lines.length - 1];
    if (!current) lines.push(word.slice(0, max));
    else if ((current.length + 1 + word.length) <= max) lines[lines.length - 1] += ' ' + word;
    else if (lines.length < 2) lines.push(word.slice(0, max));
    else break;
  }
  if (lines.length === 0) return ['UNTITLED'];
  if (lines.length === 2 && words.join(' ').length > lines.join(' ').length) {
    lines[1] = lines[1].slice(0, max - 3) + '...';
  }
  return lines;
}

export function buildArtThumbnailPanel(category: string, title: string, accentHex: string): Buffer {
  const pixels = Buffer.alloc(WIDTH * HEIGHT * 3);
  const bg: RGB = [16, 24, 32];
  const accentValue = /^[0-9a-fA-F]{6}$/.test(accentHex) ? accentHex : 'b7d5cb';
  const accent: RGB = [0,2,4].map(i => Number.parseInt(accentValue.slice(i,i+2),16)) as RGB;
  const white: RGB = [245, 246, 240];
  const cyan: RGB = [8, 145, 178];
  function rect(x: number, y: number, width: number, height: number, color: RGB) {
    const x0 = Math.max(0, x), x1 = Math.min(WIDTH, x + width);
    const y0 = Math.max(0, y), y1 = Math.min(HEIGHT, y + height);
    for (let row=y0; row<y1; row++) for (let col=x0; col<x1; col++) {
      const i = (row * WIDTH + col) * 3;
      pixels[i] = color[0]; pixels[i+1] = color[1]; pixels[i+2] = color[2];
    }
  }
  rect(0, 0, WIDTH, HEIGHT, bg);
  rect(32, 43, 352, 45, cyan);
  rect(32, 532, 482, 3, accent);
  rect(32, 674, 482, 2, [65, 79, 86]);
  function label(value: string, x: number, y: number, scale: number, color: RGB) {
    const line = safeUpper(value);
    for (let n=0; n<line.length; n++) {
      const glyph = GLYPHS[line[n]];
      if (!glyph) continue;
      for (let gy=0; gy<7; gy++) for (let gx=0; gx<5; gx++) {
        if (glyph[gy][gx] === '1') rect(x + n * scale * 6 + gx * scale, y + gy * scale, scale, scale, color);
      }
    }
  }
  label('RE-MASTER FREDDY', 46, 53, 3, white);
  const safeCategory = safeUpper(category).slice(0, 12) || 'MEDITATION';
  const categoryScale = safeCategory.length > 11 ? 6 : 7;
  label(safeCategory, 32, 231, categoryScale, white);
  const lines = titleLines(title);
  lines.forEach((line, i) => label(line, 32, 360 + i * 54, 4, accent));
  label('FREDDY BREMSETH ART', 32, 567, 3, white);
  label('ART + MUSIC', 32, 631, 2, accent);
  const header = Buffer.from(`P6\n${WIDTH} ${HEIGHT}\n255\n`, 'ascii');
  return Buffer.concat([header, pixels]);
}

/**
 * A 1080x1920 poster for artwork Shorts. The painting is composited ONLY into
 * y=160..1480; text is restricted to the top and bottom editorial bands.
 * This deliberately avoids both FFmpeg drawtext and destructive portrait crop.
 */
export function buildArtShortPoster(category: string, title: string, variant: 'art' | 'music' = 'art'): Buffer {
  const width = 1080, height = 1920;
  const pixels = Buffer.alloc(width * height * 3);
  const bg: RGB = [16, 24, 32];
  const white: RGB = [245, 246, 240];
  const accent: RGB = [183, 213, 203];
  const cyan: RGB = [8, 145, 178];
  function rect(x: number, y: number, w: number, h: number, color: RGB) {
    const x0=Math.max(0,x), x1=Math.min(width,x+w), y0=Math.max(0,y), y1=Math.min(height,y+h);
    for(let row=y0;row<y1;row++) for(let col=x0;col<x1;col++){
      const i=(row*width+col)*3;
      pixels[i]=color[0];pixels[i+1]=color[1];pixels[i+2]=color[2];
    }
  }
  rect(0,0,width,height,bg);
  rect(32,45,470,66,cyan);
  rect(32,1530,1016,3,accent);
  rect(32,1875,1016,2,[65,79,86]);
  function label(value: string, x: number, y: number, scale: number, color: RGB) {
    for(const [n,char] of [...safeUpper(value)].entries()){
      const glyph=GLYPHS[char];
      if(!glyph) continue;
      for(let gy=0;gy<7;gy++)for(let gx=0;gx<5;gx++){
        if(glyph[gy][gx]==='1') rect(x+n*scale*6+gx*scale,y+gy*scale,scale,scale,color);
      }
    }
  }
  label('RE-MASTER FREDDY',46,57,4,white);
  label(safeUpper(category).slice(0,12)||'MEDITATION',38,1575,10,white);
  titleLines(title,24).forEach((line,i)=>label(line,40,1690+i*61,4,accent));
  label(variant === 'art' ? 'FREDDY BREMSETH ART' : 'FULL SONG ON CHANNEL',40,1840,4,white);
  return Buffer.concat([Buffer.from(`P6\n${width} ${height}\n255\n`, 'ascii'), pixels]);
}


/**
 * Dependency-free 1080x1920 branding poster for portfolio Reels.
 * FFmpeg overlays the visual gallery into the center area, so text never needs
 * libass, drawtext, fontconfig or an SVG decoder in serverless.
 */
export function buildPortfolioReelPoster(brand: string, title: string, site: string, zenEco = false): Buffer {
  const width = 1080, height = 1920;
  const pixels = Buffer.alloc(width * height * 3);
  const bg: RGB = [7, 19, 31];
  const white: RGB = [245, 246, 240];
  const pale: RGB = [185, 232, 255];
  const teal: RGB = [8, 61, 67];
  const gold: RGB = [242, 193, 78];

  function rect(x: number, y: number, w: number, h: number, color: RGB) {
    const x0=Math.max(0,x), x1=Math.min(width,x+w), y0=Math.max(0,y), y1=Math.min(height,y+h);
    for(let row=y0;row<y1;row++) for(let col=x0;col<x1;col++){
      const i=(row*width+col)*3;
      pixels[i]=color[0];pixels[i+1]=color[1];pixels[i+2]=color[2];
    }
  }
  function label(value: string, x: number, y: number, scale: number, color: RGB) {
    for(const [n,char] of [...safeUpper(value)].entries()){
      const glyph=GLYPHS[char];
      if(!glyph) continue;
      for(let gy=0;gy<7;gy++)for(let gx=0;gx<5;gx++){
        if(glyph[gy][gx]==='1') rect(x+n*scale*6+gx*scale,y+gy*scale,scale,scale,color);
      }
    }
  }

  rect(0,0,width,height,bg);
  label(brand.slice(0,32),42,42,5,white);
  titleLines(title,28).forEach((line,i)=>label(line,42,104+i*38,3,pale));
  rect(0,1728,width,192,bg);
  label(site.slice(0,40),42,1766,4,white);
  label('MUSIC BY RE-MASTER FREDDY',42,1820,3,pale);
  if(zenEco){
    rect(560,1646,478,58,teal);
    label('ZEN ECO HOMES',584,1662,3,gold);
    label('COSTA BLANCA',822,1662,2,white);
  }
  return Buffer.concat([Buffer.from(`P6\n${width} ${height}\n255\n`, 'ascii'), pixels]);
}
