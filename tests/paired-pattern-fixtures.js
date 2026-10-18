// Original, deterministic needlepoint designs. Geometry and intended palettes
// define the ground truth independently of the converter under test.
(function (root) {
  const fixtures = [
    { name: 'Holiday ornament', colors: ['#FFFFFF','#D2EAC4','#2C6035','#E83243','#70A26E','#F49AA1'], cell(x,y) {
      const d=Math.hypot(x-32,y-32); if(d>29)return 0; if(d>27)return 2;
      for(const cx of [15,49]) if(x>=cx-3&&x<=cx+3&&y>=25&&y<=45)return Math.floor((y-25)/4)%2?0:(x<cx?3:5);
      if(y>=48&&y<52&&x>=20&&x<44)return 2;
      if(y>=15&&y<43&&Math.abs(x-32)<(y-12)/2)return (Math.floor(y/5)%2)?2:4;
      return 1;
    }},
    { name: 'Sailboat and red flag', colors: ['#FFFFFF','#9DCCE5','#286298','#20334B','#E73342'], cell(x,y) {
      if(x>=34&&x<44&&y>=11&&y<16)return 4;
      if(x>=32&&x<34&&y>=10&&y<44)return 3;
      if(x>=12&&x<31&&y>=17&&y<=39&&x>31-(y-17)*.9)return 0;
      if(y>=42&&y<47&&x>=15+(y-42)&&x<51-(y-42))return 3;
      return y<36?1:2;
    }},
    { name: 'Sunflower', colors: ['#FFFFFF','#493628','#F8CB35','#DB9029','#7CA15F','#285D38'], cell(x,y) {
      if(x>=30&&x<34&&y>=27&&y<59)return 5;
      if(((x-23)/10)**2+((y-45)/4)**2<1||((x-40)/10)**2+((y-51)/4)**2<1)return 4;
      const d=Math.hypot(x-32,y-23),a=Math.atan2(y-23,x-32);
      if(d<7)return 1;if(d<16+3*Math.cos(a*10))return d<12?3:2;return 0;
    }},
    { name: 'Monogram badge', colors: ['#FFF9E8','#1E3555','#E3B632'], cell(x,y) {
      const d=Math.hypot(x-32,y-32); if(d>27)return 0;if(d>24)return 2;
      if(y>=19&&y<46&&((x>=19&&x<24)||(x>=40&&x<45)||Math.abs(Math.abs(x-32)-(y-19)*.5)<2.5&&y<33))return 1;return 0;
    }},
    { name: 'Original tartan heart', colors: ['#F7F2E8','#1D2D42','#477C4D','#7BAED0'], cell(x,y) {
      const px=(x-32)/25,py=-(y-30)/25; if((px*px+py*py-1)**3-px*px*py**3>0)return 0;
      if(Math.hypot(x-32,y-30)<8)return 3;return x%12<3||y%12<3?1:2;
    }},
    { name: 'Illustrated portrait', colors: ['#BDDBE8','#211D1C','#683D28','#A06A47','#D09A73','#FFF6E7','#B72C43'], cell(x,y) {
      if(y>=50&&Math.abs(x-32)<25)return 5;
      if(((x-32)/20)**2+((y-29)/25)**2>=1)return 0;
      if(((x-32)/15)**2+((y-31)/20)**2>=1||y<15)return 1;
      if(y>=34&&y<37&&x>=27&&x<37)return 6;
      if(y>=24&&y<27&&((x>=23&&x<27)||(x>=37&&x<41)))return 1;
      if(x<26)return 2;if(x>36)return 4;return 3;
    }},
    { name: 'Eight-color quilt', colors: ['#E32C42','#E5B432','#30734A','#326BB2','#763A84','#2DA4B1','#F7F1D9','#27242B'], cell(x,y) {
      return (Math.floor(x/16)+4*Math.floor(y/32))%8;
    }},
    { name: 'Four pastel fields', colors: ['#F5D8DE','#D8EBD5','#DBE2F4','#F3E9CF'], cell(x,y) { return (x>=32?1:0)+(y>=32?2:0); }}
  ];
  const rgb = hex => hex.slice(1).match(/../g).map(c=>parseInt(c,16));
  function makeFixture(fixture, variant='shaded', size=64, scale=8) {
    const colors=fixture.colors.map(rgb);
    const expected=Array.from({length:size},(_,y)=>Array.from({length:size},(_,x)=>fixture.cell((x+.5)*64/size,(y+.5)*64/size)));
    const width=size*scale,data=new Uint8ClampedArray(width*width*4);
    let seed=1789;
    for(let y=0;y<width;y++)for(let x=0;x<width;x++) {
      seed=(Math.imul(seed,1664525)+1013904223)>>>0;
      const base=colors[expected[Math.floor(y/scale)][Math.floor(x/scale)]];
      const shading=variant==='clean'?0:6*Math.sin(x/width*7)+4*Math.cos(y/width*9)+(seed%9)-4;
      const light=variant==='lighting'?(.96+.08*x/width):1;
      const offset=(y*width+x)*4;
      for(let c=0;c<3;c++)data[offset+c]=Math.round(Math.max(0,Math.min(255,base[c]*light+shading)));
      data[offset+3]=255;
    }
    return {name:fixture.name,size,width,data,expected,colors};
  }
  const api={fixtures,makeFixture};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else root.PairedPatterns=api;
})(typeof globalThis==='undefined'?this:globalThis);
