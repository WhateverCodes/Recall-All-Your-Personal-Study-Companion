const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {startServer}=require('../server.cjs');
test('reading clock counts seconds, survives settings and restart, excludes paused and overlapping ticks',async t=>{
  const directory=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'clock-test-'));let time=Date.now();
  let app=await startServer({port:0,directory,now:()=>time});
  t.after(async()=>{await new Promise(resolve=>app.server.close(resolve));fs.rmSync(directory,{recursive:true,force:true});});
  let base='http://127.0.0.1:'+app.port;
  const post=async(route,body)=>{const r=await fetch(base+'/api/'+route,{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify(body)});return r.json();};
  const state=async()=> (await fetch(base+'/api/state')).json();
  const enabled=await post('viewing',{viewing:true});
  for(let i=0;i<65;i++){time+=1000;await post('tick',{epoch:enabled.epoch,elapsed:1});await post('tick',{epoch:enabled.epoch,elapsed:1});}
  assert.equal((await state()).todayReadingSeconds,65);
  assert.equal((await (await fetch(base+'/api/status',{headers:{'X-Study-Token':app.token}})).json()).todayReadingSeconds,65);
  await post('settings',{interval:15});assert.equal((await state()).todayReadingSeconds,65);
  await post('viewing',{viewing:false});time+=10000;await post('tick',{epoch:enabled.epoch,elapsed:10});assert.equal((await state()).todayReadingSeconds,65);
  await new Promise(resolve=>app.server.close(resolve));app=await startServer({port:0,directory,now:()=>time});base='http://127.0.0.1:'+app.port;
  assert.equal((await state()).todayReadingSeconds,65);assert.equal((await state()).viewing,false);
});
