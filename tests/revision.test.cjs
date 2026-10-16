const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {startServer}=require('../server.cjs');
test('revision ranges and same-day restart preserve study material',async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'recall-revision-'));
 const stamp=new Date(2026,9,5,12).getTime();
 const entries=Array.from({length:30},(_,days)=>{const d=new Date(stamp);d.setDate(d.getDate()-days);return {id:String(days),capturedAt:d.toISOString(),url:'https://example.com/'+days,title:'Day '+days,text:'Photosynthesis transforms light energy into chemical energy that organisms can store.'};});
 fs.writeFileSync(path.join(directory,'study.json'),JSON.stringify({entries,quizzes:[],interval:30,readingSeconds:{}}));
 let app=await startServer({directory,port:0,now:()=>stamp,quizGenerator:require('../core.cjs').makeQuiz});
 const call=async(route,body)=>{const base='http://127.0.0.1:'+app.port;return fetch(base+'/api/'+route,{method:body?'POST':'GET',headers:{Origin:base,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});};
 try {
 for(const [period,expected] of [['today',1],['yesterday',1],['week1',7],['week2',7],['week3',7],['week4',7]]){
 const result=await (await call('revision?period='+period)).json();assert.equal(result.count,expected);
 const quiz=await (await call('quiz',{period})).json();assert.equal(quiz.questions.length,expected);assert.equal(quiz.period,period);
 if(period==='week4')assert.deepEqual(quiz.questions.map(q=>q.sourceId),['22','23','24','25','26','27','28']);
 }
 assert.equal((await call('quiz',{period:'invalid'})).status,400);
 await new Promise(resolve=>app.server.close(resolve));
 app=await startServer({directory,port:0,now:()=>stamp,quizGenerator:require('../core.cjs').makeQuiz});
 const state=await (await call('state')).json();assert.equal(state.viewing,false);assert.equal(state.entries.length,30);
 const quiz=await (await call('quiz',{period:'today'})).json();assert.equal(quiz.questions[0].sourceId,'0');
 } finally {await new Promise(resolve=>app.server.close(resolve));fs.rmSync(directory,{recursive:true,force:true});}
});

test('long revision quizzes sample the full period, not just its final sections',()=>{const {makeQuiz}=require('../core.cjs');const questions=makeQuiz(Array.from({length:30},(_,i)=>({id:String(i),text:'Photosynthesis transforms light energy into chemical energy that organisms can store.',url:'https://example.com/'+i})));assert.equal(questions.length,10);assert.equal(questions[0].sourceId,'0');assert.equal(questions[9].sourceId,'29');});
