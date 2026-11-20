const {Jimp}=require('jimp'); const {Potrace}=require('potrace'); const fs=require('fs');
const S=6;
function trace(maskPath){return new Promise((res,rej)=>{const p=new Potrace({turdSize:10,alphaMax:0.55,optCurve:true,optTolerance:0.2,threshold:128,blackOnWhite:true});
  p.loadImage(maskPath,e=>{if(e)return rej(e);res(p.getPathTag().match(/ d="([^"]+)"/)[1]);});});}
(async()=>{
 const im=await Jimp.read('src1.png');
 im.resize({w:im.bitmap.width*S,h:im.bitmap.height*S,mode:'bicubicInterpolation'});
 const {width:w,height:h}=im.bitmap, d=im.bitmap.data, N=w*h;
 const red=new Uint8Array(N), ink=new Uint8Array(N);
 for(let i=0;i<N;i++){const r=d[i*4],g=d[i*4+1],b=d[i*4+2];const lum=.3*r+.59*g+.11*b;const score=r-(g+b)/2;
  ink[i]=lum<165?1:0; red[i]=(score>95)?1:0;}
 // dark = ink without red; then dilate by 1px so it tucks under red (no seams)
 let dark=new Uint8Array(N); for(let i=0;i<N;i++) dark[i]=(ink[i]&&!red[i])?1:0;
 const dil=new Uint8Array(N); const R=Math.round(S/3);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){let v=0;for(let dy=-R;dy<=R&&!v;dy++)for(let dx=-R;dx<=R;dx++){const xx=x+dx,yy=y+dy;if(xx>=0&&yy>=0&&xx<w&&yy<h&&dark[yy*w+xx]){v=1;break;}} dil[y*w+x]=v;}
 // never let dilation fill the pin hole / background: only keep dilated pixels that are ink or red-adjacent (ink|red)
 const dark2=new Uint8Array(N); for(let i=0;i<N;i++) dark2[i]=(dil[i]&&(ink[i]||red[i]))?1:0;
 // bbox
 let minx=w,maxx=0,miny=h,maxy=0; for(let y=0;y<h;y++)for(let x=0;x<w;x++){if(ink[y*w+x]||red[y*w+x]){minx=Math.min(minx,x);maxx=Math.max(maxx,x);miny=Math.min(miny,y);maxy=Math.max(maxy,y);}}
 const save=async(arr,name)=>{const m=new Jimp({width:w,height:h,color:0xffffffff});for(let i=0;i<N;i++){if(arr[i]){const o=i*4;m.bitmap.data[o]=m.bitmap.data[o+1]=m.bitmap.data[o+2]=0;}}await m.write(name);};
 await save(red,'mask-red.png'); await save(dark2,'mask-dark.png');
 const dRed=await trace('mask-red.png'), dDark=await trace('mask-dark.png');
 fs.writeFileSync('paths.json',JSON.stringify({w,h,bbox:[minx,miny,maxx+1,maxy+1],dRed,dDark}));
 console.log('bbox',minx,miny,maxx+1,maxy+1,'path lens',dRed.length,dDark.length);
})();
