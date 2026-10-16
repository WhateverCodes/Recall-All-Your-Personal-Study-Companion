const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
function harness({noAudio=false,startGate,statusGate}={}){
 const elements=new Map(),calls=[],recorders=[],listeners={};let clock=0,poll;const serverStatus={installed:true,active:false,paused:false,version:0};
 const element=()=>({textContent:'',value:'',disabled:false,hidden:false,append(){},prepend(){},after(){},replaceChildren(){},dataset:{}});
 const get=id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id);};
 const track=kind=>({kind,stopped:false,stop(){this.stopped=true;},addEventListener(){}});
 const video=track('video'),audio=track('audio'),stream={getTracks:()=>noAudio?[video]:[video,audio],getAudioTracks:()=>noAudio?[]:[audio]};
 class Recorder {static isTypeSupported(){return true;}constructor(source){this.source=source;this.state='inactive';recorders.push(this);}start(){this.state='recording';}stop(){this.state='inactive';this.ondataavailable({data:new Blob(['test audio'])});queueMicrotask(()=>this.onstop());}}
 class Reader {async readAsDataURL(blob){this.result='data:audio/webm;base64,'+Buffer.from(await blob.arrayBuffer()).toString('base64');this.onload();}}
 const context={document:{createElement:element,getElementById:get,querySelector:get},window:{MediaRecorder:Recorder,addEventListener:(name,fn)=>listeners[name]=fn},navigator:{mediaDevices:{getDisplayMedia:async options=>{calls.push({picker:options});return stream;}},sendBeacon(){}},MediaRecorder:Recorder,MediaStream:class{constructor(tracks){this.tracks=tracks;}},FileReader:Reader,Blob,Date,Option:class{constructor(text,value){this.text=text;this.value=value;}},performance:{now:()=>clock},setTimeout:()=>1,clearTimeout(){},setInterval(fn){poll=fn;},fetch:async(url,options)=>{const body=options.body?JSON.parse(options.body):null;calls.push({url,body});if(url.endsWith('/start')&&startGate)await startGate;if(url.endsWith('/status')&&statusGate)await statusGate;return {ok:true,json:async()=>url.endsWith('/status')?serverStatus:url.endsWith('/start')?{id:'session'}:{saved:true,message:'Transcript saved.'}};}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../ui/audio.js'),'utf8'),context);
 return {get,calls,recorders,video,audio,listeners,serverStatus,poll:()=>poll(),advance:(ms=20000)=>clock+=ms};
}
const settle=async()=>{for(let i=0;i<5;i++)await new Promise(resolve=>setImmediate(resolve));};
test('a delayed pre-start status response cannot stop a newly started recording',async()=>{
 let resolve;const gate=new Promise(r=>resolve=r);const h=harness({statusGate:gate});
 await h.get('startAudio').onclick();resolve();await settle();
 assert.equal(h.audio.stopped,false);assert.equal(h.recorders[0].state,'recording');
 assert.equal(h.get('speechSetup').hidden,true);
 h.advance();await h.get('stopAudio').onclick();await settle();
});
test('a background-delayed 65-second segment is saved instead of aborting at 40 seconds',async()=>{
 const h=harness();await settle();await h.get('startAudio').onclick();h.advance(65000);
 await h.get('stopAudio').onclick();await settle();
 const chunk=h.calls.find(c=>c.url?.endsWith('/chunk'));assert.equal(chunk.body.duration,65);
 assert.match(h.get('transcriptStatus').textContent,/Audio stopped/);
});
test('audio controls never record video, and Stop saves the final audio before closing the session',async()=>{
 const h=harness();await settle();await h.get('startAudio').onclick();assert.equal(h.recorders.length,1);assert.deepEqual(h.recorders[0].source.tracks.map(t=>t.kind),['audio']);
 h.advance();await h.get('stopAudio').onclick();await settle();assert(h.video.stopped&&h.audio.stopped);
 const posted=h.calls.filter(c=>c.body);assert(posted.find(c=>c.url.endsWith('/chunk')));assert(posted.at(-1).url.endsWith('/stop'));assert.match(h.get('transcriptStatus').textContent,/Audio stopped/);
});
test('sharing a screen without an audio track releases capture and never starts the server worker',async()=>{
 const h=harness({noAudio:true});await settle();await h.get('startAudio').onclick();assert(h.video.stopped);assert.equal(h.recorders.length,0);assert(!h.calls.some(c=>c.url?.endsWith('/start')));assert.match(h.get('transcriptStatus').textContent,/No audio was shared/);
});
test('cancelling while the model loads never begins recording and closes the late session',async()=>{
 let resolve;const gate=new Promise(r=>resolve=r);const h=harness({startGate:gate});await settle();const pending=h.get('startAudio').onclick();await settle();await h.get('stopAudio').onclick();resolve();await pending;await settle();assert.equal(h.recorders.length,0);assert(h.audio.stopped);assert(h.calls.some(c=>c.url?.endsWith('/stop')&&c.body.id==='session'));
});

test('owl pause discards current audio and resume starts a new version without releasing sharing',async()=>{
 const h=harness();await settle();await h.get('startAudio').onclick();h.advance();
 Object.assign(h.serverStatus,{active:true,paused:true,version:1});await h.poll();await settle();
 assert.equal(h.recorders[0].state,'inactive');assert.equal(h.audio.stopped,false);assert(!h.calls.some(c=>c.url?.endsWith('/chunk')));
 Object.assign(h.serverStatus,{paused:false,version:2});await h.poll();await settle();
 assert.equal(h.recorders.length,2);assert.equal(h.recorders[1].state,'recording');h.advance();await h.get('stopAudio').onclick();await settle();
 assert.equal(h.calls.find(c=>c.url?.endsWith('/chunk')).body.version,2);
});
