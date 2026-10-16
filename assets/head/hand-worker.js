let detector=null;
self.onmessage=async({data})=>{
 try{
  if(data.type==='init'){
   const {HandLandmarker,FilesetResolver}=await import(new URL('vision_bundle.mjs',self.location.href).href);
   const files=await FilesetResolver.forVisionTasks(new URL('./',self.location.href).href.replace(/\/$/,''));
   detector=await HandLandmarker.createFromOptions(files,{baseOptions:{modelAssetPath:new URL('hand_landmarker.task',self.location.href).href,delegate:'CPU'},canvas:new OffscreenCanvas(1,1),runningMode:'VIDEO',numHands:1,minHandDetectionConfidence:.5,minTrackingConfidence:.5});
   self.postMessage({type:'ready'});return;
  }
  if(data.type==='frame'){
   if(!detector)throw new Error('El detector de mano no está listo');
   const result=detector.detectForVideo(data.image,data.timestamp);
   self.postMessage({type:'result',landmarks:result.landmarks[0]||null});
  }
 }catch(error){self.postMessage({type:'error',message:error.message||String(error)});}
 finally{data.image?.close();}
};
