export class HandCursor {
 constructor({onCursor,onStatus}){this.onCursor=onCursor;this.onStatus=onStatus;this.running=false;this.generation=0;this.metrics={};}
 async start(){
  if(this.running)return;
  const generation=++this.generation;this.running=true;this.lastSeen=0;this.pinching=false;this.pinchFrames=0;this.releaseFrames=0;this.justPinched=false;this.justReleased=false;this.x=null;this.y=null;
  try{
   const stream=await window.BetweenSharedCamera.acquire('air-mouse');
   if(!this.running||generation!==this.generation){window.BetweenSharedCamera.release('air-mouse');return;}
   this.video=document.createElement('video');this.video.muted=true;this.video.playsInline=true;this.video.srcObject=stream;await this.video.play();
   this.canvas=document.createElement('canvas');this.canvas.width=320;this.canvas.height=240;this.context=this.canvas.getContext('2d');
   try{await this.startWorker();}catch(error){this.worker?.terminate();this.worker=null;if(!this.running||generation!==this.generation)throw error;await this.startCompatible();}
   if(!this.running||generation!==this.generation){this.stop();return;}
   this.renderTime=0;this.renderFrame=requestAnimationFrame(t=>this.render(t));this.analyze(generation);
  }catch(error){this.stop();throw error;}
 }
 async startWorker(){
  if(typeof Worker==='undefined'||typeof OffscreenCanvas==='undefined'||typeof createImageBitmap!=='function')throw Error('Worker no disponible');
  this.worker=new Worker(new URL('./hand-worker.js',import.meta.url));
  await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>reject(Error('El detector tardó demasiado en cargar')),30000);this.startupTimer=timer;this.rejectStartup=reject;
   this.worker.onerror=e=>{e.preventDefault();clearTimeout(timer);reject(Error(e.message||'Falló el detector'));this.pending?.reject(Error(e.message||'Falló el detector'));this.pending=null;};
   this.worker.onmessage=({data})=>{
    if(data.type==='ready'){clearTimeout(timer);this.rejectStartup=null;resolve();}
    else if(data.type==='error'){clearTimeout(timer);reject(Error(data.message));this.pending?.reject(Error(data.message));this.pending=null;}
    else if(data.type==='result'){this.pending?.resolve(data.landmarks);this.pending=null;}
   };
   this.worker.postMessage({type:'init'});
  });
  this.metrics.engine='worker';
 }
 async startCompatible(){
  const {HandLandmarker,FilesetResolver}=await import('./vision_bundle.mjs');
  const files=await FilesetResolver.forVisionTasks(new URL('./',import.meta.url).href.replace(/\/$/,''));
  this.detector=await HandLandmarker.createFromOptions(files,{baseOptions:{modelAssetPath:new URL('./hand_landmarker.task',import.meta.url).href,delegate:'CPU'},canvas:document.createElement('canvas'),runningMode:'VIDEO',numHands:1,minHandDetectionConfidence:.5,minTrackingConfidence:.5});
  this.metrics.engine='compatible';
 }
 async analyze(generation){
  if(!this.running||generation!==this.generation)return;
  const started=performance.now();
  try{
   if(this.video.readyState>=2){
    this.context.drawImage(this.video,0,0,320,240);
    let landmarks;
    if(this.worker){
     const image=await createImageBitmap(this.canvas);
     if(!this.running||generation!==this.generation){image.close();return;}
     landmarks=await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{this.pending=null;reject(Error('El detector de mano dejó de responder'));},5000);
      this.pending={resolve:v=>{clearTimeout(timer);resolve(v)},reject:e=>{clearTimeout(timer);reject(e)}};
      try{this.worker.postMessage({type:'frame',image,timestamp:performance.now()},[image]);}catch(error){image.close();this.pending.reject(error);this.pending=null;}
     });
    }else landmarks=this.detector.detectForVideo(this.canvas,performance.now()).landmarks[0];
    if(this.running&&generation===this.generation)this.update(landmarks);
   }
  }catch(error){
   if(!this.running||generation!==this.generation)return;
   if(this.worker){this.worker.terminate();this.worker=null;this.onStatus('Air Mouse · recuperando detector');try{await this.startCompatible();}catch(next){this.stop();this.onStatus('Air Mouse · '+next.message);this.onError?.(next);return;}}
   else{this.stop();this.onStatus('Air Mouse · '+error.message);this.onError?.(error);return;}
  }
  this.metrics.analysisMs=Math.round(performance.now()-started);
  if(this.running&&generation===this.generation)this.timer=setTimeout(()=>this.analyze(generation),Math.max(10,50-(performance.now()-started)));
 }
 update(p){
  if(!p){this.pinchFrames=0;return;}
  this.lastSeen=performance.now();const clamp=v=>Math.max(0,Math.min(1,v));
  this.tx=clamp(((1-p[8].x)-.12)/.76)*innerWidth;this.ty=clamp((p[8].y-.10)/.75)*innerHeight;
  if(this.x===null){this.x=this.tx;this.y=this.ty;}
  const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
  const ratio=distance(p[4],p[8])/Math.max(.04,distance(p[0],p[9]));
  this.pinchFrames=ratio<.30?this.pinchFrames+1:0;this.releaseFrames=ratio>.45?this.releaseFrames+1:0;
  if(!this.pinching&&this.pinchFrames>=2){this.pinching=true;this.justPinched=true;}
  if(this.pinching&&this.releaseFrames>=2){this.pinching=false;this.justReleased=true;}
 }
 render(now){
  if(!this.running)return;
  const dt=this.renderTime?Math.min(.04,(now-this.renderTime)/1000):.016;this.renderTime=now;
  if(this.x!==null&&now-this.lastSeen<300){const a=1-Math.exp(-18*dt);this.x+=(this.tx-this.x)*a;this.y+=(this.ty-this.y)*a;this.onCursor({x:this.x,y:this.y,pinching:this.pinching,justPinched:!!this.justPinched,justReleased:!!this.justReleased});this.justPinched=false;this.justReleased=false;}
  else{this.pinching=false;this.pinchFrames=0;this.justPinched=false;this.onCursor({x:null,y:null,pinching:false,justReleased:true});}
  this.renderFrame=requestAnimationFrame(t=>this.render(t));
 }
 stop(){
  this.running=false;++this.generation;clearTimeout(this.timer);clearTimeout(this.startupTimer);this.rejectStartup?.(Error('Air Mouse está desactivado'));this.rejectStartup=null;cancelAnimationFrame(this.renderFrame);this.pending?.resolve(null);this.pending=null;this.worker?.terminate();this.worker=null;this.detector?.close();this.detector=null;if(this.video){this.video.pause();this.video.srcObject=null;this.video=null;}window.BetweenSharedCamera.release('air-mouse');this.onCursor({x:null,y:null,pinching:false,justReleased:true});
 }
}
