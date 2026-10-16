class BetweenVoiceCapture extends AudioWorkletProcessor {
 constructor(){super();this.buffer=new Float32Array(3200);this.offset=0;}
 process(inputs){
  const samples=inputs[0]?.[0];if(!samples)return true;
  for(const sample of samples){this.buffer[this.offset++]=sample;if(this.offset===this.buffer.length){this.port.postMessage(this.buffer,[this.buffer.buffer]);this.buffer=new Float32Array(3200);this.offset=0;}}
  return true;
 }
}
registerProcessor('between-voice-capture',BetweenVoiceCapture);
