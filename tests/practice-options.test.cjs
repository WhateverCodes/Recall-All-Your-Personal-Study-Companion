
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');const {startServer}=require('../server.cjs');
test('page time, topic exclusions and independent retake attempts persist',async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'recall-options-'));let stamp=new Date(2026,9,6,12).getTime(),inputs=[];
 const entries=['a','b'].map(id=>({id,url:'https://example.com/'+id,title:'Topic '+id,text:'A stack removes the most recently added item first.',capturedAt:new Date(stamp).toISOString()}));
 fs.writeFileSync(path.join(directory,'study.json'),JSON.stringify({entries,quizzes:[],interval:30,readingSeconds:{}}));
 const quizGenerator=async selected=>{inputs.push(selected.map(e=>e.id));return selected.map(e=>({id:e.id,sourceId:e.id,source:e.url,prompt:'Which structure follows last in first out for '+e.id+'?',answer:'Stack',kind:'short'}));};
 let app=await startServer({port:0,directory,now:()=>stamp,quizGenerator});
 const call=async(route,body)=>{const base='http://127.0.0.1:'+app.port;return fetch(base+'/api/'+route,{method:body?'POST':'GET',headers:{Origin:base,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});};
 try{
 let revision=await (await call('revision')).json();assert.equal(revision.topics.length,2);assert.equal(revision.pageSummaries[0].studySeconds,null);
 const viewing=await (await call('viewing',{viewing:true})).json();stamp+=1000;await call('tick',{epoch:viewing.epoch,elapsed:1,url:entries[0].url+'?private=1#section'});
 revision=await (await call('revision')).json();assert.equal(revision.pageSummaries[0].studySeconds,1);assert.equal(revision.pageSummaries[1].studySeconds,null);
 const original=await (await call('quiz',{topics:[entries[0].url],difficulty:'hard'})).json();assert.deepEqual(inputs.at(-1),['a']);
 await call('answer',{quizId:original.id,questionId:'a',value:'Queue'});
 const filtered=await (await call('quiz',{topics:[entries[1].url]})).json();assert.equal(filtered.questions.length,1);assert.equal(filtered.questions[0].sourceId,'b');
 const before=inputs.length;const retake=await (await call('retake',{quizId:original.id})).json();assert.equal(inputs.length,before);assert.equal(retake.attempt,2);assert.equal(retake.difficulty,'hard');assert.deepEqual(retake.answers,{});assert.notEqual(retake.questions[0].id,'a');
 await call('answer',{quizId:retake.id,questionId:retake.questions[0].id,value:'Stack'});
 const third=await (await call('retake',{quizId:retake.id})).json();assert.equal(third.attempt,3);assert.equal(third.originalQuizId,original.id);
 assert.equal((await call('quiz',{topics:[]})).status,400);assert.equal((await call('quiz',{topics:['https://unknown.test/']})).status,400);
 await new Promise(r=>app.server.close(r));app=await startServer({port:0,directory,now:()=>stamp,quizGenerator});
 const state=await (await call('state')).json();assert.equal(state.quizzes.find(q=>q.id===original.id).answers.a.correct,false);assert.equal(state.quizzes.find(q=>q.id===retake.id).answers[retake.questions[0].id].correct,true);
 assert.equal((await (await call('revision')).json()).pageSummaries[0].studySeconds,1);
 }finally{await new Promise(r=>app.server.close(r));fs.rmSync(directory,{recursive:true,force:true});}
});
