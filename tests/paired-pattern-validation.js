(async()=>{
  const load=async url=>new Function(`${(await(await fetch(url)).text()).split('// UI RENDERING')[0]};return {processImage,rgbToOklab,colorDistance,nearestColorIndex};`)();
  const api=await load('../app.js');
  const baselineUrl=new URLSearchParams(location.search).get('baseline');
  const baseline=baselineUrl?await load(baselineUrl):null;
  const output={runs:0,failures:[],cases:[]};
  const fig=(label,src)=>{const f=document.createElement('figure'),img=document.createElement('img'),cap=document.createElement('figcaption');img.src=src;img.alt=label;cap.textContent=label;f.append(img,cap);return f;};
  for(const fixture of PairedPatterns.fixtures){
    const record={name:fixture.name,idealThreads:fixture.colors.length,results:[]};
    const article=document.createElement('article'),heading=document.createElement('h2'),images=document.createElement('div');heading.textContent=fixture.name;images.className='images';article.append(heading,images);
    for(const variant of ['clean','shaded','lighting','jpeg']){
      const f=PairedPatterns.makeFixture(fixture,variant);
      const source=document.createElement('canvas');source.width=source.height=f.width;source.getContext('2d').putImageData(new ImageData(f.data,f.width,f.width),0,0);
      let input=source;
      if(variant==='jpeg'){input=new Image();input.src=source.toDataURL('image/jpeg',.7);await input.decode();}
      const ideal=document.createElement('canvas');ideal.width=ideal.height=f.size;const ctx=ideal.getContext('2d');for(let y=0;y<f.size;y++)for(let x=0;x<f.size;x++){ctx.fillStyle=fixture.colors[f.expected[y][x]];ctx.fillRect(x,y,1,1);}
      const idealLabs=f.colors.map(c=>api.rgbToOklab(...c));
      for(const limit of [f.colors.length,30,64]){
        const result=api.processImage(input,f.size,f.size,limit),after=document.getElementById('processingCanvas').toDataURL();
        const palette=Object.fromEntries(Object.entries(result.colorMap).map(([code,hex])=>[code,hex.slice(1).match(/../g).map(c=>parseInt(c,16))]));
        const labs=Object.fromEntries(Object.entries(palette).map(([code,c])=>[code,api.rgbToOklab(...c)]));
        let correct=0,error=0;
        for(let y=0;y<f.size;y++)for(let x=0;x<f.size;x++){
          const actual=labs[result.grid[y][x]],expected=f.expected[y][x];
          if(api.nearestColorIndex(actual,idealLabs,4)===expected)correct++;
          error+=api.colorDistance(actual,idealLabs[expected],4);
        }
        const accuracy=correct/(f.size*f.size),rms=Math.sqrt(error/(f.size*f.size));
        const pass=result.numColors<=f.colors.length&&accuracy>=.98&&rms<=.035;
        const row={variant,limit,threads:result.numColors,accuracy:Math.round(accuracy*10000)/100,rms:Math.round(rms*10000)/10000,pass};
        record.results.push(row);output.runs++;if(!pass)output.failures.push({name:fixture.name,...row});
        if(variant==='shaded'&&limit===30){
          images.append(fig('Shaded source',source.toDataURL()),fig(`Ideal: ${f.colors.length} threads`,ideal.toDataURL()));
          if(baseline){const before=baseline.processImage(input,f.size,f.size,30);images.append(fig(`Before: ${before.numColors} threads`,document.getElementById('processingCanvas').toDataURL()));}
          images.append(fig(`After: ${result.numColors} threads · ${(accuracy*100).toFixed(1)}% correct stitches`,after));
        }
      }
    }
    const failures=record.results.filter(r=>!r.pass);const status=document.createElement('p');status.textContent=failures.length?`${failures.length} failures`:'12 comparisons passed';if(failures.length)status.className='fail';article.append(status);
    const details=document.createElement('details'),summary=document.createElement('summary'),pre=document.createElement('pre');summary.textContent='Scores by source variant and color ceiling';pre.textContent=JSON.stringify(record.results,null,2);details.append(summary,pre);article.append(details);
    document.getElementById('cases').append(article);output.cases.push(record);document.getElementById('summary').textContent=`${output.cases.length} reference pairs · ${output.runs} conversions · ${output.failures.length} failures`;
    await new Promise(resolve=>requestAnimationFrame(resolve));
  }
  window.pairedResult=output;window.pairedDone=true;
})().catch(error=>{document.getElementById('summary').textContent=error.stack;window.pairedError=error.message;window.pairedDone=true;});
