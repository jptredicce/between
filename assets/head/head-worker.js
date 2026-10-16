
// Pinned runtime and model; the worker owns all inference and WASM memory.
let detector=null;
self.onmessage=async({data})=>{
 if(data.type==='init'){
  try{
   const {FaceLandmarker,FilesetResolver}=await import(new URL('vision_bundle.mjs',self.location.href).href);
   const files=await FilesetResolver.forVisionTasks(new URL('./',self.location.href).href.replace(/\/$/,''));
   detector=await FaceLandmarker.createFromOptions(files,{
    baseOptions:{modelAssetPath:new URL('face_landmarker.task',self.location.href).href,delegate:'CPU'},
    canvas:new OffscreenCanvas(1,1),runningMode:'VIDEO',numFaces:1,
    outputFaceBlendshapes:false,outputFacialTransformationMatrixes:false,
    minFaceDetectionConfidence:.55,minTrackingConfidence:.5
   });
   self.postMessage({type:'ready'});
  }catch(error){self.postMessage({type:'error',message:error.message||String(error)});}
  return;
 }
 if(data.type==='frame'){
  const started=performance.now();
  try{
   if(!detector)throw new Error('El detector todavía no está listo');
   const result=detector.detectForVideo(data.image,data.timestamp);
   const p=result.faceLandmarks?.[0];
   let pitch=null;
   if(p){const h=Math.max(.08,Math.hypot(p[10].x-p[152].x,p[10].y-p[152].y));pitch=(p[1].y-(p[33].y+p[263].y)*.5)/h;}
   self.postMessage({type:'result',id:data.id,pitch,elapsed:performance.now()-started});
  }catch(error){self.postMessage({type:'error',id:data.id,message:error.message||String(error)});}
  finally{data.image.close();}
 }
};
