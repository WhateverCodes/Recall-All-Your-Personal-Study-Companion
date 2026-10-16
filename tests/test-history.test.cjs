const test=require('node:test'),assert=require('node:assert/strict');const {assignNames,combinedAttempt}=require('../test-history.cjs');
test('daily names distinguish tests and interval quizzes and preserve custom names',()=>{const qs=[{id:'a',createdAt:'2026-10-05T10:00:00',questions:[]},{id:'b',createdAt:'2026-10-05T11:00:00',label:'Interval question',questions:[]},{id:'c',createdAt:'2026-10-05T12:00:00',questions:[]},{id:'d',createdAt:'2026-10-06T10:00:00',questions:[]}];assignNames(qs);assert.deepEqual(qs.map(q=>q.name),['test1','quiz1','test2','test1']);qs[0].name='Stacks';assignNames(qs);assert.equal(qs[0].name,'Stacks');});
test('combined retake preserves all questions and original answers while shuffling',()=>{const qs=[{id:'a',questions:[{id:'a1',prompt:'One'},{id:'a2',prompt:'Two'}],answers:{a1:{correct:true}}},{id:'b',questions:[{id:'b1',prompt:'Three'}]}];const copy=JSON.stringify(qs);const q=combinedAttempt(qs,['a','b','a'],Date.now(),()=>0);assert.equal(q.questions.length,3);assert.deepEqual(q.questions.map(x=>x.prompt),['Two','Three','One']);assert.deepEqual(q.answers,{});assert.equal(q.sourceQuizIds.length,2);assert.equal(JSON.stringify(qs),copy);assert.equal(new Set(q.questions.map(x=>x.id)).size,3);assert.throws(()=>combinedAttempt(qs,[],Date.now()));assert.throws(()=>combinedAttempt(qs,['unknown'],Date.now()));});

test('combined retake updates both attempt counts and separate scores without double counting',async()=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path');const {startServer}=require('../server.cjs');const {historyGroups}=require('../ui/view-models.js');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'recall-batch-'));const createdAt=new Date().toISOString();
 const originals=['a','b'].map(id=>({id,name:id,createdAt,questions:[{id:id+'1',prompt:id+' question',answer:'yes',kind:'short'}],answers:{}}));fs.writeFileSync(path.join(dir,'study.json'),JSON.stringify({entries:[],quizzes:originals,readingSeconds:{}}));
 const app=await startServer({port:0,directory:dir});const base='http://127.0.0.1:'+app.port;
 const call=async(route,body)=>(await fetch(base+'/api/'+route,{method:body?'POST':'GET',headers:{Origin:base,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})})).json();
 try{const session=await call('retake',{quizIds:['a','b']});assert.equal(session.questions.length,2);
 let state=await call('state');assert.deepEqual(historyGroups(state.quizzes).map(g=>g.attempts.length),[2,2]);
 for(const q of session.questions)await call('answer',{quizId:session.id,questionId:q.id,value:q.prompt.startsWith('a')?'yes':'no'});
 state=await call('state');const groups=historyGroups(state.quizzes);assert.equal(groups.find(g=>g.id==='a').score,'100%');assert.equal(groups.find(g=>g.id==='b').score,'0%');assert.deepEqual(state.quizzes.find(q=>q.id==='a').answers,{});
 const report=await call('scores');assert.equal(report.total,2);assert.equal(report.correct,1);
 }finally{await new Promise(r=>app.server.close(r));fs.rmSync(dir,{recursive:true,force:true});}
});
