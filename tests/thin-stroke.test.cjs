const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');
let sourcePixels, targetPixels;
const canvas = pixels => ({getContext:()=>({
  fillRect(){},drawImage(){},putImageData(){},
  getImageData:()=>({data:new Uint8ClampedArray(pixels.flatMap(rgb=>[...rgb,255]))})
})});
const {processImage,rgbToOklab} = vm.runInNewContext(
  readFileSync(path.join(__dirname,'../app.js'),'utf8').split('// UI RENDERING')[0]+';({processImage,rgbToOklab})',
  {document:{getElementById:()=>canvas(targetPixels),createElement:()=>canvas(sourcePixels)}}
);
const rgb = hex => hex.slice(1).match(/../g).map(v=>parseInt(v,16));

// The intended stitch design is independent of RGB averaging: a narrow E and
// square frame should each remain a continuous, single-thread ink mark. Each
// source stroke is only two pixels wide inside an eight-pixel stitch cell.
for (const [name,ink,paper] of [
  ['green lettering',[38,87,45],[211,238,199]],
  ['navy lettering',[23,41,70],[249,239,212]],
  ['black lettering',[20,20,20],[255,255,255]]
]) {
  test(`${name}: retain thin text and border without recoloring red/white details`,()=>{
    const size=32,scale=8,width=size*scale,red=[225,40,50],white=[255,255,255];
    sourcePixels=Array.from({length:width*width},()=>paper);
    const expected=Array.from({length:size},()=>Array(size).fill('paper'));
    const mark=(x,y,vertical)=>{
      expected[y][x]='ink';
      for(let dy=0;dy<scale;dy++)for(let dx=0;dx<scale;dx++){
        if(vertical?dx>=3&&dx<5:dy>=3&&dy<5)sourcePixels[(y*scale+dy)*width+x*scale+dx]=ink;
      }
    };
    for(let n=3;n<29;n++){mark(n,3,false);mark(n,28,false);mark(3,n,true);mark(28,n,true);}
    for(let y=9;y<=21;y++)mark(10,y,true);
    for(const y of [9,15,21])for(let x=11;x<=21;x++)mark(x,y,false);
    for(let y=22;y<28;y++)for(let x=7;x<25;x++){
      const color=x%2?red:white;expected[y][x]=x%2?'red':'white';
      for(let dy=0;dy<scale;dy++)for(let dx=0;dx<scale;dx++)sourcePixels[(y*scale+dy)*width+x*scale+dx]=color;
    }
    targetPixels=[];
    for(let y=0;y<size;y++)for(let x=0;x<size;x++){
      const sum=[0,0,0];
      for(let dy=0;dy<scale;dy++)for(let dx=0;dx<scale;dx++){
        const pixel=sourcePixels[(y*scale+dy)*width+x*scale+dx];
        for(let c=0;c<3;c++)sum[c]+=pixel[c];
      }
      targetPixels.push(sum.map(v=>Math.round(v/(scale*scale))));
    }
    for(const limit of [4,30,64]){
      const result=processImage({naturalWidth:width,naturalHeight:width},size,size,limit);
      assert.ok(result.numColors<=4,'avoid inventing threads for resampling blends');
      for(let y=0;y<size;y++)for(let x=0;x<size;x++){
        const actual=rgb(result.colorMap[result.grid[y][x]]),kind=expected[y][x];
        if(kind==='ink'){
          assert.ok(rgbToOklab(...actual)[0]<.6,`${limit}: preserve dark ink at ${x},${y}`);
          assert.ok(actual.every((v,c)=>Math.abs(v-ink[c])<=1),'use the source ink color');
        }else{
          const wanted=kind==='red'?red:kind==='white'?white:paper;
          assert.ok(actual.every((v,c)=>Math.abs(v-wanted[c])<=1),`${limit}: retain ${kind} at ${x},${y}`);
        }
      }
    }
  });
}
