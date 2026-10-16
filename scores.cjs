const {randomUUID}=require('node:crypto');
const normalize=v=>String(v).normalize('NFKC').trim().toLowerCase().replace(/\s+/g,' ');
const key=q=>JSON.stringify([q.sourceId||q.source||'',normalize(q.prompt),normalize(q.answer)]);
function answerQuiz(quiz,questionId,value,stamp){
 const q=quiz.questions.find(q=>q.id===questionId);
 if(!q)throw Error('Question not found in this test.');
 if(typeof value!=='string'||!value.trim()||value.length>12000)throw Error('Enter an answer first.');
 if(!Object.hasOwn(quiz,'answers'))quiz.legacyAnswerHistory=true;
 quiz.answers ||= {};
 if(!quiz.answers[q.id])quiz.answers[q.id]={value,correct:(q.acceptedAnswers||[q.answer]).some(a=>normalize(a)===normalize(value)),answeredAt:new Date(stamp).toISOString()};
 if(quiz.questions.every(q=>quiz.answers[q.id]))quiz.completedAt ||= new Date(stamp).toISOString();
 return quiz.answers[q.id];
}
function missedQuestions(quizzes,allowedSources=null){
 const latest=new Map();
 for(const quiz of quizzes)for(const q of quiz.questions){const a=quiz.answers?.[q.id];if(a&&(!latest.has(key(q))||a.answeredAt>latest.get(key(q)).answer.answeredAt))latest.set(key(q),{question:q,answer:a});}
 return [...latest.values()].filter(v=>!v.answer.correct&&(!allowedSources||allowedSources.has(v.question.sourceId))).sort((a,b)=>a.answer.answeredAt.localeCompare(b.answer.answeredAt)).slice(0,2).map(({question})=>({...question,id:randomUUID(),review:true}));
}
function historySummary(quiz){
 const answers=Object.values(quiz.answers||{}),correct=answers.filter(a=>a.correct).length;
 const legacy=quiz.legacyAnswerHistory||!Object.hasOwn(quiz,'answers');
 if(!answers.length&&legacy)return 'Previous answers were not recorded';
 return answers.length+'/'+quiz.questions.length+' answers saved'+(answers.length?' · '+Math.round(correct/answers.length*100)+'% correct':'')+(legacy?' · earlier answers unavailable':'');
}
function scoreReport(quizzes,stamp,group='daily'){
 quizzes=quizzes.filter(q=>!q.isCombinedSession);
 if(!['daily','weekly'].includes(group))throw Error('Choose daily or weekly scores.');
 const end=new Date(stamp);end.setHours(0,0,0,0);end.setDate(end.getDate()+1);
 const start=new Date(end);start.setDate(start.getDate()-30);
 const buckets=[];
 for(let date=new Date(start);date<end;){const from=new Date(date);date.setDate(date.getDate()+(group==='weekly'?7:1));const to=new Date(Math.min(+date,+end));buckets.push({start:from.toISOString(),end:to.toISOString(),correct:0,total:0});}
 for(const quiz of quizzes)for(const a of Object.values(quiz.answers||{})){const bucket=buckets.find(b=>a.answeredAt>=b.start&&a.answeredAt<b.end);if(bucket){bucket.total++;if(a.correct)bucket.correct++;}}
 const history=quizzes.filter(q=>(q.createdAt>=start.toISOString()&&q.createdAt<end.toISOString())||Object.values(q.answers||{}).some(a=>a.answeredAt>=start.toISOString()&&a.answeredAt<end.toISOString())).slice().reverse().map(q=>({...q,scoreLabel:historySummary(q)}));
 const total=buckets.reduce((n,b)=>n+b.total,0),correct=buckets.reduce((n,b)=>n+b.correct,0);
 return {start:start.toISOString(),end:end.toISOString(),group,total,correct,percentage:total?Math.round(correct/total*100):null,buckets:buckets.map(b=>({...b,percentage:b.total?Math.round(b.correct/b.total*100):null})),history};
}
module.exports={answerQuiz,missedQuestions,scoreReport,key,historySummary};
