
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {answerQuiz,missedQuestions,scoreReport,historySummary}=require('../scores.cjs');const {startServer}=require('../server.cjs');
const question=(id)=>({id,sourceId:'source',kind:'short',prompt:'Name the structure for operation '+id,answer:'Stack',acceptedAnswers:['stack'],options:[],explanation:'Last in first out',evidence:'A stack removes the newest item first.'});
test('first answers are immutable and resolved mistakes leave the review queue',()=>{
 const quiz={id:'a',createdAt:new Date(2026,9,1).toISOString(),questions:['a','b','c'].map(question)};
 answerQuiz(quiz,'a','Queue',new Date(2026,9,1).getTime());answerQuiz(quiz,'a','Stack',Date.now());
 assert.equal(quiz.answers.a.correct,false);
 answerQuiz(quiz,'b','Tree',new Date(2026,9,2).getTime());answerQuiz(quiz,'c','Set',new Date(2026,9,3).getTime());
 const reviews=missedQuestions([quiz]);assert.equal(reviews.length,2);assert.equal(reviews[0].prompt,question('a').prompt);assert.notEqual(reviews[0].id,'a');
 const next={questions:reviews};answerQuiz(next,reviews[0].id,' STACK ',new Date(2026,9,4).getTime());
 assert.deepEqual(missedQuestions([quiz,next]).map(q=>q.prompt),[question('b').prompt,question('c').prompt]);
});
test('month totals are weighted by answers with empty days excluded and daily/weekly agreement',()=>{
 const stamp=new Date(2026,9,6,12).getTime();const recent={createdAt:new Date(stamp).toISOString(),questions:[],answers:{a:{correct:true,answeredAt:new Date(2026,9,6,10).toISOString()},b:{correct:false,answeredAt:new Date(2026,9,5,10).toISOString()},c:{correct:false,answeredAt:new Date(2026,8,1).toISOString()}}};
 const daily=scoreReport([recent],stamp),weekly=scoreReport([recent],stamp,'weekly');assert.equal(daily.buckets.length,30);assert.equal(weekly.buckets.length,5);assert.equal(daily.percentage,50);assert.equal(weekly.total,2);assert.equal(daily.buckets.filter(b=>b.percentage===null).length,28);assert.equal(scoreReport([],stamp).percentage,null);
});
test('saved answers survive restart; generation appends two missed questions and scores stay private',async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'recall-scores-'));let app;
 const generator=async()=>['a','b','c'].map(question);const start=()=>startServer({directory,port:0,quizGenerator:generator});
 const call=async(route,body,bridge=false)=>{const base='http://127.0.0.1:'+app.port;return fetch(base+'/api/'+route,{method:body?'POST':'GET',headers:{Origin:base,'Content-Type':'application/json',...(bridge?{'X-Study-Token':app.token}:{})},...(body?{body:JSON.stringify(body)}:{})});};
 try{app=await start();const quiz=await (await call('quiz',{difficulty:'hard'})).json();assert.equal(quiz.difficulty,'hard');
 for(const id of ['a','b'])assert.equal((await call('answer',{quizId:quiz.id,questionId:id,value:'Queue'})).status,200);
 await call('answer',{quizId:quiz.id,questionId:'c',value:'Stack'});
 await new Promise(r=>app.server.close(r));app=await start();
 const scores=await (await call('scores')).json();assert.equal(scores.total,3);assert.equal(scores.percentage,33);assert.equal(scores.history[0].answers.c.correct,true);assert.match(scores.history[0].scoreLabel,/3\/3 answers saved/);
 const next=await (await call('quiz',{difficulty:'easy'})).json();assert.equal(next.questions.filter(q=>q.review).length,2);assert.equal(next.questions.length,3);
 assert.equal((await call('scores',undefined,true)).status,403);assert.equal((await call('answer',{quizId:quiz.id,questionId:'missing',value:'Stack'})).status,400);
 assert.equal((await call('quiz',{difficulty:'impossible'})).status,400);
 await call('forget',{});assert.equal((await (await call('scores')).json()).total,0);
 }finally{if(app)await new Promise(r=>app.server.close(r));fs.rmSync(directory,{recursive:true,force:true});}
});

test('legacy history is unknown, not zero; new answers remain saved and counted',()=>{
 const quiz={questions:[question('a'),question('b')]};assert.equal(historySummary(quiz),'Previous answers were not recorded');
 answerQuiz(quiz,'a','Stack',Date.now());assert.equal(quiz.legacyAnswerHistory,true);assert.match(historySummary(quiz),/1\/2 answers saved.*100% correct.*earlier answers unavailable/);
 assert.equal(historySummary({questions:[question('a')],answers:{}}),'0/1 answers saved');
});
