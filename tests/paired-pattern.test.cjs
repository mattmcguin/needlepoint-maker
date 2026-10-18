const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');
const {fixtures,makeFixture} = require('./paired-pattern-fixtures.js');
let targetData, sourceData;
const canvas = data => ({getContext:()=>({fillRect(){},drawImage(){},getImageData:()=>({data:data.slice()}),putImageData(){}})});
const api = vm.runInNewContext(
  readFileSync(path.join(__dirname,'../app.js'),'utf8').split('// UI RENDERING')[0]+';({processImage,rgbToOklab,colorDistance,nearestColorIndex})',
  {document:{getElementById:()=>canvas(targetData),createElement:()=>canvas(sourceData)}}
);
for (const fixture of fixtures) {
  test(`${fixture.name}: recover the intended design without extra threads`,()=>{
    for(const variant of ['clean','shaded','lighting']){
      const f=makeFixture(fixture,variant,64,2);sourceData=f.data;
      targetData=new Uint8ClampedArray(64*64*4);
      for(let y=0;y<64;y++)for(let x=0;x<64;x++){
        for(let c=0;c<3;c++){
          let sum=0;for(let dy=0;dy<2;dy++)for(let dx=0;dx<2;dx++)sum+=f.data[((y*2+dy)*f.width+x*2+dx)*4+c];
          targetData[(y*64+x)*4+c]=Math.round(sum/4);
        }
        targetData[(y*64+x)*4+3]=255;
      }
      for(const limit of [f.colors.length,30,64]){
        const result=api.processImage({naturalWidth:f.width,naturalHeight:f.width},64,64,limit);
        const idealLabs=f.colors.map(rgb=>api.rgbToOklab(...rgb));
        const actualLabs=Object.fromEntries(Object.entries(result.colorMap).map(([code,hex])=>[code,api.rgbToOklab(...hex.slice(1).match(/../g).map(v=>parseInt(v,16)))]));
        let correct=0,error=0;
        for(let y=0;y<64;y++)for(let x=0;x<64;x++){
          const actual=actualLabs[result.grid[y][x]],ideal=f.expected[y][x];
          if(api.nearestColorIndex(actual,idealLabs,4)===ideal)correct++;
          error+=api.colorDistance(actual,idealLabs[ideal],4);
        }
        const label=`${variant}, ceiling ${limit}`;
        assert.ok(result.numColors<=f.colors.length,`${label}: ${result.numColors} threads exceeds ${f.colors.length}-thread target`);
        assert.ok(correct/(64*64)>=.98,`${label}: stitch classification fidelity below 98%`);
        assert.ok(Math.sqrt(error/(64*64))<=.035,`${label}: perceptual color error exceeds target`);
      }
    }
  });
}
