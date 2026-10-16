(()=>{
 let loading=null;
 function model(){
  if(!loading)loading=(async()=>{
   if(!window.Vosk)await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=new URL('assets/voice/vosk.js',document.baseURI);script.onload=resolve;script.onerror=()=>{script.remove();reject(Error('No se pudo cargar el reconocimiento de voz'));};document.head.append(script);});
   return Vosk.createModel(new URL('assets/voice/model-es.tar.gz',document.baseURI).href,-1);
  })().catch(error=>{loading=null;throw error;});
  return loading;
 }
 window.BetweenLocalSpeechRecognition=class {
  constructor(){this.active=false;this.generation=0;this.lang='es-ES';}
  start(){
   if(this.active)throw new DOMException('El micrófono ya está activo','InvalidStateError');
   this.active=true;const generation=++this.generation;
   this.begin(generation).catch(error=>{if(generation!==this.generation)return;this.onerror?.({error:error.name==='NotAllowedError'?'not-allowed':'audio-capture',message:error.message});this.abort();});
  }
  async begin(generation){
   const stream=await navigator.mediaDevices.getUserMedia({video:false,audio:{echoCancellation:true,noiseSuppression:true,channelCount:1}});
   if(!this.active||generation!==this.generation){stream.getTracks().forEach(t=>t.stop());return;}
   this.stream=stream;this.onloading?.();
   const speechModel=await model();if(!this.active||generation!==this.generation)return;
   const context=new AudioContext({sampleRate:16000});this.context=context;
   await context.audioWorklet.addModule(new URL('assets/voice/capture-worklet.js',document.baseURI).href);
   if(!this.active||generation!==this.generation){await context.close();return;}
   await context.resume();
   const recognizer=new speechModel.KaldiRecognizer(context.sampleRate);this.recognizer=recognizer;
   recognizer.on('result',({result})=>{
    const transcript=result?.text?.trim();if(!transcript||!this.active||generation!==this.generation)return;
    this.onresult?.({results:[[{transcript,isFinal:true}]]});
   });
   recognizer.on('error',event=>{if(this.active)this.onerror?.({error:'audio-capture',message:event.error});});
   this.source=context.createMediaStreamSource(stream);this.capture=new AudioWorkletNode(context,'between-voice-capture');
   this.capture.port.onmessage=({data})=>{if(this.active&&generation===this.generation)recognizer.acceptWaveformFloat(data,context.sampleRate);};
   // The worklet outputs silence, so keeping it connected does not echo the microphone.
   this.source.connect(this.capture);this.capture.connect(context.destination);this.onstart?.();
  }
  abort(){
   if(!this.active)return;this.active=false;++this.generation;
   this.stream?.getTracks().forEach(t=>t.stop());this.stream=null;this.source?.disconnect();this.capture?.disconnect();if(this.capture)this.capture.port.onmessage=null;this.source=null;this.capture=null;
   this.recognizer?.remove();this.recognizer=null;this.context?.close().catch(()=>{});this.context=null;queueMicrotask(()=>this.onend?.());
  }
  stop(){this.abort();}
 };
})();
