const fs=require('fs'); const {w,h,bbox,dRed,dDark}=JSON.parse(fs.readFileSync('paths.json'));
const [x0,y0,x1,y1]=bbox; const vw=x1-x0, vh=y1-y0; const W=600, H=+(W*vh/vw).toFixed(2);
const RED='#dc2025';
function svg({dark,bg}){return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="${x0} ${y0} ${vw} ${vh}" role="img" aria-labelledby="t">
  <title id="t">ES·TRANS.RU</title>${bg?`\n  <rect x="${x0}" y="${y0}" width="${vw}" height="${vh}" fill="${bg}"/>`:''}
  <path fill="${dark}" fill-rule="evenodd" d="${dDark}"/>
  <path fill="${RED}" fill-rule="evenodd" d="${dRed}"/>
</svg>
`;}
fs.writeFileSync('out/es-trans-logo-white.svg',svg({dark:'#ffffff'}));
fs.writeFileSync('check-orig.svg',svg({dark:'#474747',bg:'#ffffff'}));
fs.writeFileSync('check-dark.svg',svg({dark:'#ffffff',bg:'#3a3a3a'}));
console.log(W,H);
