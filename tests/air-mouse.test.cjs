const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=fs.existsSync(path.join(__dirname,'../index.html'))?path.join(__dirname,'..'):path.join(__dirname,'../github-pages');
const source=fs.readFileSync(path.join(root,'assets/head/air-mouse.js'),'utf8');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
test('the page leaves the external air cursor visible and uses a local module',()=>{
 assert.match(html,/else if\(!window.betweenExternalAirActive\)cursor.style.display='none'/);
 assert.match(html,/import \{ HandCursor \} from '\.\/assets\/head\/air-mouse.js/);
 assert(!html.includes('cdn.jsdelivr.net/gh/CR8C0NT1NUM'));
});
test('pinch clicks once, release uses hysteresis, lost hand hides cursor',async()=>{
 const {HandCursor}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
 global.innerWidth=1000;global.innerHeight=800;global.requestAnimationFrame=()=>1;
 const frames=[],engine=new HandCursor({onCursor:v=>frames.push(v),onStatus:()=>{}});
 engine.running=true;engine.x=null;engine.pinching=false;engine.pinchFrames=0;engine.releaseFrames=0;
 const hand=Array.from({length:21},()=>({x:.5,y:.5}));hand[0]={x:.5,y:.8};hand[9]={x:.5,y:.5};hand[8]={x:.4,y:.4};hand[4]={x:.41,y:.4};
 engine.update(hand);engine.render(performance.now());assert(!frames.at(-1).justPinched);
 engine.update(hand);engine.render(performance.now());assert(frames.at(-1).justPinched);assert(frames.at(-1).pinching);
 engine.update(hand);engine.render(performance.now());assert(!frames.at(-1).justPinched);
 hand[4]={x:.7,y:.4};engine.update(hand);engine.update(hand);engine.render(performance.now());assert(frames.at(-1).justReleased);
 engine.lastSeen=0;engine.render(performance.now()+1000);assert.equal(frames.at(-1).x,null);
});
