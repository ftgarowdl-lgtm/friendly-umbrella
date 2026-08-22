/* Verità Facial — corrige a projeção dos 468 landmarks no canvas quando a imagem tem letterboxing. */
(function(){
  function getImageRect(img, container){
    const ir = img.getBoundingClientRect();
    const cr = container.getBoundingClientRect();
    return { x: ir.left-cr.left, y: ir.top-cr.top, w: ir.width, h: ir.height };
  }

  window.drawLandmarks = function(){
    if(!window.result?.landmarks) return;
    const img=document.getElementById('previewImg');
    const canvas=document.getElementById('overlay');
    const container=document.getElementById('preview');
    if(!img || !canvas || !container || !img.naturalWidth) return;

    const width=container.clientWidth;
    const height=container.clientHeight;
    canvas.width=Math.max(1, Math.round(width*devicePixelRatio));
    canvas.height=Math.max(1, Math.round(height*devicePixelRatio));
    canvas.style.width=width+'px';
    canvas.style.height=height+'px';

    const ctx=canvas.getContext('2d');
    ctx.setTransform(devicePixelRatio,0,0,devicePixelRatio,0,0);
    ctx.clearRect(0,0,width,height);

    const r=getImageRect(img,container);
    const color=window.editorMode?'#d94841':'#0e6e52';
    ctx.fillStyle=color;

    window.result.landmarks.forEach((p,i)=>{
      const x=r.x+p.x*r.w;
      const y=r.y+p.y*r.h;
      if(x<r.x-3 || x>r.x+r.w+3 || y<r.y-3 || y>r.y+r.h+3) return;
      ctx.beginPath();
      ctx.arc(x,y,i===window.selectedLandmark?4:1.5,0,Math.PI*2);
      ctx.fill();
    });

    // Pontos anatômicos principais destacados.
    const important=[10,9,168,1,2,152,33,133,263,362,61,291,0,17,234,454,172,397];
    ctx.fillStyle='#d94841';
    for(const i of important){
      const p=window.result.landmarks[i];
      if(!p) continue;
      const x=r.x+p.x*r.w, y=r.y+p.y*r.h;
      ctx.beginPath();ctx.arc(x,y,3,0,Math.PI*2);ctx.fill();
    }
  };

  window.getLandmarkCanvasCoordinates=function(index){
    const img=document.getElementById('previewImg'),container=document.getElementById('preview');
    if(!img||!container||!window.result?.landmarks[index]) return null;
    const ir=img.getBoundingClientRect(),cr=container.getBoundingClientRect(),p=window.result.landmarks[index];
    return {x:ir.left-cr.left+p.x*ir.width,y:ir.top-cr.top+p.y*ir.height};
  };
})();
