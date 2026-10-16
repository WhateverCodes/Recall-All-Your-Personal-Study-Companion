const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {startServer}=require('../server.cjs');
test('ten-minute reminder reaches extension status, generates once, dismisses and survives restart',async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'recall-reminder-'));let stamp=Date.now(),calls=0;
 fs.writeFileSync(path.join(directory,'study.json'),JSON.stringify({entries:[{id:'study',capturedAt:new Date(stamp).toISOString(),text:'Stacks follow last in first out ordering to reverse recent operations.',url:'https://example.com'}],quizzes:[],interval:10,readingSeconds:{},reminderClock:{date:new Date(stamp).toLocaleDateString('en-CA'),seconds:599}}));
 const quizGenerator=async()=>{calls++;return [{id:'question',kind:'boolean',prompt:'Stacks follow last in first out.',options:['True','False'],answer:'True'}];};
 let app=await startServer({directory,port:0,now:()=>stamp,quizGenerator});
 const call=async(route,body)=>{const base='http://127.0.0.1:'+app.port;return (await fetch(base+'/api/'+route,{method:body?'POST':'GET',headers:{Origin:base,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})})).json();};
 try{const enabled=await call('viewing',{viewing:true});stamp+=1000;await call('tick',{epoch:enabled.epoch,elapsed:1});await new Promise(r=>setImmediate(r));let status=await call('status');assert.equal(status.questionReady,true);assert.equal(status.reminderQuestion.id,'question');
 const answered=await call('reminder-answer',{questionId:'question',value:'False'});assert.equal(answered.answer.correct,false);
 const retried=await call('reminder-answer',{questionId:'question',value:'True'});assert.equal(retried.answer.correct,false);
 const report=await call('scores');assert.equal(report.total,1);assert.equal(report.history[0].label,'Interval question');stamp+=1000;await call('tick',{epoch:enabled.epoch,elapsed:1});assert.equal(calls,1);await new Promise(r=>app.server.close(r));app=await startServer({directory,port:0,now:()=>stamp,quizGenerator});assert.equal((await call('status')).questionReady,true);await call('reminder-dismiss',{});assert.equal((await call('status')).questionReady,false);assert.equal((await call('state')).activeSeconds,0);}finally{await new Promise(r=>app.server.close(r));fs.rmSync(directory,{recursive:true,force:true});}
});
