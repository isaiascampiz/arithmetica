/* eslint-disable @typescript-eslint/no-require-imports -- Standalone artwork exporter. */
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
const base = __dirname;
const identities = JSON.parse(fs.readFileSync(path.join(base, 'marks.json'), 'utf8'));
const read = (name, file) => fs.readFileSync(path.join(base, name, file), 'utf8');
const save = (name, file, value) => fs.writeFileSync(path.join(base, name, file), value);

function place(svg, x, y, width, height) {
  return svg
    .replace(/<title\b[^>]*>.*?<\/title>/g, '')
    .replace(/\s(?:role|aria-labelledby)="[^"]*"/g, '')
    .replace('<svg ', `<svg x="${x}" y="${y}" width="${width}" height="${height}" `);
}

async function main() {
  const cards = [];
  for (const [index, identity] of identities.entries()) {
    const { name } = identity;
    const logo = read(name, 'logo.svg');
    const mono = read(name, 'logo-mono.svg');
    const reversed = read(name, 'logo-reversed.svg');
    const mark = read(name, 'mark.svg');
    const colorMark = mark.replace('fill="currentColor"', 'fill="#5b93ce"');
    save(name, 'mark-color.svg', colorMark);
    await Promise.all([
      sharp(Buffer.from(logo)).resize({ width: 1200 }).png().toFile(path.join(base, name, 'logo.png')),
      sharp(Buffer.from(mono)).resize({ width: 1200 }).png().toFile(path.join(base, name, 'logo-mono.png')),
      sharp(Buffer.from(reversed)).resize({ width: 1200 }).png().toFile(path.join(base, name, 'logo-reversed.png')),
      sharp(Buffer.from(colorMark)).resize(512, 512).png().toFile(path.join(base, name, 'mark.png')),
    ]);

    const x = index % 2 === 0 ? 50 : 770;
    const y = index < 2 ? 165 : 625;
    const title = name[0].toUpperCase() + name.slice(1);
    const status = index < 2 ? 'FRESH CANDIDATE' : 'EXISTING NAME USES';
    cards.push(`<g transform="translate(${x} ${y})">
      <rect x="0.5" y="0.5" width="679" height="429" fill="white" stroke="#e0e5ed"/>
      <text x="30" y="43" font-size="25" font-weight="700" fill="#202b48">0${identity.rank} / ${title}</text>
      <text x="650" y="40" font-size="11" letter-spacing="1.2" text-anchor="end" fill="#687185">${status}</text>
      ${place(logo, 34, 82, 612, 140)}
      <text x="32" y="249" font-size="11" letter-spacing="1.1" fill="#687185">APP HEADER · 39 PX</text>
      <rect x="32" y="261" width="350" height="66" fill="#f5f6f8"/>
      ${place(logo, 48, 274, 190, 39)}
      <text x="414" y="249" font-size="11" letter-spacing="1.1" fill="#687185">REVERSED</text>
      <rect x="414" y="261" width="234" height="66" fill="#202b48"/>
      ${place(reversed, 430, 277, 202, 34)}
      <g color="#202b48">${place(mark, 32, 361, 16, 16)}${place(mark, 94, 357, 24, 24)}${place(mark, 165, 350, 39, 39)}</g>
      <text x="32" y="410" font-size="12" fill="#687185">16 px</text>
      <text x="94" y="410" font-size="12" fill="#687185">24 px</text>
      <text x="165" y="410" font-size="12" fill="#687185">39 px</text>
      ${place(mono, 360, 359, 288, 34)}
    </g>`);
  }
  const sheet = `<svg xmlns="http://www.w3.org/2000/svg" width="1500" height="1120" viewBox="0 0 1500 1120" role="img" aria-labelledby="title desc">
    <title id="title">Ranked logo shortlist: Zavri, Rivren, Kilter and Rivet</title>
    <desc id="desc">Original vector refinements with color wordmarks, 39 pixel header applications, reversed versions and monochrome symbols at 16, 24 and 39 pixels.</desc>
    <rect width="1500" height="1120" fill="#ffffff"/>
    <g font-family="Arial, sans-serif">
      <text x="50" y="48" font-size="12" letter-spacing="2" fill="#687185">IDENTITY STUDY / 02</text>
      <text x="50" y="105" font-size="42" font-weight="700" fill="#202b48">Ranked identity shortlist</text>
      <text x="50" y="139" font-size="18" fill="#687185">Symbols, wordmarks and small-size applications</text>
      ${cards.join('\n')}
      <text x="50" y="1096" font-size="13" fill="#687185">Vector refinements · Blue #5B93CE / Navy #202B48 · Rankings include name-screening considerations</text>
    </g>
  </svg>`;
  fs.writeFileSync(path.join(base, 'ranked-logo-shortlist.svg'), sheet);
  await sharp(Buffer.from(sheet)).png().toFile(path.join(base, 'ranked-logo-shortlist.png'));
  console.log('Exported four vector identities, transparent PNG assets and the ranked proof sheet.');
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
