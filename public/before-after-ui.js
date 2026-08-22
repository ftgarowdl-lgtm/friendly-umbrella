/* Visual before/after enhancement for the existing comparison panel. */
(function(){
  function inject(){
    const host=document.getElementById('compareResult');
    if(!host||!window.beforeState&&typeof beforeState==='undefined')return;
    if(typeof beforeState==='undefined'||typeof afterState==='undefined'||!beforeState||!afterState)return;
    if(host.querySelector('.vf-before-after-images'))return;
    const wrap=document.createElement('div');
    wrap.className='vf-before-after-images';
    wrap.innerHTML=`<figure><figcaption>Antes</figcaption><img alt="Rosto antes" src="${beforeState.image.src}"></figure><div class="vf-before-after-divider">VS</div><figure><figcaption>Depois</figcaption><img alt="Rosto depois" src="${afterState.image.src}"></figure>`;
    host.prepend(wrap);
  }
  const observer=new MutationObserver(inject);
  window.addEventListener('DOMContentLoaded',()=>{const target=document.getElementById('compareResult');if(target)observer.observe(target,{childList:true,subtree:true});inject()});
})();
