const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const backup=require('../backup.cjs'),{VideoTimeline,questionVideo}=require('../video-timeline.cjs'),{AudioSession}=require('../audio/session.cjs'),{startServer}=require('../server.cjs');
const url='https://www.youtube.com/watch?v=abcdefghijk';
const data=()=>({entries:[{id:'e',title:'Stacks',text:'A stack removes the most recently added item first.',url:'https://example.com',capturedAt:new Date().toISOString()}],quizzes:[{id:'quiz',createdAt:new Date().toISOString(),questions:[{id:'q',kind:'short',prompt:'Which structure follows last in first out?',answer:'stack',sourceId:'e',source:'https://example.com',evidence:'A stack removes the most recently added item first.'}],answers:{q:{value:'queue',correct:false,answeredAt:new Date().toISOString()}}}],interval:10,readingSeconds:{'2026-10-15':90},pageReadingSeconds:{'2026-10-15':{'https://example.com/':90}}});
test('backup round trips study records and scores but never exports connection secrets',()=>{
 const original=data();Object.assign(original,{apiKey:'secret',token:'pairing',personalAI:{apiKey:'private'}});original.quizzes[0].questions[0].apiKey='nested-secret';
 const exported=backup.exportBackup(original),restored=backup.importBackup(JSON.parse(JSON.stringify(exported)));
 assert(!JSON.stringify(exported).includes('secret'));assert(!JSON.stringify(exported).includes('pairing'));assert.equal(restored.quizzes[0].answers.q.correct,false);assert.equal(restored.readingSeconds['2026-10-15'],90);
 assert.throws(()=>backup.importBackup({...exported,version:9}),/Invalid/);
 const bad=structuredClone(exported);bad.data.quizzes[0].questions[0].source='javascript:alert(1)';assert.throws(()=>backup.importBackup(bad),/Invalid/);
 const wrong=structuredClone(exported);wrong.data.quizzes[0].answers.missing=wrong.data.quizzes[0].answers.q;assert.throws(()=>backup.importBackup(wrong),/Invalid/);
});
test('video timeline uses actual playback positions, speed and seeks, and omits stale or paused positions',()=>{
 let now=10000;const timeline=new VideoTimeline(()=>now),base={url,key:'tab',title:'Lecture',seconds:70,rate:2,paused:false};timeline.update(base);
 assert.equal(timeline.at('tab',11000).seconds,72);assert.equal(timeline.at('tab',16000),null);
 now=12000;timeline.update({...base,seconds:200,rate:1});assert.equal(timeline.at('tab',13000).seconds,201);
 timeline.update({...base,paused:true});assert.equal(timeline.at('tab',12000),null);
 const source={text:'The stack is last in first out.',videoCues:[{startChar:0,endChar:30,url,seconds:72}]};assert.equal(questionVideo(source,'stack is last'),url+'&t=72s');assert.equal(questionVideo(source,'invented'),undefined);
 now+=11000;assert.deepEqual(timeline.list(),[]);
});
test('audio pause discards in-flight speech and resumes with a new segment version',async()=>{
 let resolve,now=10000;const saved=[],speech={start:async()=>{},stop(){},transcribe:()=>new Promise(r=>resolve=r)},video=new VideoTimeline(()=>now);video.update({key:'tab',url,title:'Lecture',seconds:70,rate:1,paused:false});
 const audio=new AudioSession(speech,e=>saved.push(e),()=>now,video);const s=await audio.start('', 'tab');const pending=audio.chunk({...s,sequence:0,audio:'YQ==',duration:1,startedAt:10000},'http://127.0.0.1:43127');audio.pause(true);resolve({segments:[{text:'A stack removes the most recently added item first.',start:0}]});assert.equal((await pending).saved,false);assert.equal(saved.length,0);
 audio.pause(false);speech.transcribe=async()=>({segments:[{text:'A stack removes the most recently added item first.',start:0}]});
 const old=await audio.chunk({...s,sequence:1,audio:'YQ==',duration:1},'');assert.equal(old.saved,false);
 now=11000;await audio.chunk({...s,version:2,sequence:2,audio:'YQ==',duration:1,startedAt:10000},'http://127.0.0.1:43127');assert.equal(saved[0].videoCues[0].seconds,70);assert.equal(saved[0].title,'Lecture');
});
test('feedback excludes mistake reviews; restore preserves credentials, stops capture, and rejects invalid data atomically',async t=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'recall-features-'));fs.writeFileSync(path.join(directory,'study.json'),JSON.stringify(data()));fs.writeFileSync(path.join(directory,'personal-ai.json'),'{}');
 const speech={status:()=>({installed:true}),start:async()=>{},stop(){}};
 const app=await startServer({port:0,directory,speech,quizGenerator:async()=>[{id:'new',prompt:'New conceptual question',answer:'yes',sourceId:'e',source:'https://example.com'}]});t.after(()=>{app.server.close();fs.rmSync(directory,{recursive:true,force:true});});
 const base='http://127.0.0.1:'+app.port,call=async(route,body,headers={})=>fetch(base+'/api/'+route,{method:body===undefined?'GET':'POST',headers:{Origin:base,'Content-Type':'application/json',...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
 assert.equal((await call('question-feedback',{quizId:'quiz',questionId:'q',reason:'irrelevant'})).status,200);
 const quiz=await (await call('quiz',{})).json();assert.equal(quiz.questions.length,1);assert(!quiz.questions.some(q=>q.review));
 const exported=await (await call('backup')).json();assert.equal(Object.values(exported.data.questionFeedback)[0].reason,'irrelevant');
 assert.equal((await call('backup',undefined,{'X-Study-Token':app.token})).status,403);
 const invalid=structuredClone(exported);invalid.data.entries[0].url='javascript:bad';assert.equal((await call('backup/restore',invalid)).status,400);
 assert.equal((await (await call('state')).json()).quizzes.length,2);
 await call('viewing',{viewing:true});await call('audio/start',{});await call('audio/control',{paused:true});assert.equal((await (await call('status')).json()).audio.paused,true);
 assert.equal((await call('backup/restore',exported)).status,200);const state=await (await call('state')).json();assert.equal(state.viewing,false);assert.equal((await (await call('status')).json()).audio.active,false);
 assert.equal(fs.readFileSync(path.join(directory,'personal-ai.json'),'utf8'),'{}');assert.equal(fs.existsSync(path.join(directory,'before-restore.json')),true);
 assert.equal(state.quizzes[0].answers.q.value,'queue');
});
