const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const root=fs.existsSync(path.join(__dirname,'../index.html'))?path.join(__dirname,'..'):path.join(__dirname,'../github-pages');
const code=fs.readFileSync(path.join(root,'assets/voice/recognition.js'),'utf8');
function setup(deferred=false){
 let stopped=0,removed=0,closed=0,accepted=0,recognizer,capture,releaseModel;
 const stream={getTracks:()=>[{stop(){stopped++}}]};
 class Recognizer{constructor(){recognizer=this;this.listeners={};}on(name,fn){this.listeners[name]=fn;}remove(){removed++}acceptWaveformFloat(data,rate){assert.equal(rate,16000);accepted++;}}
 const model={KaldiRecognizer:Recognizer};
 class Context{constructor(){this.sampleRate=16000;this.audioWorklet={addModule:async()=>{}};this.destination={};}async resume(){}async close(){closed++}createMediaStreamSource(){return{connect(){},disconnect(){}}}}
 class Capture{constructor(){capture=this;this.port={};}connect(){}disconnect(){}}
 const env={URL,DOMException,queueMicrotask,document:{baseURI:'https://example.test/between/'},navigator:{mediaDevices:{getUserMedia:async()=>stream}},AudioContext:Context,AudioWorkletNode:Capture,Vosk:{createModel:()=>deferred?new Promise(resolve=>releaseModel=()=>resolve(model)):Promise.resolve(model)}};
 env.window=env;const context=vm.createContext(env);vm.runInContext(code,context);const recognition=new env.BetweenLocalSpeechRecognition();
 return{recognition,get recognizer(){return recognizer},get capture(){return capture},releaseModel:()=>releaseModel(),stats:()=>({stopped,removed,closed,accepted})};
}
const tick=()=>new Promise(setImmediate);
test('local Spanish speech routes audio to recognizer and releases microphone on abort',async()=>{
 const env=setup();let started=false,transcript;
 env.recognition.onstart=()=>started=true;env.recognition.onresult=e=>transcript=e.results[0][0].transcript;
 env.recognition.start();await tick();assert(started);
 env.capture.port.onmessage({data:new Float32Array(3200)});assert.equal(env.stats().accepted,1);
 env.recognizer.listeners.result({result:{text:'cómo funcionan los agentes'}});assert.equal(transcript,'cómo funcionan los agentes');
 env.recognition.abort();await tick();assert.deepEqual(env.stats(),{stopped:1,removed:1,closed:1,accepted:1});env.recognition.abort();assert.equal(env.stats().stopped,1);
});
test('cancel during model download releases mic and never starts recording later',async()=>{
 const env=setup(true);let started=false;env.recognition.onstart=()=>started=true;
 env.recognition.start();await tick();env.recognition.abort();env.releaseModel();await tick();assert.equal(started,false);assert.equal(env.stats().stopped,1);assert.equal(env.recognizer,undefined);
});
