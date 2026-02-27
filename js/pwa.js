// Minimal PWA helper (safe no-op)
(function(){
  // You can add "install" UI later. For now just register sw if present.
  if('serviceWorker' in navigator){
    window.addEventListener('load', ()=>{
      navigator.serviceWorker.register('./sw.js').catch(()=>{});
    });
  }
})();
