
export const el = s=>document.querySelector(s);
export const els = s=>[...document.querySelectorAll(s)];
export function toast(message){
  const node=el("#toast");node.textContent=message;node.classList.remove("hidden");
  setTimeout(()=>node.classList.add("hidden"),2200);
}
export function closeOverlay(){ el("#overlay").innerHTML=""; }
export function badge(team){
  const scale=Math.max(50,Math.min(180,Number(team.logoScale||100)));
  return team.logo
    ? `<span class="badge badge-image-wrap" style="--logo-scale:${scale/100}"><img src="${team.logo}" alt="${team.name||""}"></span>`
    : `<span class="badge" style="--c:${team.color}">${team.short.slice(0,2)}</span>`;
}
export function fileToDataURL(file){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file);
  });
}

export async function compressedImageDataURL(file,maxSize=1400,quality=.82){
  if(!file)return "";
  if(!file.type.startsWith("image/"))throw new Error("Bitte eine Bilddatei auswählen");
  const source=await fileToDataURL(file);
  try{
    const image=await new Promise((resolve,reject)=>{
      const img=new Image();img.onload=()=>resolve(img);img.onerror=reject;img.src=source;
    });
    const scale=Math.min(1,maxSize/Math.max(image.width,image.height));
    const canvas=document.createElement("canvas");
    canvas.width=Math.max(1,Math.round(image.width*scale));
    canvas.height=Math.max(1,Math.round(image.height*scale));
    const context=canvas.getContext("2d");
    context.drawImage(image,0,0,canvas.width,canvas.height);
    return canvas.toDataURL("image/jpeg",quality);
  }catch{
    return source;
  }
}



export async function normalizeLogoImage(dataUrl,{
  removeLightBackground=true,
  padding=.06,
  tolerance=42
}={}){
  const image=await new Promise((resolve,reject)=>{
    const img=new Image();
    img.onload=()=>resolve(img);
    img.onerror=reject;
    img.src=dataUrl;
  });

  const source=document.createElement("canvas");
  source.width=image.naturalWidth||image.width;
  source.height=image.naturalHeight||image.height;
  const ctx=source.getContext("2d",{willReadFrequently:true});
  ctx.drawImage(image,0,0);

  const imgData=ctx.getImageData(0,0,source.width,source.height);
  const d=imgData.data;
  const width=source.width;
  const height=source.height;

  if(removeLightBackground){
    // Hintergrundfarbe aus mehreren Randbereichen bestimmen.
    // Wichtig: Nur Pixel entfernen, die mit dem äußeren Bildrand verbunden sind.
    // Dadurch bleiben weiße Flächen INNERHALB eines Vereinslogos erhalten.
    const samples=[];
    const edgeStep=Math.max(1,Math.floor(Math.min(width,height)/120));
    const addSample=(x,y)=>{
      const i=(y*width+x)*4;
      if(d[i+3]>20)samples.push([d[i],d[i+1],d[i+2]]);
    };

    for(let x=0;x<width;x+=edgeStep){
      addSample(x,0);
      addSample(x,height-1);
    }
    for(let y=0;y<height;y+=edgeStep){
      addSample(0,y);
      addSample(width-1,y);
    }

    const median=values=>{
      const sorted=values.slice().sort((a,b)=>a-b);
      return sorted[Math.floor(sorted.length/2)]||255;
    };
    const bg={
      r:median(samples.map(v=>v[0])),
      g:median(samples.map(v=>v[1])),
      b:median(samples.map(v=>v[2]))
    };

    const colorDistance=(r,g,b)=>{
      const dr=r-bg.r,dg=g-bg.g,db=b-bg.b;
      return Math.sqrt(dr*dr+dg*dg+db*db);
    };
    const isBackgroundCandidate=(x,y)=>{
      const i=(y*width+x)*4;
      if(d[i+3]<8)return true;
      const dist=colorDistance(d[i],d[i+1],d[i+2]);
      const brightness=(d[i]+d[i+1]+d[i+2])/3;
      const bgBrightness=(bg.r+bg.g+bg.b)/3;
      const chroma=Math.max(d[i],d[i+1],d[i+2])-Math.min(d[i],d[i+1],d[i+2]);
      const bgChroma=Math.max(bg.r,bg.g,bg.b)-Math.min(bg.r,bg.g,bg.b);

      // Primär auf Ähnlichkeit zur tatsächlichen Randfarbe prüfen.
      // Bei weißem/hellem Hintergrund zusätzlich geringe Farbsättigung verlangen.
      if(dist<=tolerance)return true;
      if(bgBrightness>225 && brightness>225 && chroma<30 && bgChroma<30 && dist<=tolerance*1.55)return true;
      return false;
    };

    const visited=new Uint8Array(width*height);
    const queueX=new Int32Array(width*height);
    const queueY=new Int32Array(width*height);
    let head=0,tail=0;

    const enqueue=(x,y)=>{
      if(x<0||y<0||x>=width||y>=height)return;
      const p=y*width+x;
      if(visited[p]||!isBackgroundCandidate(x,y))return;
      visited[p]=1;
      queueX[tail]=x;
      queueY[tail]=y;
      tail++;
    };

    for(let x=0;x<width;x++){
      enqueue(x,0);
      enqueue(x,height-1);
    }
    for(let y=0;y<height;y++){
      enqueue(0,y);
      enqueue(width-1,y);
    }

    while(head<tail){
      const x=queueX[head],y=queueY[head];
      head++;
      enqueue(x+1,y);
      enqueue(x-1,y);
      enqueue(x,y+1);
      enqueue(x,y-1);
    }

    // Nur den vom Rand erreichbaren Hintergrund transparent machen.
    for(let p=0;p<visited.length;p++){
      if(visited[p])d[p*4+3]=0;
    }

    // Sanfte Antialias-Kante: nur transparente Außenkante bearbeiten,
    // niemals geschlossene weiße Flächen innerhalb des Logos.
    const alphaCopy=new Uint8ClampedArray(width*height);
    for(let p=0;p<alphaCopy.length;p++)alphaCopy[p]=d[p*4+3];
    for(let y=1;y<height-1;y++){
      for(let x=1;x<width-1;x++){
        const p=y*width+x;
        if(visited[p])continue;
        let transparentNeighbours=0;
        for(let yy=-1;yy<=1;yy++){
          for(let xx=-1;xx<=1;xx++){
            if(xx===0&&yy===0)continue;
            if(visited[(y+yy)*width+(x+xx)])transparentNeighbours++;
          }
        }
        if(transparentNeighbours){
          const i=p*4;
          const dist=colorDistance(d[i],d[i+1],d[i+2]);
          const edgeFactor=clamp01((dist-tolerance*.35)/(tolerance*.9));
          d[i+3]=Math.round(alphaCopy[p]*edgeFactor);
        }
      }
    }
  }

  ctx.putImageData(imgData,0,0);

  // Auf die echte sichtbare Logoform zuschneiden.
  let minX=width,minY=height,maxX=-1,maxY=-1;
  for(let y=0;y<height;y++){
    for(let x=0;x<width;x++){
      if(d[(y*width+x)*4+3]>12){
        minX=Math.min(minX,x);
        minY=Math.min(minY,y);
        maxX=Math.max(maxX,x);
        maxY=Math.max(maxY,y);
      }
    }
  }
  if(maxX<minX)return dataUrl;

  const w=maxX-minX+1;
  const h=maxY-minY+1;
  const size=Math.max(w,h);
  const out=document.createElement("canvas");
  out.width=900;
  out.height=900;
  const o=out.getContext("2d");
  const usable=900*(1-padding*2);
  const scale=usable/size;
  const dw=w*scale;
  const dh=h*scale;
  o.clearRect(0,0,900,900);
  o.imageSmoothingEnabled=true;
  o.imageSmoothingQuality="high";
  o.drawImage(source,minX,minY,w,h,(900-dw)/2,(900-dh)/2,dw,dh);
  return out.toDataURL("image/png");
}
function clamp01(n){return Math.max(0,Math.min(1,n))}
export function cropImageFile(file,{
  aspect=1,
  outputWidth=900,
  outputHeight=Math.round(outputWidth/aspect),
  quality=.9,
  title="Bild zuschneiden"
}={}){
  if(!file)return Promise.resolve("");
  if(!file.type?.startsWith("image/"))return Promise.reject(new Error("Bitte eine Bilddatei auswählen"));

  return new Promise(async(resolve,reject)=>{
    try{
      const source=await fileToDataURL(file);
      const image=await new Promise((ok,fail)=>{
        const img=new Image();
        img.onload=()=>ok(img);
        img.onerror=()=>fail(new Error("Bild konnte nicht geladen werden"));
        img.src=source;
      });

      const host=document.querySelector("#overlay");
      if(!host)return reject(new Error("Overlay fehlt"));

      host.innerHTML=`<div class="modal crop-modal">
        <div class="sheet crop-sheet">
          <div class="sheet-head">
            <div><div class="eyebrow">Bildwerkzeug</div><h2>${title}</h2></div>
            <button class="iconbtn" id="cropCancel" aria-label="Abbrechen">×</button>
          </div>
          <div class="crop-help">Ziehe das Bild mit dem Finger. Mit dem Regler kannst du hinein- oder herauszoomen.</div>
          <div class="crop-stage" id="cropStage" style="aspect-ratio:${aspect}">
            <canvas id="cropCanvas"></canvas>
            <div class="crop-grid" aria-hidden="true"></div>
          </div>
          <div class="crop-controls">
            <label>Zoom <span id="cropZoomValue">100%</span></label>
            <input id="cropZoom" type="range" min="100" max="300" value="100">
            <div class="crop-actions-row">
              <button class="btn secondary" id="cropReset">Zurücksetzen</button>
              <button class="btn primary" id="cropSave">Zuschneiden & übernehmen</button>
            </div>
          </div>
        </div>
      </div>`;

      const stage=host.querySelector("#cropStage");
      const canvas=host.querySelector("#cropCanvas");
      const ctx=canvas.getContext("2d");
      const zoomInput=host.querySelector("#cropZoom");
      const zoomValue=host.querySelector("#cropZoomValue");

      let zoom=1;
      let offsetX=0;
      let offsetY=0;
      let dragging=false;
      let lastX=0;
      let lastY=0;

      function resizeCanvas(){
        const rect=stage.getBoundingClientRect();
        const dpr=Math.min(2,window.devicePixelRatio||1);
        canvas.width=Math.max(1,Math.round(rect.width*dpr));
        canvas.height=Math.max(1,Math.round(rect.height*dpr));
        canvas.style.width=`${rect.width}px`;
        canvas.style.height=`${rect.height}px`;
        draw();
      }

      function baseScale(){
        return Math.max(canvas.width/image.width,canvas.height/image.height);
      }

      function clampOffsets(){
        const scale=baseScale()*zoom;
        const drawW=image.width*scale;
        const drawH=image.height*scale;
        const maxX=Math.max(0,(drawW-canvas.width)/2);
        const maxY=Math.max(0,(drawH-canvas.height)/2);
        offsetX=Math.max(-maxX,Math.min(maxX,offsetX));
        offsetY=Math.max(-maxY,Math.min(maxY,offsetY));
      }

      function draw(){
        if(!canvas.width||!canvas.height)return;
        clampOffsets();
        const scale=baseScale()*zoom;
        const drawW=image.width*scale;
        const drawH=image.height*scale;
        const x=(canvas.width-drawW)/2+offsetX;
        const y=(canvas.height-drawH)/2+offsetY;
        ctx.clearRect(0,0,canvas.width,canvas.height);
        ctx.imageSmoothingEnabled=true;
        ctx.imageSmoothingQuality="high";
        ctx.drawImage(image,x,y,drawW,drawH);
      }

      function pointerPosition(event){
        const rect=canvas.getBoundingClientRect();
        return {
          x:(event.clientX-rect.left)*(canvas.width/rect.width),
          y:(event.clientY-rect.top)*(canvas.height/rect.height)
        };
      }

      canvas.addEventListener("pointerdown",event=>{
        dragging=true;
        canvas.setPointerCapture(event.pointerId);
        const p=pointerPosition(event);
        lastX=p.x;
        lastY=p.y;
      });
      canvas.addEventListener("pointermove",event=>{
        if(!dragging)return;
        const p=pointerPosition(event);
        offsetX+=p.x-lastX;
        offsetY+=p.y-lastY;
        lastX=p.x;
        lastY=p.y;
        draw();
      });
      canvas.addEventListener("pointerup",()=>dragging=false);
      canvas.addEventListener("pointercancel",()=>dragging=false);

      zoomInput.oninput=()=>{
        const previous=zoom;
        zoom=Number(zoomInput.value)/100;
        if(previous>0){
          offsetX*=zoom/previous;
          offsetY*=zoom/previous;
        }
        zoomValue.textContent=`${zoomInput.value}%`;
        draw();
      };

      host.querySelector("#cropReset").onclick=()=>{
        zoom=1;
        offsetX=0;
        offsetY=0;
        zoomInput.value="100";
        zoomValue.textContent="100%";
        draw();
      };

      host.querySelector("#cropCancel").onclick=()=>{
        host.innerHTML="";
        resolve("");
      };

      host.querySelector("#cropSave").onclick=()=>{
        const out=document.createElement("canvas");
        out.width=outputWidth;
        out.height=outputHeight;
        const outCtx=out.getContext("2d");
        outCtx.imageSmoothingEnabled=true;
        outCtx.imageSmoothingQuality="high";

        const scale=baseScale()*zoom;
        const sourceX=((canvas.width-image.width*scale)/2+offsetX);
        const sourceY=((canvas.height-image.height*scale)/2+offsetY);
        const scaleX=outputWidth/canvas.width;
        const scaleY=outputHeight/canvas.height;

        outCtx.drawImage(
          image,
          sourceX*scaleX,
          sourceY*scaleY,
          image.width*scale*scaleX,
          image.height*scale*scaleY
        );

        const mime=file.type==="image/png"?"image/png":"image/jpeg";
        const result=out.toDataURL(mime,mime==="image/png"?undefined:quality);
        host.innerHTML="";
        resolve(result);
      };

      requestAnimationFrame(resizeCanvas);
      setTimeout(resizeCanvas,80);
    }catch(error){
      reject(error);
    }
  });
}
