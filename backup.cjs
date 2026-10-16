const MAX=20*1024*1024;
const object=v=>v&&typeof v==='object'&&!Array.isArray(v);
const fail=()=>{throw Error('Invalid Recall-All backup. No study data was changed.');};
function pick(v,fields){if(!object(v))fail();const out={};for(const k of fields.split(' '))if(Object.hasOwn(v,k))out[k]=v[k];return out;}
function text(v,max=12000){if(typeof v!=='string'||v.length>max)fail();return v;}
function date(v){if(typeof v!=='string'||!Number.isFinite(Date.parse(v)))fail();return v;}
function url(v){text(v,3000);if(!v)return v;try{if(!['http:','https:'].includes(new URL(v).protocol))fail();}catch{fail();}return v;}
function number(v){if(!Number.isFinite(v)||v<0)fail();return v;}
function counters(v,pages=false){if(!object(v))fail();const out=Object.create(null);for(const [day,value] of Object.entries(v)){if(!/^\d{4}-\d{2}-\d{2}$/.test(day))fail();if(pages){if(!object(value))fail();const p=Object.create(null);for(const [key,n] of Object.entries(value))p[url(key)]=number(n);out[day]=p;}else out[day]=number(value);}return out;}
function clean(data){
 if(!object(data)||!Array.isArray(data.entries)||!Array.isArray(data.quizzes)||data.entries.length>100000||data.quizzes.length>20000)fail();
 const entries=data.entries.map(e=>{const r=pick(e,'id text title url kind method capturedAt seconds duration language videoCues');text(r.id,200);text(r.text);text(r.title||'',250);url(r.url);date(r.capturedAt);for(const k of ['kind','method','language'])if(r[k]!=null)text(r[k],100);for(const k of ['seconds','duration'])if(r[k]!==undefined)number(r[k]);if(r.videoCues){if(!Array.isArray(r.videoCues)||r.videoCues.length>1000)fail();r.videoCues=r.videoCues.map(c=>{const v=pick(c,'startChar endChar seconds url');number(v.startChar);number(v.endChar);number(v.seconds);url(v.url);return v;});}return r;});
 const quizzes=data.quizzes.map(q=>{const r=pick(q,'id createdAt completedAt label name difficulty originalQuizId attempt sourceQuizIds childQuizIds isCombinedSession legacyAnswerHistory period start end questions answers');text(r.id,200);date(r.createdAt);for(const k of ['completedAt','start','end'])if(r[k])date(r[k]);for(const k of ['label','name','difficulty','originalQuizId','period'])if(r[k]!==undefined)text(r[k],300);if(r.attempt!==undefined)number(r.attempt);for(const k of ['isCombinedSession','legacyAnswerHistory'])if(r[k]!==undefined&&typeof r[k]!=='boolean')fail();for(const k of ['sourceQuizIds','childQuizIds'])if(r[k]){if(!Array.isArray(r[k])||r[k].length>1000)fail();r[k].forEach(id=>text(id,200));}
  if(!Array.isArray(r.questions)||r.questions.length>10000)fail();r.questions=r.questions.map(v=>{const p=pick(v,'id kind prompt options answer acceptedAnswers explanation evidence code sourceId source title review attemptQuizId videoSource sourceKind');for(const k of ['id','prompt','answer'])text(p[k]);if(Object.hasOwn(Object.prototype,p.id)||p.id==='__proto__')fail();for(const k of ['kind','explanation','evidence','code','sourceId','title','attemptQuizId','sourceKind'])if(p[k]!==undefined)text(p[k]);for(const k of ['source','videoSource'])if(p[k]!==undefined)url(p[k]);if(p.review!==undefined&&typeof p.review!=='boolean')fail();for(const k of ['options','acceptedAnswers'])if(p[k]){if(!Array.isArray(p[k])||p[k].length>100)fail();p[k].forEach(v=>text(v));}if(['mcq','boolean'].includes(p.kind)&&!Array.isArray(p.options))fail();return p;});
  if(new Set(r.questions.map(p=>p.id)).size!==r.questions.length)fail();
  if(r.answers!==undefined){if(!object(r.answers))fail();const a=Object.create(null);for(const [id,v] of Object.entries(r.answers)){if(!r.questions.some(q=>q.id===id))fail();const answer=pick(v,'value correct answeredAt');text(answer.value);if(typeof answer.correct!=='boolean')fail();date(answer.answeredAt);a[id]=answer;}r.answers=a;}return r;
 });
 if(new Set(quizzes.map(q=>q.id)).size!==quizzes.length)fail();
 const questionFeedback=Object.create(null);if(data.questionFeedback){if(!object(data.questionFeedback))fail();for(const [key,v] of Object.entries(data.questionFeedback)){text(key,30000);if(!['irrelevant','unclear','incorrect'].includes(v.reason))fail();questionFeedback[key]={reason:v.reason,at:date(v.at)};}}
 if(![0,10,15,30,60].includes(data.interval))fail();
 return {entries,quizzes,interval:data.interval,readingSeconds:counters(data.readingSeconds||{}),pageReadingSeconds:counters(data.pageReadingSeconds||{},true),questionFeedback};
}
function exportBackup(data){return {format:'recall-all-backup',version:1,exportedAt:new Date().toISOString(),data:clean(data)};}
function importBackup(value){if(!object(value)||value.format!=='recall-all-backup'||value.version!==1||JSON.stringify(value).length>MAX)fail();return clean(value.data);}
module.exports={exportBackup,importBackup,MAX};
