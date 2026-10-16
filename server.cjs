const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {cleanEntry, makeQuiz, summarizePages, studyPeriod, periodEntries} = require('./core.cjs');
const quizAI=require('./quiz-ai.cjs');
const providers=require('./providers.cjs');
const scores=require('./scores.cjs');
const history=require('./test-history.cjs');
const quality=require('./question-quality.cjs');
const {shuffleOptions}=require('./shuffle-options.cjs');
const reviewable=q=>quality.acceptableQuestion(q,{url:q.source,text:q.evidence||'',id:q.sourceId,kind:q.sourceKind});
const {VideoTimeline}=require('./video-timeline.cjs');
const backup=require('./backup.cjs');
const PORT = 43127;
const {LocalSpeech}=require('./audio/local-speech.cjs');
const {AudioSession}=require('./audio/session.cjs');
async function startServer(options = {}) {
  const port = options.port ?? PORT;
  const directory = options.directory || path.join(__dirname, 'data');
  fs.mkdirSync(directory, {recursive:true});
  const file = path.join(directory, 'study.json');
  const keyFile=path.join(directory,'personal-ai.json');
  let ai=null,remembered=false,aiError='',connecting=false;
  if(fs.existsSync(keyFile)){try{const stored=JSON.parse(fs.readFileSync(keyFile,'utf8'));ai=providers.config(stored);remembered=true;}catch{aiError='Saved personal settings could not be read. Please reconnect.';}}
  const aiState=()=>({configured:!!ai,provider:ai?.provider||'gemini',model:ai?.model||'',remembered,error:aiError});
  const now=options.now || Date.now;
  const dayKey=()=>new Date(now()).toLocaleDateString('en-CA');
  let saved = {entries:[], quizzes:[], interval:30, readingSeconds:{},pageReadingSeconds:{}};
  if (fs.existsSync(file)) saved = {...saved, ...JSON.parse(fs.readFileSync(file, 'utf8'))};
  const tokenFile = path.join(directory, 'pairing-token');
  const storedToken = fs.existsSync(tokenFile) ? fs.readFileSync(tokenFile,'utf8').trim() : '';
  const token = /^[a-f0-9]{48}$/.test(storedToken) ? storedToken : crypto.randomBytes(24).toString('hex');
  if(token !== storedToken) fs.writeFileSync(tokenFile,token);
  let extensionLastSeen = 0;
  let viewing = false; // Never resume capture merely because the app restarted.
  let epoch = 0;
  let activeSeconds = saved.reminderClock?.date===dayKey()?saved.reminderClock.seconds||0:0;
  let questionReady = !!(saved.interval&&activeSeconds>=saved.interval*60);
  let reminderDay=dayKey(),reminderQuestion=null,reminderError='',reminderPending=false,reminderAttempted=false,reminderVersion=0;
  let dataRevision=0,reminderCursor=0,reminderQuizId=null;
  const persist = () => {
    history.assignNames(saved.quizzes);
    saved.reminderClock={date:dayKey(),seconds:activeSeconds};
    fs.writeFileSync(file + '.tmp', JSON.stringify(saved, null, 2));
    fs.renameSync(file + '.tmp', file);
  };
  const speech=options.speech||new LocalSpeech();
  const videos=new VideoTimeline(now);
  const audio=new AudioSession(speech,entry=>{saved.entries.push(entry);persist();},now,videos);
  const isFlagged=q=>!!saved.questionFeedback?.[scores.key(q)];
  const audioState=()=>({active:!!audio.current,paused:!!audio.current?.paused,version:audio.current?.version||0});
  if(history.assignNames(saved.quizzes))persist();
  function resetReminder(){reminderQuizId=null;activeSeconds=0;questionReady=false;reminderQuestion=null;reminderError='';reminderPending=false;reminderAttempted=false;reminderVersion++;reminderDay=dayKey();}
  function prepareReminder(){
    if(!questionReady||reminderAttempted)return;
    reminderAttempted=true;
    const todayIds=new Set(periodEntries(saved.entries,studyPeriod('today',now())).map(e=>e.id));
    const reusable=saved.quizzes.flatMap(q=>q.questions||[]).filter(q=>todayIds.has(q.sourceId)&&reviewable(q)&&!isFlagged(q));
    if(reusable.length){reminderQuestion=shuffleOptions(reusable[reminderCursor++%reusable.length]);return;}
    if(!ai&&!options.quizGenerator){reminderError='Time to practise. Connect your AI provider in the dashboard to receive a question.';return;}
    const entries=periodEntries(saved.entries,studyPeriod('today',now()));
    if(!entries.length){reminderError='Time to practise, but no study sections have been saved today yet.';return;}
    reminderPending=true;const version=reminderVersion;
    const task=options.quizGenerator?options.quizGenerator(entries.slice(-3),''):quizAI.generate(entries.slice(-3),'',options.aiFetch||fetch,ai);
    Promise.resolve(task).then(questions=>{if(version!==reminderVersion)return;reminderQuestion=questions[0]||null;if(!reminderQuestion)reminderError='No supported question could be generated. Open Practice to try again.';}).catch(error=>{if(version===reminderVersion)reminderError=error.message;}).finally(()=>{if(version===reminderVersion)reminderPending=false;});
  }
  function timedSummaries(entries,range){
    return summarizePages(entries).map(page=>{
      let seconds=0,tracked=false;
      for(const [day,pages] of Object.entries(saved.pageReadingSeconds||{})){
        const date=new Date(day+'T12:00:00');
        if(date>=new Date(range.start)&&date<new Date(range.end)&&Object.hasOwn(pages,page.url)){seconds+=pages[page.url];tracked=true;}
      }
      const audioEntries=entries.filter(e=>e.url===page.url&&e.kind==='audio');
      return {...page,studySeconds:tracked?seconds:null,...(audioEntries.length?{audioSeconds:audioEntries.reduce((n,e)=>n+(e.duration||0),0)}:{})};
    });
  }
  const state = () => ({...saved, viewing, epoch, activeSeconds, questionReady,
    todayReadingSeconds:saved.readingSeconds[dayKey()]||0,
    pageSummaries:summarizePages(saved.entries.filter(e=>new Date(e.capturedAt).toLocaleDateString('en-CA')===dayKey())),
    extensionConnected: Date.now()-extensionLastSeen < 45000, extensionLastSeen});
  const server = http.createServer(async (req,res) => {
    const send = (code, data) => {res.writeHead(code, {'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
    const host = req.headers.host;
    if (!host || !/^127\.0\.0\.1:\d+$/.test(host)) return send(403,{error:'Invalid host'});
    const ownOrigin = 'http://' + host;
    const origin = req.headers.origin;
    const extension = /^chrome-extension:\/\/[a-p]{32}$/.test(origin || '');
    const bridgeRequest = extension || req.headers['x-study-token'] !== undefined;
    if (origin && origin !== ownOrigin && !extension) return send(403,{error:'Origin not allowed'});
    const route = new URL(req.url, ownOrigin).pathname;
    if(route==='/api/connect'){
      const expected=require('./extension-id.json').id;
      if(req.method==='OPTIONS' && origin==='chrome-extension://'+expected){
        res.writeHead(204,{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'X-Recall-Extension','Access-Control-Allow-Methods':'GET'});res.end();return;
      }
      if(req.headers['x-recall-extension']!==expected || (origin && origin!=='chrome-extension://'+expected))return send(403,{error:'Unrecognized extension'});
      if(origin)res.setHeader('Access-Control-Allow-Origin',origin);
      if(req.method!=='GET')return send(405,{error:'GET required'});
      return send(200,{token});
    }
    if (bridgeRequest && !['/api/status','/api/entry','/api/tick','/api/viewing','/api/reminder-dismiss','/api/reminder-answer','/api/question-feedback','/api/audio/control','/api/video-position'].includes(route)) return send(403,{error:'Route not available to extensions'});
    if (extension) {
      res.setHeader('Access-Control-Allow-Origin',origin);
      res.setHeader('Vary','Origin');
      res.setHeader('Access-Control-Allow-Headers','Content-Type, X-Study-Token');
      res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');
    }
    if (req.method === 'OPTIONS') {res.writeHead(204);res.end();return;}
    if (route.startsWith('/api/') && bridgeRequest && req.headers['x-study-token'] !== token) return send(401,{error:'Pair the extension with this app'});
    if (route.startsWith('/api/') && req.method === 'POST' && !bridgeRequest && origin !== ownOrigin) return send(403,{error:'Missing origin'});
    try {
      let body = {};
      if (req.method === 'POST') {
        let raw = '';
        for await (const chunk of req) {raw += chunk; if (raw.length > (route==='/api/backup/restore'||route==='/api/backup/preview'?backup.MAX:route==='/api/audio/chunk'?2800000:25000)) {send(413,{error:'Request too large'});return;}}
        body = JSON.parse(raw || '{}');
      }
      if(req.method==='POST'&&route==='/api/video-position'){videos.update(body);return send(200,{ok:true});}
      if(req.method==='POST'&&route==='/api/audio/control'){if(typeof body.paused!=='boolean')throw Error('Choose pause or resume.');audio.pause(body.paused);return send(200,audioState());}
      if(req.method==='POST'&&route==='/api/question-feedback'){
        const quiz=body.quizId?saved.quizzes.find(q=>q.id===body.quizId):null;
        const q=quiz?.questions.find(q=>q.id===body.questionId)||(!body.quizId&&reminderQuestion?.id===body.questionId?reminderQuestion:null);
        if(!q)throw Error('Question not found.');
        if(!['irrelevant','unclear','incorrect',null].includes(body.reason))throw Error('Choose a feedback reason.');
        saved.questionFeedback ||= {};const key=scores.key(q);
        if(body.reason===null)delete saved.questionFeedback[key];else saved.questionFeedback[key]={reason:body.reason,at:new Date(now()).toISOString()};
        persist();return send(200,{reason:body.reason});
      }
      if(req.method==='GET'&&route==='/api/backup')return send(200,backup.exportBackup(saved));
      if(req.method==='POST'&&['/api/backup/preview','/api/backup/restore'].includes(route)){
        const restored=backup.importBackup(body);
        const counts={sections:restored.entries.length,tests:restored.quizzes.filter(q=>!q.isCombinedSession).length};
        if(route.endsWith('/preview'))return send(200,counts);
        fs.writeFileSync(path.join(directory,'before-restore.json'),JSON.stringify(backup.exportBackup(saved)));
        history.assignNames(restored.quizzes);fs.writeFileSync(file+'.tmp',JSON.stringify(restored,null,2));fs.renameSync(file+'.tmp',file);
        audio.stop();videos.sources.clear();dataRevision++;saved=restored;viewing=false;epoch++;resetReminder();persist();
        return send(200,{...counts,ok:true});
      }
      if(req.method==='GET'&&route==='/api/audio/status')return send(200,{...speech.status(),...audioState(),videos:videos.list()});
      if(req.method==='POST'&&route==='/api/audio/setup'){
        if(audio.current)throw Error('Stop audio before running setup.');
        if(speech.status().settingUp)throw Error('Speech setup is already running.');
        speech.setup().catch(()=>{});return send(200,{settingUp:true});
      }
      if(req.method==='POST'&&route==='/api/audio/start')return send(200,await audio.start(body.title,body.videoKey));
      if(req.method==='POST'&&route==='/api/audio/chunk')return send(200,await audio.chunk(body,ownOrigin));
      if(req.method==='POST'&&route==='/api/audio/stop'){audio.stop(body.id);return send(200,{ok:true});}
      if(req.method==='GET'&&/^\/audio\/[a-f0-9-]{36}$/.test(route)){
        const entries=saved.entries.filter(e=>e.kind==='audio'&&new URL(e.url).pathname===route);
        if(!entries.length)return send(404,{error:'Transcript not found.'});
        res.writeHead(200,{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
        res.end(entries[0].title+'\n\nAutomatic transcript — may contain mistakes.\n\n'+entries.map(e=>new Date(e.capturedAt).toLocaleString()+'\n'+e.text).join('\n\n'));return;
      }
      if (req.method === 'GET' && route === '/api/ai-status') return send(200,aiState());
      if(req.method==='POST' && route==='/api/ai-models')return send(200,{models:await providers.listModels(body,options.aiFetch||fetch)});
      if(req.method==='POST' && route==='/api/ai-connect'){
        if(connecting)return send(409,{error:'A connection test is already running.'});
        connecting=true;
        try{
          const candidate=providers.config(body);
          if(body.remember===true&&body.plaintextConsent!==true)throw Error('Please confirm the plain-text storage checkbox in the refreshed dashboard.');
          await providers.testConnection(candidate,options.aiFetch||fetch);
          if(body.remember===true){
            fs.writeFileSync(keyFile+'.tmp',JSON.stringify(candidate),{mode:0o600});fs.renameSync(keyFile+'.tmp',keyFile);
          }else if(fs.existsSync(keyFile))fs.unlinkSync(keyFile);
          ai=candidate;remembered=body.remember===true;aiError='';dataRevision++;reminderAttempted=false;reminderError='';
          return send(200,aiState());
        }finally{connecting=false;}
      }
      if(req.method==='POST' && route==='/api/ai-disconnect'){
        if(connecting)return send(409,{error:'Wait for the connection test to finish.'});
        if(fs.existsSync(keyFile))fs.unlinkSync(keyFile);
        ai=null;remembered=false;aiError='';dataRevision++;return send(200,aiState());
      }
      if(req.method==='GET'&&route==='/api/scores')return send(200,scores.scoreReport(saved.quizzes,now(),new URL(req.url,ownOrigin).searchParams.get('group')||'daily'));
      if(req.method==='POST'&&route==='/api/answer'){
        const quiz=saved.quizzes.find(q=>q.id===body.quizId);if(!quiz)return send(404,{error:'Test not found.'});
        const question=quiz.questions.find(q=>q.id===body.questionId);
        const target=quiz.isCombinedSession?saved.quizzes.find(q=>q.id===question?.attemptQuizId):quiz;
        if(!target)return send(400,{error:'Attempt not found.'});
        const answer=scores.answerQuiz(target,body.questionId,body.value,now());
        if(quiz.isCombinedSession){quiz.answers[body.questionId]=answer;if(quiz.questions.every(q=>quiz.answers[q.id]))quiz.completedAt=new Date(now()).toISOString();}
        persist();return send(200,{answer,quiz});
      }
      if (req.method === 'GET' && route === '/api/state') return send(200,{...state(),token});
      if (req.method === 'GET' && route === '/api/revision') {
        const range=studyPeriod(new URL(req.url,ownOrigin).searchParams.get('period')||'today',now());
        const entries=periodEntries(saved.entries,range);
        return send(200,{...range,quizOptionsVersion:1,count:entries.length,pageSummaries:timedSummaries(entries,range),topics:summarizePages(entries).map(p=>({id:p.url,title:p.title,url:p.url,sectionCount:p.sectionCount}))});
      }
      if (req.method === 'GET' && route === '/api/status') {
        if(bridgeRequest)extensionLastSeen=Date.now();
        if(reminderDay!==dayKey())resetReminder();
        return send(200,{viewing,epoch,audio:audioState(),todayReadingSeconds:saved.readingSeconds[dayKey()]||0,questionReady,reminderQuestion,reminderError,reminderPending});
      }
      if (req.method === 'POST' && route === '/api/viewing') {
        viewing = body.viewing === true; epoch++;server.lastTick=now();
        return send(200,bridgeRequest?{viewing,epoch}:state());
      }
      if (req.method === 'POST' && route === '/api/settings') {
        if (![0,10,15,30,60].includes(body.interval)) return send(400,{error:'Invalid interval'});
        saved.interval=body.interval; resetReminder(); persist();return send(200,state());
      }
      if (req.method === 'POST' && route === '/api/entry') {
        if (!viewing || body.epoch !== epoch) return send(409,{error:'Viewing paused or session changed'});
        const entry = cleanEntry(body);entry.capturedAt=new Date(now()).toISOString();
        if (!saved.entries.some(e=>e.id===entry.id && new Date(e.capturedAt).toDateString()===new Date(now()).toDateString())) {saved.entries.push(entry);persist();}
        return send(200,{ok:true});
      }
      if (req.method === 'POST' && route === '/api/tick') {
        if (viewing && body.epoch === epoch) {
          // Bound credit by both measured exposure and actual time; never count overlapping tabs twice.
          if(reminderDay!==dayKey())resetReminder();
          const stamp=now();
          const elapsed=Math.max(0,Math.min(2,Number(body.elapsed)||1,(stamp-(server.lastTick??stamp))/1000));
          server.lastTick=stamp;activeSeconds+=elapsed;
          saved.readingSeconds[dayKey()]=(saved.readingSeconds[dayKey()]||0)+elapsed;
          if(body.url){
            try{const page=new URL(body.url);if(['http:','https:'].includes(page.protocol)){page.search='';page.hash='';saved.pageReadingSeconds ||= {};saved.pageReadingSeconds[dayKey()] ||= {};const pages=saved.pageReadingSeconds[dayKey()];pages[page.href]=(pages[page.href]||0)+elapsed;}}catch{}
          }
          if(elapsed>0)persist();
          if (saved.interval && activeSeconds >= saved.interval*60) questionReady=true;
          prepareReminder();
        }
        return send(200,{ok:true});
      }
      if(req.method==='POST'&&route==='/api/reminder-answer'){
        if(!questionReady||!reminderQuestion||body.questionId!==reminderQuestion.id)return send(409,{error:'This reminder has ended. Open the current question.'});
        let quiz=saved.quizzes.find(q=>q.id===reminderQuizId);
        if(!quiz)quiz={id:crypto.randomUUID(),createdAt:new Date(now()).toISOString(),label:'Interval question',difficulty:'medium',questions:[{...reminderQuestion}],answers:{}};
        const answer=scores.answerQuiz(quiz,body.questionId,body.value,now());
        if(!reminderQuizId){saved.quizzes.push(quiz);reminderQuizId=quiz.id;}persist();return send(200,{answer});
      }
      if(req.method==='POST'&&route==='/api/reminder-dismiss'){resetReminder();persist();return send(200,{ok:true});}
      if(req.method==='POST'&&route==='/api/rename-test'){
        const quiz=saved.quizzes.find(q=>q.id===body.quizId);if(!quiz)return send(404,{error:'Test not found.'});
        if(typeof body.name!=='string'||!body.name.trim()||body.name.trim().length>100)return send(400,{error:'Enter a name between 1 and 100 characters.'});
        const root=quiz.originalQuizId||quiz.id;for(const q of saved.quizzes)if((q.originalQuizId||q.id)===root)q.name=body.name.trim();persist();return send(200,{ok:true});
      }
      if(req.method==='POST'&&route==='/api/retake'){
        const {session,records}=history.retakeBatch(saved.quizzes,body.quizIds||[body.quizId],now());saved.quizzes.push(...records);persist();return send(200,session);
      }
      if (req.method === 'POST' && route === '/api/quiz') {
        const range=studyPeriod(body.period||'today',now());
        const difficulty=body.difficulty||'medium';if(!['easy','medium','hard'].includes(difficulty))return send(400,{error:'Choose easy, medium or hard difficulty.'});
        const available=periodEntries(saved.entries,range);
        if(body.topics!==undefined&&(!Array.isArray(body.topics)||body.topics.some(id=>typeof id!=='string'||!available.some(e=>e.url===id))))return send(400,{error:'The topic selection is out of date. Refresh the dashboard.'});
        const selected=body.topics===undefined?available:available.filter(e=>body.topics.includes(e.url));
        if(body.topics!==undefined&&!selected.length&&!body.solution?.trim())return send(400,{error:'Select at least one topic or include your solution.'});
        const revisionAtStart=dataRevision;
        if(!options.quizGenerator&&!ai)return send(400,{error:'Connect your AI provider in Practice before generating questions.'});
        const reviews=scores.missedQuestions(saved.quizzes.map(quiz=>({...quiz,questions:quiz.questions.filter(q=>reviewable(q)&&!isFlagged(q))})),body.topics===undefined?null:new Set(selected.map(e=>e.id).concat(body.solution?.trim()?['user-solution']:[])));
        const questions = options.quizGenerator?await options.quizGenerator(selected,body.solution||''):await quizAI.generateFull(selected,body.solution||'',options.aiFetch||fetch,ai,difficulty,reviews);
        if(dataRevision!==revisionAtStart)return send(409,{error:'Study data changed while generating. Please try again.'});
        if (!questions.length) return send(400,{error:'No supported educational questions were found. Try another period or include your solution.'});
        const reviewKeys=new Set(reviews.map(scores.key));
        const quiz={id:crypto.randomUUID(),createdAt:new Date(now()).toISOString(),...range,difficulty,answers:{},questions:[...questions.filter(q=>!reviewKeys.has(scores.key(q))),...reviews.map(q=>shuffleOptions(q))]};
        saved.quizzes.push(quiz);if(range.period==='today'){resetReminder();}persist();return send(200,quiz);
      }
      if (req.method === 'POST' && route === '/api/forget') {
        audio.stop();dataRevision++;saved.entries=[]; saved.quizzes=[];saved.readingSeconds={};saved.pageReadingSeconds={};saved.questionFeedback={};videos.sources.clear(); viewing=false;epoch++;resetReminder();persist();return send(200,state());
      }
      if (route.startsWith('/api/')) return send(404,{error:'Not found'});
      const assets={'/audio.js':'audio.js','/':'index.html','/app.js':'app.js','/view-models.js':'view-models.js','/style.css':'style.css','/mascot.html':'mascot.html','/mascot.js':'mascot.js','/demo.html':'demo.html'};
      if (req.method !== 'GET' || !assets[route]) return send(404,{error:'Not found'});
      const ext=path.extname(assets[route]);
      res.writeHead(200,{'Content-Type':({'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css'})[ext],
        'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",'Cache-Control':'no-store'});
      fs.createReadStream(path.join(__dirname,'ui',assets[route])).pipe(res);
    } catch(error) {send(400,{error:error.message});}
  });
  server.on('close',()=>audio.stop());
  return new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',()=>resolve({server,token,port:server.address().port,pause:()=>{audio.stop();viewing=false;epoch++;}}));});
}
if(require.main===module) startServer().then(()=>console.log(`Recall-All: http://127.0.0.1:${PORT} — viewing is paused.`)).catch(e=>{console.error(e.message);process.exit(1);});
module.exports={startServer};
