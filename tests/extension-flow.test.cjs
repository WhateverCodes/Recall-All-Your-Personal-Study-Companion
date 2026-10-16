const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');
const {startServer}=require('../server.cjs');
test('production extension scripts deliver a likely-read external-page section to the server without an Origin header',async(t)=>{
  const directory=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'extension-test-'));
  const {server,token,port}=await startServer({port:0,directory});
  t.after(()=>new Promise(resolve=>server.close(resolve)));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
  const base='http://127.0.0.1:'+port;
  const post=(route,body)=>fetch(base+'/api/'+route,{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify(body)});
  const source='https://example.com/learning';
  let onMessage,documentId='first',queryCount=0,reminderFixture=null;
  const local={},session={};
  const storage=data=>({get:async key=>({[key]:data[key]}),set:async values=>Object.assign(data,values),remove:async key=>{delete data[key];}});
  const backgroundChrome={runtime:{id:require('../extension-id.json').id,onInstalled:{addListener(){}},onMessage:{addListener(fn){onMessage=fn;}}},
    storage:{local:storage(local),session:storage(session)},
    tabs:{onRemoved:{addListener(){}},get:async()=>({active:true,windowId:1})},windows:{get:async()=>({focused:true})}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../extension/background.js'),'utf8').replace('http://127.0.0.1:43127',base),{chrome:backgroundChrome,fetch,URL,AbortSignal});
  let tick,time=0,holdStatus=false,releaseStatus,dismissFailure=false,invalidContext=false,reloaded=false;
  const text='Photosynthesis transforms light energy into chemical energy that organisms can store for subsequent biological processes.';
  const paragraph={closest:()=>null,getBoundingClientRect:()=>({top:0,bottom:100,height:100,width:500}),innerText:text};
  const nodes=[];
  function createElement(tag){const el={tag,style:{setProperty(key,value){this[key]=value;}},children:[],textContent:'',setPointerCapture(){},getBoundingClientRect(){return {left:100,top:100,width:220,height:220};},setAttribute(){},append(...items){this.children.push(...items);},attachShadow(){return createElement('shadow');},remove(){}};nodes.push(el);return el;}
  const dispatch=message=>new Promise(resolve=>onMessage(message,{tab:{id:1},documentId,url:source},result=>resolve(message.type==='status'&&reminderFixture?{...result,...reminderFixture}:result)));
  const context={chrome:{runtime:{onMessage:{addListener(){}},sendMessage:async message=>{
      if(invalidContext)throw Error('Extension context invalidated.');
      if(message.type==='reminder-dismiss'&&dismissFailure)throw Error('Connection lost');
      if(message.type==='reminder-answer'&&reminderFixture)return {answer:{correct:message.payload.value===reminderFixture.reminderQuestion.answer}};
      const result=await dispatch(message);
      if(message.type==='status'&&holdStatus)await new Promise(resolve=>{releaseStatus=resolve;});
      return result;
    }}},
    performance:{now:()=>time},Date,location:{href:source,reload(){reloaded=true;}},document:{getElementById:()=>null,visibilityState:'visible',hasFocus:()=>true,title:'External test article',querySelectorAll:()=>{queryCount++;return [paragraph];},createElement,createElementNS:(_ns,tag)=>createElement(tag),documentElement:createElement('html')},
    innerHeight:900,innerWidth:1200,getComputedStyle:()=>({visibility:'visible',opacity:'1'}),addEventListener(){},setInterval(fn){tick=fn;}};
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../extension/reading.js'),'utf8'),context);
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../extension/content.js'),'utf8'),context);
  for(let i=0;i<12;i++){time+=1000;await tick();}
  assert.equal((await (await fetch(base+'/api/state')).json()).entries.length,0,'paused capture must not save');
  assert.ok(nodes.some(el=>el.id==='recall-all-companion'),'unapproved page gets the floating companion');
  assert.equal(queryCount,0,'no document text queried before consent');
  assert.equal(local.token,undefined,'no pairing needed until an allow choice');
  for(const label of ['Allow this site','Always allow this site','Don’t allow'])assert.ok(nodes.some(el=>el.textContent===label));
  await nodes.find(el=>el.textContent==='Allow this site').onclick();
  assert.equal(local.token,token,'automatically connected without a copied code');
  const control=nodes.find(el=>el.tag==='button'&&el.textContent==='Stop viewing');assert.ok(control);
  for(let i=0;i<12;i++){time+=1000;await tick();}
  const result=await (await fetch(base+'/api/state')).json();
  assert.equal(result.entries.length,1);assert.equal(result.entries[0].text,text);assert.equal(result.entries[0].url,source);assert.equal(result.extensionConnected,true);
  nodes.find(el=>el.textContent==='−').onclick();
  reminderFixture={questionReady:true,reminderQuestion:{id:'check',kind:'boolean',prompt:'A stack is last in, first out.',options:['True','False'],answer:'True',explanation:'The newest item is removed first.'}};
  time+=1000;await tick();
  assert.ok(nodes.some(el=>el.className==='card'),'reminder expands minimized companion');
  assert.ok(nodes.some(el=>el.textContent==='Time for a question'));
  await nodes.find(el=>el.tag==='button'&&el.textContent==='True').onclick();
  assert.ok(nodes.some(el=>el.textContent.startsWith('Correct.')));
  const done=nodes.find(el=>el.textContent==='Done / remind me next interval');
  const reminder=nodes.find(el=>el.className==='reminder');
  nodes.find(el=>el.textContent==='−').onclick();
  assert.equal(reminder.hidden,true,'minimizing hides the entire reminder');
  time+=1000;await tick();assert.equal(reminder.hidden,true,'polling leaves minimized reminder hidden');
  nodes.find(el=>el.textContent==='↗').onclick();assert.equal(reminder.hidden,false,'expanding restores reminder');
  dismissFailure=true;await done.onclick();
  assert.equal(reminder.hidden,false,'failed dismissal keeps question available');
  assert.equal(done.disabled,false,'retry remains available');
  assert.ok(nodes.some(el=>el.textContent.includes('Could not dismiss the reminder. Connection lost')));
  dismissFailure=false;holdStatus=true;time+=1000;const pendingTick=tick();
  while(!releaseStatus)await new Promise(resolve=>setImmediate(resolve));
  await done.onclick();
  assert.equal(reminder.hidden,true,'Done hides answered reminder');
  const dismissed=await (await fetch(base+'/api/state')).json();
  assert.equal(dismissed.questionReady,false);assert.equal(dismissed.activeSeconds,0);
  releaseStatus();await pendingTick;
  assert.equal(reminder.hidden,true,'older status response cannot reopen dismissed question');
  holdStatus=false;reminderFixture=null;time+=1000;await tick();
  assert.equal(reminder.hidden,true,'reminder stays dismissed on next poll');
  assert.equal(control.textContent,'Stop viewing');await control.onclick();
  assert.ok(nodes.some(el=>el.className==='owl covered'),'owl enters sleeping pose when stopped');
  nodes.find(el=>el.textContent==='−').onclick();
  assert.ok(nodes.some(el=>el.className==='card compact'));
  assert.equal(control.hidden,false,'start remains accessible when minimized');
  const grip=nodes.find(el=>el.className==='grip');const host=nodes.find(el=>el.id==='recall-all-companion');
  grip.onpointerdown({button:0,clientX:105,clientY:105,pointerId:1,preventDefault(){}});
  grip.onpointermove({clientX:2000,clientY:-100,pointerId:1,preventDefault(){}});
  assert.equal(host.style.left,'980px');assert.equal(host.style.top,'0px');grip.onpointerup();
  nodes.find(el=>el.textContent==='↗').onclick();
  assert.ok(nodes.some(el=>el.className==='card'),'expand restores full widget');
  paragraph.innerText='A different paragraph must not be accepted after the user has paused the study companion.';
  for(let i=0;i<12;i++){time+=1000;await tick();}
  assert.equal((await (await fetch(base+'/api/state')).json()).entries.length,1);
  documentId='second';assert.equal((await dispatch({type:'status'})).decision,'ask','one-visit permission expires on navigation');
  await dispatch({type:'consent',choice:'always'});documentId='third';
  assert.equal((await dispatch({type:'status'})).decision,'always');
  await dispatch({type:'consent',choice:'deny'});const before=queryCount;
  for(let i=0;i<12;i++){time+=1000;await tick();}
  assert.equal(queryCount,before,'denied site is never queried for text');
  assert.equal((await dispatch({type:'entry',payload:{text,url:source}})).error,'Site not approved');
  nodes.find(el=>el.textContent==='−').onclick();await control.onclick();
  assert.ok(nodes.some(el=>el.className==='card'),'start on denied site expands permission choices');
  assert.equal((await dispatch({type:'status'})).decision,'deny','compact start cannot bypass consent');
  invalidContext=true;time+=1000;await tick();
  assert.equal(reminder.hidden,true,'invalidated extension hides stale reminder');
  assert.equal(control.textContent,'Refresh page');assert.equal(control.disabled,false);
  await control.onclick();assert.equal(reloaded,true,'recovery button refreshes only on user click');
  invalidContext=false;await dispatch({type:'consent',choice:'always'});
  let freshTick;const fresh={...context,setInterval(fn){freshTick=fn;}};delete fresh.__studyOwl;
  const beforeReload=nodes.length;vm.createContext(fresh);vm.runInContext(fs.readFileSync(path.join(__dirname,'../extension/content.js'),'utf8'),fresh);
  assert.equal(nodes.length,beforeReload,'no full-size widget is painted before permission is known');
  await freshTick();const freshNodes=nodes.slice(beforeReload);
  assert.ok(freshNodes.some(el=>el.className==='card compact'),'approved page starts minimized');
  assert.ok(!freshNodes.some(el=>el.className==='card'),'approved page never starts expanded');
});
test('pairing survives server restarts while viewing stays paused',async(t)=>{
  const directory=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'pairing-test-'));
  t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
  const first=await startServer({port:0,directory});const firstToken=first.token;
  await new Promise(resolve=>first.server.close(resolve));
  const second=await startServer({port:0,directory});
  t.after(()=>new Promise(resolve=>second.server.close(resolve)));
  assert.equal(second.token,firstToken);
  const state=await (await fetch('http://127.0.0.1:'+second.port+'/api/state')).json();
  assert.equal(state.viewing,false);assert.equal(state.extensionConnected,false);
});

