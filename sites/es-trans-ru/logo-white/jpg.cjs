const fs=require('fs');const { chromium } = require('/home/my_workspace/website-customizer/.claude/skills/playwright-skill/node_modules/playwright');
(async()=>{const svg=fs.readFileSync('out/es-trans-logo-white.svg','utf8').replace(/^<\?xml[^>]*>\s*/,'');
 fs.writeFileSync('jpg.html',`<body style="margin:0;background:#353535">${svg.replace('<svg ','<svg style="display:block" ')}</body>`);
 const b=await chromium.launch();const p=await b.newPage({viewport:{width:600,height:93},deviceScaleFactor:1});
 await p.goto('file:///tmp/logo-work/jpg.html');await p.screenshot({path:'out/es-trans-logo-white.jpg',type:'jpeg',quality:95});await b.close();})();
