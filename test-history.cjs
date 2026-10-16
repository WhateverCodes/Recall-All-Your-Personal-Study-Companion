const {shuffleOptions}=require('./shuffle-options.cjs');
const {randomUUID,randomInt}=require('node:crypto');
function assignNames(quizzes){const counts=new Map();let changed=false;for(const q of [...quizzes].sort((a,b)=>a.createdAt.localeCompare(b.createdAt))){const kind=q.label==='Interval question'?'quiz':'test',day=new Date(q.createdAt).toLocaleDateString('en-CA'),key=day+kind;const n=(counts.get(key)||0)+1;counts.set(key,n);if(!q.name){q.name=kind+n;changed=true;}}return changed;}
function combinedAttempt(quizzes,ids,stamp,random=randomInt){
 if(!Array.isArray(ids)||!ids.length||ids.length>100||ids.some(id=>typeof id!=='string'))throw Error('Select between 1 and 100 tests.');
 const selected=[...new Set(ids)].map(id=>{const q=quizzes.find(q=>q.id===id);if(!q)throw Error('Selected test not found.');return q;});
 const questions=selected.flatMap(q=>q.questions.map(item=>shuffleOptions({...item,id:randomUUID()})));
 for(let i=questions.length-1;i>0;i--){const j=random(i+1);[questions[i],questions[j]]=[questions[j],questions[i]];}
 const first=selected[0],root=first.originalQuizId||first.id;
 return {id:randomUUID(),createdAt:new Date(stamp).toISOString(),label:selected.length===1?first.label:'Combined retake',difficulty:selected.length===1?first.difficulty:'mixed',...(selected.length===1?{name:first.name,originalQuizId:root,attempt:1+quizzes.filter(q=>q.id===root||q.originalQuizId===root).length}:{}),sourceQuizIds:selected.map(q=>q.id),answers:{},questions};
}
function retakeBatch(quizzes,ids,stamp){
 const session=combinedAttempt(quizzes,ids,stamp);
 if(session.sourceQuizIds.length===1)return {session,records:[session]};
 const children=session.sourceQuizIds.map(id=>{const source=quizzes.find(q=>q.id===id);const root=source.originalQuizId||source.id;return {id:randomUUID(),createdAt:session.createdAt,name:source.name,label:source.label,difficulty:source.difficulty,originalQuizId:root,attempt:1+quizzes.filter(q=>(q.originalQuizId||q.id)===root).length,answers:{},questions:source.questions.map(q=>shuffleOptions({...q,id:randomUUID()}))};});
 session.questions=children.flatMap(child=>child.questions.map(q=>({...q,attemptQuizId:child.id})));
 for(let i=session.questions.length-1;i>0;i--){const j=randomInt(i+1);[session.questions[i],session.questions[j]]=[session.questions[j],session.questions[i]];}
 session.isCombinedSession=true;session.childQuizIds=children.map(q=>q.id);
 return {session,records:[...children,session]};
}
module.exports={assignNames,combinedAttempt,retakeBatch};
