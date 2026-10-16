var retakeSelection=new Set();



var topicExclusions=new Map(),topicSignature='';
var scoreData=null,historyQuiz=null,scoreSignature="";
let state={},currentQuiz=null,revision={pageSummaries:[]};
const $=id=>document.getElementById(id);
let generating=false;
const note=message=>{$('notice').textContent=message;$('notice').hidden=!message;};
async function api(route,body){let response;try{response=await fetch('/api/'+route,body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});}catch{const error=Error('Cannot reach Recall-All. Open startdashboard.cmd and keep its window running.');error.connectionFailure=true;throw error;}const result=await response.json();if(response.status===404&&(route.startsWith('ai-')||['retake','rename-test'].includes(route)))throw Error('The local app is an older version. Close its terminal window, open Start web preview.cmd, then refresh this dashboard.');if(!response.ok)throw Error(result.error);return result;}
const run=fn=>async()=>{try{await fn();}catch(error){note(error.message);}};
function download(name,text,type='text/markdown'){const url=URL.createObjectURL(new Blob([text],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function todayEntries(){return state.entries.filter(e=>new Date(e.capturedAt).toDateString()===new Date().toDateString());}
async function refresh(){
  state=await api('state');
  if(location.hash==='#scores')await refreshScores();
$('dashboardOwl').classList.toggle('covered',!state.viewing);document.body.classList.toggle('paused',!state.viewing);
  $('viewing').textContent=!state.extensionConnected?'EXTENSION NOT CONNECTED':state.viewing?'VIEWING ENABLED':'VIEWING PAUSED';
  $('sessionHeading').textContent=!state.extensionConnected?'Let’s connect your browser.':state.viewing?'A little focus goes a long way.':'Ready when you are.';
  $('sessionText').textContent=!state.extensionConnected?'Open an ordinary webpage in Chrome/Edge and choose an allow option on the owl. Keep this app running.':state.viewing?'Extension connected. Keep an approved page focused while reading.':'Extension connected. No new reading is being collected.';
  $('toggle').textContent=state.viewing?'Pause viewing':'Start viewing';
  const seconds=Math.floor(state.todayReadingSeconds||0);
  $('count').textContent=todayEntries().length;$('minutes').textContent=Math.floor(seconds/60)+'m '+String(seconds%60).padStart(2,'0')+'s';
  $('interval').value=state.interval;
  if(state.questionReady&&!generating&&location.hash!=='#practice')note('Time for a little practice. Choose “Generate practice now” when you’re ready.');
  const period=$('period').value;
  const result=await api('revision?period='+encodeURIComponent(period));
  if($('period').value!==period)return;
  result.topics=RecallViews.topicsFor(result);revision=result;renderTopics(result);
  $('periodInfo').textContent=result.label+' · '+result.count+' saved sections. Practice and saved notes use this selection.';
  const entries=revision.pageSummaries||[];const signature=JSON.stringify(entries);
  if($('entries').dataset.signature!==signature){
    $('entries').dataset.signature=signature;
    if(entries.length){$('entries').replaceChildren();for(const entry of entries.slice().reverse()){
      const article=document.createElement('article');article.className='entry';
      const heading=document.createElement('h3');const link=document.createElement('a');link.href=entry.url;link.target='_blank';link.rel='noreferrer';link.textContent=entry.title;heading.append(link);
      const p=document.createElement('p');p.textContent=entry.summary;
      const small=document.createElement('small');small.textContent=entry.sectionCount+' sections · '+(entry.audioSeconds!==undefined?studyTime(entry.audioSeconds).replace('studied','of transcribed audio')+' · automatic transcript':studyTime(entry.studySeconds)+' · local summary · '+new URL(entry.url).hostname);
      article.append(heading,p,small);$('entries').append(article);
    }}else{$('entries').textContent='No saved reading in this period. Choose another period, or allow a site and read while viewing is enabled.';}
  }
}
$('period').onchange=run(async()=>{currentQuiz=null;$('questions').replaceChildren();$('saveQuiz').hidden=true;$('doneQuiz').hidden=true;$('quizPeriod').textContent='';note('');await refresh();});
$('date').textContent=new Date().toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric'});
$('toggle').onclick=run(async()=>{await api('viewing',{viewing:!state.viewing});await refresh();});
$('interval').onchange=run(async()=>{await api('settings',{interval:Number($('interval').value)});note('Question interval updated.');await refresh();});
$('forget').onclick=run(async()=>{if(!confirm('Delete all captured sections and saved practice quizzes? This cannot be undone.'))return;await api('forget',{});window.dispatchEvent(new Event('study-data-deleted'));currentQuiz=null;$('questions').replaceChildren();$('saveQuiz').hidden=true;note('Study data deleted. Viewing is paused.');await refresh();});

const normalizeAnswer=value=>String(value).normalize('NFKC').trim().toLowerCase().replace(/\s+/g,' ');
function renderQuiz(target='questions',quiz=currentQuiz,readOnly=false){
 if(target==='questions')$('doneQuiz').hidden=false;
 const container=$(target);container.replaceChildren();
 for(const [index,q] of quiz.questions.entries()){
  const card=document.createElement('article');card.className='question';
  const heading=document.createElement('p');heading.textContent=(index+1)+'. '+(q.review?'Review a previous mistake · ':'')+q.prompt;card.append(heading);
  if(q.code){const code=document.createElement('pre');code.textContent=q.code;card.append(code);}
  const saved=quiz.answers?.[q.id];
  const feedback=document.createElement('p');feedback.className='feedback';feedback.setAttribute('role','status');
  const details=document.createElement('details'),summary=document.createElement('summary'),explanation=document.createElement('p');
  summary.textContent='Explanation and evidence';explanation.textContent=q.explanation;
  const evidence=document.createElement('blockquote');evidence.textContent=q.evidence||'';details.append(summary,explanation,evidence);details.open=!!saved||readOnly;
  const submit=async value=>{
   const controls=[...card.querySelectorAll('button,input')];controls.forEach(el=>el.disabled=true);feedback.textContent='Saving your answer…';
   try{const result=await api('answer',{quizId:quiz.id,questionId:q.id,value});quiz.answers=result.quiz.answers;quiz.completedAt=result.quiz.completedAt;quiz.legacyAnswerHistory=result.quiz.legacyAnswerHistory;const stored=(state.quizzes||[]).find(q=>q.id===quiz.id);if(stored)Object.assign(stored,result.quiz);renderQuiz(target,quiz,readOnly);await refreshScores();}
   catch(error){feedback.textContent='Answer not saved. '+error.message+' Submit it again when connected.';feedback.className='feedback incorrect';note(error.message);controls.forEach(el=>el.disabled=false);}
  };
  if(q.kind==='mcq'||q.kind==='boolean'){
   const answers=document.createElement('div');answers.className='answers';
   for(const [n,option] of q.options.entries()){
    const button=document.createElement('button');button.type='button';button.textContent=(q.kind==='mcq'?String.fromCharCode(65+n)+'. ':'')+option;button.disabled=!!saved||readOnly;
    if(saved||readOnly){if(normalizeAnswer(option)===normalizeAnswer(q.answer))button.classList.add('correct');if(saved&&normalizeAnswer(option)===normalizeAnswer(saved.value)&&!saved.correct)button.classList.add('incorrect');}
    button.onclick=()=>submit(option);answers.append(button);
   }card.append(answers);
  }else{
   const form=document.createElement('form'),input=document.createElement('input'),check=document.createElement('button');input.placeholder='Your answer';input.setAttribute('aria-label','Answer to question '+(index+1));input.required=true;input.dataset.questionId=q.id;input.value=saved?.value||'';input.disabled=!!saved||readOnly;check.textContent='Submit answer';check.type='submit';check.disabled=!!saved||readOnly;
   form.onsubmit=event=>{event.preventDefault();if(input.value.trim())submit(input.value);};form.append(input,check);card.append(form);
  }
  feedback.textContent=saved?(saved.correct?'Correct · saved. ':'Incorrect · saved. ')+'Your answer: '+saved.value:(readOnly?(quiz.legacyAnswerHistory||!Object.hasOwn(quiz,'answers')?'No saved answer; earlier answers were not recorded.':'Not answered.'):'Your first submitted answer is saved for your score.');
  if(saved)feedback.classList.add(saved.correct?'correct':'incorrect');card.append(feedback);if(saved||readOnly){const answerBar=document.createElement('p');answerBar.className='correct-answer-bar';answerBar.textContent='Correct answer: '+q.answer;card.append(answerBar);}card.append(details);
  if(q.source){const source=document.createElement('a');source.href=q.source;source.target='_blank';source.rel='noreferrer';source.textContent='Source: '+q.title;card.append(source);}else{const source=document.createElement('small');source.textContent='Source: Your included solution';card.append(source);}
  if(q.videoSource){const video=document.createElement('a');video.href=q.videoSource;video.target='_blank';video.rel='noreferrer';video.textContent=' ↗ Revisit this moment in the video';card.append(video);}
  if(target!=='printQuestions'){
   const report=document.createElement('label');report.className='question-report';report.textContent='Question feedback ';
   const select=document.createElement('select');select.setAttribute('aria-label','Feedback on question '+(index+1));
   const feedbackKey=JSON.stringify([q.sourceId||q.source||'',normalizeAnswer(q.prompt),normalizeAnswer(q.answer)]);
   for(const [value,label] of [['','No issue / clear report'],['irrelevant','Irrelevant'],['unclear','Unclear'],['incorrect','Incorrect']])select.append(new Option(label,value));
   select.value=state.questionFeedback?.[feedbackKey]?.reason||'';const status=document.createElement('small');status.setAttribute('role','status');if(select.value)status.textContent='Excluded from automatic mistake review.';
   select.onchange=async()=>{select.disabled=true;try{await api('question-feedback',{quizId:quiz.id,questionId:q.id,reason:select.value||null});state.questionFeedback ||= {};if(select.value)state.questionFeedback[feedbackKey]={reason:select.value};else delete state.questionFeedback[feedbackKey];status.textContent=select.value?'Saved. Excluded from automatic mistake review.':'Report cleared.';}catch(error){status.textContent=error.message;}finally{select.disabled=false;}};
   report.append(select,status);card.append(report);
  }
  container.append(card);
 }
}
$('quiz').onclick=run(async()=>{
 if(generating)return;if(revision.quizOptionsVersion!==1){note('Close the running dashboard command window, then open startdashboard.cmd again. The older server cannot apply topic selections.');return;}generating=true;$('quiz').disabled=true;$('period').disabled=true;$('quiz').textContent='Creating questions…';note('Your AI provider is reviewing the selected material. This may take a few minutes.');
 try{const period=$('period').value;currentQuiz=await api('quiz',{period,difficulty:$('difficulty').value,topics:(revision.topics||[]).filter(t=>!(topicExclusions.get(period)||new Set()).has(t.id)).map(t=>t.id)});$('quizPeriod').textContent='Practice: '+currentQuiz.label;renderQuiz();$('saveQuiz').hidden=false;note('Practice ready. Choose an option or type an answer to check it. AI answers should be reviewed against the evidence.');location.hash='practice';requestAnimationFrame(()=>requestAnimationFrame(()=>$('questions').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'}))); }
 finally{generating=false;$('quiz').disabled=false;$('period').disabled=false;$('quiz').textContent='Generate practice now';}
});
$('saveQuiz').onclick=()=>{if(!currentQuiz)return;download('recall-all-practice.md','# Recall-All practice\n\nPeriod: '+currentQuiz.label+'\n\n'+currentQuiz.questions.map((q,i)=>(i+1)+'. '+q.prompt+(q.code?'\n\n'+q.code:'')+(q.options?.length?'\n'+q.options.map((v,j)=>String.fromCharCode(65+j)+'. '+v).join('\n'):'')).join('\n\n')+'\n\n## Answer key\n\n'+currentQuiz.questions.map((q,i)=>(i+1)+'. '+q.answer+'\n\n'+q.explanation+'\n\nSource: '+(q.source||'Your included solution')).join('\n\n'));};
function showAI(result){$('aiStatus').textContent=result.error||(result.configured?'Connected: '+result.provider+' / '+result.model+'. '+(result.remembered?'Key saved in your private local file (plain text).':'Session only: reconnect after closing the local app.'):'No provider connected. Paste your key above.');$('removeKey').disabled=!result.configured;}
$('aiProvider').onchange=()=>{$('availableModels').replaceChildren(new Option('Load models using your key first',''));$('apiKey').value='';$('aiConsent').checked=false;$('aiModel').value='';$('aiModel').placeholder='Model ID from your provider';};
$('aiForm').onsubmit=async event=>{event.preventDefault();$('checkAI').disabled=true;$('removeKey').disabled=true;$('aiStatus').textContent='Checking key and model access without generating a test question…';
 try{const result=await api('ai-connect',{provider:$('aiProvider').value,model:$('aiModel').value.trim(),apiKey:$('apiKey').value.trim(),remember:$('rememberKey').checked,plaintextConsent:$('rememberKey').checked,consent:$('aiConsent').checked});$('apiKey').value='';showAI(result);note('AI connected. You can now generate practice questions.');}
 catch(error){$('aiStatus').textContent=error.message;$('removeKey').disabled=false;}
 finally{$('checkAI').disabled=false;}
};
$('removeKey').onclick=run(async()=>{showAI(await api('ai-disconnect',{}));$('apiKey').value='';$('aiConsent').checked=false;});
api('ai-status').then(result=>{showAI(result);$('aiProvider').value=result.provider;$('aiModel').value=result.model;$('aiConsent').checked=result.configured;$('rememberKey').checked=result.configured?result.remembered:false;}).catch(e=>{$('aiStatus').textContent=e.message;});
$('summary').onclick=()=>{const entries=revision.pageSummaries||[];if(!entries.length){note('There are no reading sections to export yet.');return;}download('recall-all-reading-notes.md','# Reading notes — '+revision.label+'\n\nConcise local summaries using selected source sentences.\n\n'+entries.map(e=>`## ${e.title}\n\nSource: ${e.url}\n\nStudy time: ${studyTime(e.studySeconds)}\n\n${e.summary}`).join('\n\n'));};
let refreshErrorMessage='';
async function refreshDashboard(){try{await refresh();if(refreshErrorMessage&&$('notice').textContent===refreshErrorMessage)note('');refreshErrorMessage='';}catch(error){refreshErrorMessage=error.connectionFailure?error.message:'Dashboard could not refresh: '+error.message;note(refreshErrorMessage);}}
refreshDashboard();setInterval(refreshDashboard,2000);

$('revisionBar').append(document.querySelector('.revision-controls'));
function navigate(){const page=['overview','library','practice','scores','setup'].includes(location.hash.slice(1))?location.hash.slice(1):'overview';for(const id of ['overview','library','practice','scores','setup'])$(id).hidden=id!==page;$('revisionBar').hidden=!['library','practice'].includes(page);for(const link of document.querySelectorAll('nav a')){if(link.hash==='#'+page)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');}window.scrollTo(0,0);if(page==='scores')refreshScores().catch(e=>note(e.message));}
addEventListener('hashchange',navigate);navigate();

$('availableModels').onchange=()=>{if($('availableModels').value)$('aiModel').value=$('availableModels').value;};
$('loadModels').onclick=async()=>{
 const provider=$('aiProvider').value;const apiKey=$('apiKey').value.trim();$('loadModels').disabled=true;$('aiStatus').textContent='Loading available models…';
 try{const result=await api('ai-models',{provider,apiKey});if(provider!==$('aiProvider').value||apiKey!==$('apiKey').value.trim())return;
 $('availableModels').replaceChildren(new Option('Choose a model',''));for(const model of result.models)$('availableModels').append(new Option(model.name+' — '+model.id,model.id));
 $('aiStatus').textContent=result.models.length?'Choose a model from the list, then Connect & test key. Availability does not guarantee free quota.':'No generation models were returned for this provider.';
 }catch(error){$('aiStatus').textContent=error.message;}finally{$('loadModels').disabled=false;}
};


function dateLabel(value){return new Date(value).toLocaleDateString(undefined,{month:'short',day:'numeric'});}
async function refreshScores(){
 const group=$('scoreGroup').value;const report=await api('scores?group='+group);if(group!==$('scoreGroup').value)return;
 const signature=JSON.stringify(report);scoreData=report;if(signature===scoreSignature)return;
 $('scoreSummary').textContent=report.total?report.percentage+'% correct · '+report.correct+' of '+report.total+' answers':'No answers recorded in the last 30 days.';
 const chart=$('scoreChart');chart.replaceChildren();
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 900 240');svg.setAttribute('role','img');svg.setAttribute('aria-label','Accuracy by '+group+'. Empty periods have no answers.');
 const part=(tag,attributes,text)=>{const node=document.createElementNS(svg.namespaceURI,tag);for(const [k,v] of Object.entries(attributes))node.setAttribute(k,v);if(text!==undefined)node.textContent=text;svg.append(node);return node;};
 for(const value of [0,50,100]){const y=190-value*1.5;part('line',{x1:45,x2:890,y1:y,y2:y,stroke:'#d7dece'});part('text',{x:4,y:y+4,'font-size':12,fill:'#52634b'},value+'%');}
 const width=840/report.buckets.length;
 report.buckets.forEach((b,i)=>{const x=48+i*width;const height=b.percentage===null?0:b.percentage*1.5;const label=dateLabel(b.start)+(group==='weekly'?' – '+dateLabel(new Date(new Date(b.end)-1)):'');
 const bar=part('rect',{x,y:190-Math.max(height,2),width:Math.max(2,width-6),height:Math.max(height,2),fill:b.total?'#315842':'#cbd2c4',tabindex:0});const title=document.createElementNS(svg.namespaceURI,'title');title.textContent=label+': '+(b.total?b.percentage+'% ('+b.correct+'/'+b.total+')':'No answers');bar.append(title);bar.setAttribute('aria-label',title.textContent);
 if(group==='weekly'||i%5===0)part('text',{x,y:214,'font-size':11,fill:'#52634b'},label);
 });chart.append(svg);
 const table=document.createElement('details'),summary=document.createElement('summary');summary.textContent='View exact counts';table.append(summary);for(const b of report.buckets){const row=document.createElement('p');row.textContent=dateLabel(b.start)+' – '+dateLabel(new Date(new Date(b.end)-1))+': '+(b.total?b.correct+'/'+b.total+' correct ('+b.percentage+'%)':'No answers');table.append(row);}chart.append(table);
 $('testHistory').replaceChildren();
 const groups=RecallViews.historyGroups(report.history,state.quizzes?.length?state.quizzes:report.history);
 if(!groups.length)$('testHistory').textContent='Your tests will appear here.';
 else{const table=document.createElement('table');table.className='history-table';const head=document.createElement('thead'),heading=document.createElement('tr');for(const label of ['Date','Time','Name','Attempts','Latest score','Retake']){const cell=document.createElement('th');cell.scope='col';cell.textContent=label;heading.append(cell);}head.append(heading);table.append(head);const body=document.createElement('tbody');
 for(const group of groups){const row=document.createElement('tr');const date=new Date(group.original.createdAt);
 const values=[date.toLocaleDateString(),date.toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'}),group.name,String(group.attempts.length),group.score,''];
 for(const [i,value] of values.entries()){const cell=document.createElement('td');
 if(i===0||i===2){const button=document.createElement('button');button.textContent=value;button.setAttribute('aria-label',i===0?'Open test from '+date.toLocaleString():'Rename '+value);button.onclick=i===0?()=>openHistory(group.latest):run(async()=>{const name=prompt('Rename this test (up to 100 characters):',group.name);if(name===null)return;await api('rename-test',{quizId:group.latest.id,name});scoreSignature='';await refresh();});cell.append(button);}
 else if(i===5){const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.checked=retakeSelection.has(group.id);checkbox.setAttribute('aria-label','Retake '+(group.name));checkbox.onchange=()=>{if(checkbox.checked)retakeSelection.add(group.id);else retakeSelection.delete(group.id);$('retakeSelected').disabled=!retakeSelection.size;};cell.append(checkbox);}
 else cell.textContent=value;row.append(cell);}body.append(row);}table.append(body);$('testHistory').append(table);}
 const visibleIds=new Set(groups.map(g=>g.id));for(const id of retakeSelection)if(!visibleIds.has(id))retakeSelection.delete(id);$('retakeSelected').disabled=!retakeSelection.size;
 scoreSignature=signature;
 if(historyQuiz){const updated=groups.flatMap(g=>g.attempts).find(q=>q.id===historyQuiz.id);if(updated)openHistory(updated,false);else{$('historyReview').hidden=true;historyQuiz=null;}}
}
function openHistory(quiz,scroll=true){historyQuiz=quiz;const attempts=(RecallViews.historyGroups(scoreData?.history||[],state.quizzes||[]).find(g=>g.id===(quiz.originalQuizId||quiz.id))?.attempts||[quiz]);$('historyAttempt').replaceChildren();for(const [i,attempt] of attempts.entries())$('historyAttempt').append(new Option('Attempt '+(attempt.attempt||i+1)+' · '+new Date(attempt.createdAt).toLocaleString(),attempt.id));$('historyAttempt').value=quiz.id;$('historyReview').hidden=false;$('historyTitle').textContent=(quiz.label||'Practice')+' · Attempt '+(quiz.attempt||1)+' · '+new Date(quiz.createdAt).toLocaleString();renderQuiz('historyQuestions',quiz,true);$('resumeTest').hidden=quiz.questions.every(q=>quiz.answers?.[q.id]);if(scroll)$('historyReview').scrollIntoView({behavior:'smooth',block:'start'});}
$('historyAttempt').onchange=()=>{const quiz=RecallViews.historyGroups(scoreData?.history||[],state.quizzes||[]).flatMap(g=>g.attempts).find(q=>q.id===$('historyAttempt').value);if(quiz)openHistory(quiz,false);};
$('scoreGroup').onchange=run(refreshScores);
$('resumeTest').onclick=()=>{if(!historyQuiz)return;currentQuiz=historyQuiz;renderQuiz();$('quizPeriod').textContent='Practice: '+currentQuiz.label;$('saveQuiz').hidden=false;location.hash='practice';};
$('printTest').onclick=()=>{if(!historyQuiz)return;const root=$('printRoot');root.replaceChildren();const title=document.createElement('h1');title.textContent='Recall-All practice';const metadata=document.createElement('p');const answers=Object.values(historyQuiz.answers||{});metadata.textContent=new Date(historyQuiz.createdAt).toLocaleString()+' · '+(historyQuiz.label||'Practice')+' · '+(historyQuiz.difficulty||'Unspecified difficulty')+' · '+answers.filter(a=>a.correct).length+'/'+answers.length+' submitted answers correct';root.append(title,metadata);const questions=document.createElement('div');questions.id='printQuestions';root.append(questions);renderQuiz('printQuestions',historyQuiz,true);window.print();};

function studyTime(seconds){if(seconds===null||seconds===undefined)return 'Page time not recorded';const n=Math.floor(seconds);return Math.floor(n/60)+'m '+String(n%60).padStart(2,'0')+'s studied';}
function renderTopics(result){
 const signature=JSON.stringify([result.period,result.topics]);if(signature===topicSignature)return;topicSignature=signature;
 const excluded=topicExclusions.get(result.period)||new Set();topicExclusions.set(result.period,excluded);
 $('topicRows').replaceChildren();
 const updateCount=()=>{$('topicCount').textContent=(result.topics||[]).filter(t=>!excluded.has(t.id)).length+' of '+(result.topics||[]).length+' topics selected';};
 for(const topic of result.topics||[]){
  const row=document.createElement('tr'),checkCell=document.createElement('td'),titleCell=document.createElement('td'),count=document.createElement('td');
  const check=document.createElement('input');check.type='checkbox';check.checked=!excluded.has(topic.id);check.setAttribute('aria-label','Include '+topic.title);check.onchange=()=>{if(check.checked)excluded.delete(topic.id);else excluded.add(topic.id);updateCount();};
  const label=document.createElement('a');label.href=topic.url;label.target='_blank';label.rel='noreferrer';label.textContent=topic.title;checkCell.append(check);titleCell.append(label);count.textContent=topic.sectionCount;row.append(checkCell,titleCell,count);$('topicRows').append(row);
 }updateCount();if(!result.topics.length)$('topicCount').textContent='No saved reading for '+result.label+'. Start viewing and read a page, or choose another study period.';if(result.quizOptionsVersion!==1)$('topicCount').textContent+=' Restart the dashboard command window to enable topic filtering.';
}
$('retakeTest').onclick=run(async()=>{
 if(!historyQuiz)return;const button=$('retakeTest');button.disabled=true;
 try{currentQuiz=await api('retake',{quizId:historyQuiz.id});renderQuiz();$('quizPeriod').textContent='Retake · Attempt '+currentQuiz.attempt+' · '+currentQuiz.label;$('saveQuiz').hidden=false;location.hash='practice';note('New attempt started. Your previous answers and score are preserved. No AI request was used.');await refresh();}
 finally{button.disabled=false;}
});

$('retakeSelected').onclick=run(async()=>{
 const groups=RecallViews.historyGroups(scoreData?.history||[],state.quizzes||[]);const ids=groups.filter(g=>retakeSelection.has(g.id)).map(g=>g.latest.id);if(!ids.length){note('Select at least one test.');return;}
 $('retakeSelected').disabled=true;$('retakeSelected').textContent='Opening retake…';
 try{currentQuiz=await api('retake',{quizIds:ids});retakeSelection.clear();renderQuiz();$('quizPeriod').textContent=(currentQuiz.name||'Retake')+' · '+currentQuiz.questions.length+' shuffled questions';$('saveQuiz').hidden=false;location.hash='practice';note('Shuffled retake ready. Previous scores are preserved.');await refresh();$('questions').scrollIntoView({block:'start'});}catch(error){note(error.message);$('notice').scrollIntoView({block:'center'});}finally{$('retakeSelected').textContent='Retake selected';$('retakeSelected').disabled=!retakeSelection.size;}
});

$('doneQuiz').onclick=run(async()=>{
 if(!currentQuiz)return;const button=$('doneQuiz');button.disabled=true;button.textContent='Saving…';
 try{
  const drafts=[...$('questions').querySelectorAll('input[data-question-id]')].filter(input=>!input.disabled&&input.value.trim()).map(input=>({questionId:input.dataset.questionId,value:input.value}));
  for(const draft of drafts)await api('answer',{quizId:currentQuiz.id,...draft});
  await refresh();currentQuiz=null;$('questions').replaceChildren();$('quizPeriod').textContent='';$('saveQuiz').hidden=true;button.hidden=true;location.hash='scores';note('Test saved and closed. Unanswered questions remain available to resume from Scores.');
 }catch(error){note('Could not finish saving. Your test is still open. '+error.message);}
 finally{button.disabled=false;button.textContent='Done — save and close';}
});

// Portable study backups intentionally exclude provider credentials and pairing tokens.
const backupPanel=document.createElement('div');backupPanel.className='pending';
backupPanel.innerHTML='<h2>Backup and restore</h2><p>Save your reading, transcripts, tests, scores and question reports. API keys and website permissions are not included.</p><button id="downloadBackup">Download backup</button><p><label for="restoreFile">Restore from a Recall-All JSON backup</label><input id="restoreFile" type="file" accept=".json,application/json"></p><p id="restoreStatus" role="status"></p><button id="restoreBackup" disabled>Restore this backup</button>';
$('setup').append(backupPanel);let pendingBackup=null;
$('downloadBackup').onclick=run(async()=>download('recall-all-backup-'+new Date().toISOString().slice(0,10)+'.json',JSON.stringify(await api('backup'),null,2),'application/json'));
$('restoreFile').onchange=async()=>{pendingBackup=null;$('restoreBackup').disabled=true;const file=$('restoreFile').files[0];if(!file)return;try{if(file.size>20*1024*1024)throw Error('Backup must be smaller than 20 MB.');const value=JSON.parse(await file.text());const counts=await api('backup/preview',value);pendingBackup=value;$('restoreStatus').textContent=counts.sections+' saved sections and '+counts.tests+' tests. Restoring replaces current study history. Your API connection stays on this computer.';$('restoreBackup').disabled=false;}catch(error){$('restoreStatus').textContent=error.message;}};
$('restoreBackup').onclick=async()=>{if(!pendingBackup||!confirm('Replace current study history with this backup? A recovery copy of current history will be saved as data/before-restore.json. Capture will stop.'))return;$('restoreBackup').disabled=true;try{await api('backup/restore',pendingBackup);window.dispatchEvent(new Event('study-data-deleted'));pendingBackup=null;currentQuiz=null;historyQuiz=null;scoreSignature='';topicSignature='';topicExclusions.clear();retakeSelection.clear();$('questions').replaceChildren();$('saveQuiz').hidden=true;$('doneQuiz').hidden=true;await refresh();$('restoreStatus').textContent='Backup restored. Viewing and audio are stopped. Your API settings were kept.';}catch(error){$('restoreStatus').textContent=error.message;$('restoreBackup').disabled=false;}};
