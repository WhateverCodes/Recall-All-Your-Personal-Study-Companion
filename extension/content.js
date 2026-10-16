(() => {
  if(globalThis.__studyOwl) return;
  globalThis.__studyOwl=true;
  document.getElementById('recall-all-companion')?.remove();
  let records=new Map(), sent=new Set(), lastAt=performance.now(), lastScrollAt=0;
  let speed=0, lastInput=Date.now(), epoch=-1, busy=false, page=location.href;
  const scrollPositions=new WeakMap();
  let diagnostic={phase:'Waiting for connection',visibleSections:0,savedSections:0};
  let extensionInvalid=false;
  function connectionError(error){
    if(/context invalidated/i.test(error.message)){extensionInvalid=true;reminderState=null;reminderUpdate++;actionError='Recall-All was reloaded. Refresh this webpage to reconnect the owl.';}
    return extensionInvalid?actionError:error.message;
  }
  let enabled=false, connected=false, widget=null, decision='ask', choosing=true, choosingOverride=false, actionError='';
  let audioState={active:false,paused:false};
  let permissionLoaded=false,minimized=true,position=null,todaySeconds=0,reminderState=null,reminderUpdate=0,dismissingReminder=false;
  function renderReminder(){
    if(!widget)return;
    const due=reminderState?.questionReady&&document.visibilityState==='visible'&&document.hasFocus();widget.reminder.hidden=!due;if(!due){widget.reminderSignature='';return;}
    const q=reminderState.reminderQuestion;const signature=q?.id||reminderState.reminderError||'pending';if(widget.reminderSignature===signature)return;widget.reminderSignature=signature;minimized=false;
    widget.reminder.textContent='';const heading=document.createElement('strong');heading.textContent='Time for a question';widget.reminder.append(heading);
    const text=document.createElement('p');text.textContent=q?q.prompt:(reminderState.reminderError||'Preparing your study question…');widget.reminder.append(text);
    if(q){
      if(q.code){const pre=document.createElement('pre');pre.textContent=q.code;widget.reminder.append(pre);}
      const feedback=document.createElement('p');feedback.setAttribute('role','status');const norm=v=>String(v).normalize('NFKC').trim().toLowerCase().replace(/\s+/g,' ');
      let submitted=false,submitting=false;const controls=[];
      const check=async value=>{
        if(submitted||submitting)return;submitting=true;controls.forEach(el=>el.disabled=true);
        try{const result=await chrome.runtime.sendMessage({type:'reminder-answer',payload:{questionId:q.id,value}});if(result.error)throw Error(result.error);
          submitted=true;const correct=result.answer.correct;feedback.textContent=(correct?'Correct. ':'Not quite. Answer: '+q.answer+'. ')+q.explanation;feedback.style.color=correct?'#245530':'#963b30';
        }catch(error){feedback.textContent=connectionError(error);controls.forEach(el=>el.disabled=false);}finally{submitting=false;}
      };
      if(q.kind==='mcq'||q.kind==='boolean'){for(const [i,value] of q.options.entries()){const b=document.createElement('button');b.textContent=(q.kind==='mcq'?String.fromCharCode(65+i)+'. ':'')+value;b.style.cssText='display:block;width:100%;margin-top:5px;text-align:left;white-space:pre-wrap';b.onclick=async()=>{await check(value);if(submitted)b.style.background=norm(value)===norm(q.answer)?'#287043':'#a23e32';};controls.push(b);widget.reminder.append(b);}}else{const form=document.createElement('form'),input=document.createElement('input'),b=document.createElement('button');input.placeholder='Your answer';input.setAttribute('aria-label','Practice answer');input.required=true;b.textContent='Check answer';b.type='submit';controls.push(input,b);form.onsubmit=async e=>{e.preventDefault();if(input.value.trim())await check(input.value);};form.append(input,b);widget.reminder.append(form);}
      widget.reminder.append(feedback);
      if(q.videoSource){const video=document.createElement('a');video.href=q.videoSource;video.target='_blank';video.rel='noreferrer';video.textContent='Revisit video moment';widget.reminder.append(video);}
      const report=document.createElement('select');report.setAttribute('aria-label','Question feedback');for(const [value,label] of [['','Report question…'],['irrelevant','Irrelevant'],['unclear','Unclear'],['incorrect','Incorrect']]){const option=document.createElement('option');option.value=value;option.textContent=label;report.append(option);}report.onchange=async()=>{if(!report.value)return;report.disabled=true;try{const r=await chrome.runtime.sendMessage({type:'question-feedback',payload:{questionId:q.id,reason:report.value}});if(r.error)throw Error(r.error);feedback.textContent='Reported. Excluded from automatic mistake review.';}catch(e){feedback.textContent=e.message;report.disabled=false;}};widget.reminder.append(report);
    }
    const open=document.createElement('a');open.href='http://127.0.0.1:43127/#practice';open.target='_blank';open.rel='noreferrer';open.textContent='Open Practice';
    const dismiss=document.createElement('button');dismiss.textContent='Done / remind me next interval';dismiss.style.cssText='margin-top:8px';dismiss.type='button';dismiss.onclick=async()=>{
      if(dismissingReminder)return;
      dismissingReminder=true;reminderUpdate++;dismiss.disabled=true;dismiss.textContent='Dismissing…';
      try{
        const r=await chrome.runtime.sendMessage({type:'reminder-dismiss',payload:{}});
        if(!r||r.error)throw Error(r?.error||'No response from the extension.');
        reminderState=null;
      }catch(error){
        connectionError(error);
        text.textContent='Could not dismiss the reminder. '+(/not supported|Not found|context invalidated/i.test(error.message)?'Reload Recall-All on the Extensions page, refresh this webpage, and restart the dashboard.':error.message)+' Try Done again.';
      }finally{
        reminderUpdate++;dismissingReminder=false;dismiss.disabled=false;dismiss.textContent='Done / remind me next interval';renderWidget();
      }
    };widget.reminder.append(open,dismiss);
  }
  function placeWidget(x,y){
    const box=widget.host.getBoundingClientRect();
    position={x:Math.max(0,Math.min(x,innerWidth-box.width)),y:Math.max(0,Math.min(y,innerHeight-box.height))};
    for(const [key,value] of Object.entries({left:position.x+'px',top:position.y+'px',right:'auto',bottom:'auto'}))widget.host.style.setProperty(key,value,'important');
  }
  async function choose(choice){
    try{
      const result=await chrome.runtime.sendMessage({type:'consent',choice});
      decision=result.decision || decision;choosing=decision==='ask';choosingOverride=false;enabled=!!result.viewing;connected=!result.error;
      records.clear();sent.clear();diagnostic.savedSections=0;
      actionError=result.error||'';diagnostic.phase=result.error || (decision==='deny'?'This site is blocked. Nothing is collected.':decision==='ask'?'May Recall-All view this site?':'Viewing enabled — keep reading');
    }catch(error){diagnostic.phase=connectionError(error);}renderWidget();
  }
  function renderWidget(){
    if(!permissionLoaded&&!extensionInvalid)return;
    if(!widget){
      const host=document.createElement('div');
      host.id='recall-all-companion';
      host.style.cssText='position:fixed!important;right:18px!important;bottom:18px!important;z-index:2147483647!important;display:block!important;';
      const shadow=host.attachShadow({mode:'closed'});
      const style=document.createElement('style');
      style.textContent=':host{all:initial}.card{font:12px/1.45 system-ui,sans-serif;color:#263e35;background:#f5f3e9;border:1px solid #a6b79a;border-radius:18px;padding:9px;width:194px;box-shadow:0 4px 22px #0002}.top{display:flex;align-items:center;gap:10px}.owl{font-size:32px;animation:breathe 4s ease-in-out infinite}.name{font-weight:700;font-size:14px}p{margin:8px 0;overflow-wrap:anywhere}button{font:600 12px system-ui;border:0;border-radius:7px;background:#315842;color:white;padding:8px;cursor:pointer}a{color:#315842;margin-left:10px;font-size:12px}@keyframes breathe{50%{transform:translateY(-2px)}}@media(prefers-reduced-motion:reduce){.owl{animation:none}}';
      style.textContent+='[hidden]{display:none!important}.top{cursor:grab;touch-action:none;user-select:none;gap:7px}.name{font-size:12px;flex:1}.top:active,.grip:active{cursor:grabbing}.small{background:transparent;color:#315842;padding:4px;font-size:18px}.grip{cursor:grab;touch-action:none;background:transparent;color:#65765c;padding:3px}.card.compact{display:flex;flex-wrap:wrap;align-items:center;gap:5px;width:max-content;max-width:calc(100vw - 16px);padding:6px;border-radius:12px}.compact>button,.compact .study-timer{flex-shrink:0;white-space:nowrap}.compact .reminder,.compact .top,.compact p,.compact .permissions,.compact a,.compact .change{display:none!important}.owl{display:block;flex:0 0 76px;width:76px;height:80px;margin:0;animation:none}.owl svg{display:block;width:100%;height:100%;overflow:visible}.bird{transform-origin:90px 143px;transition:transform 550ms cubic-bezier(.3,.1,.2,1)}.covered .bird{transform:none}.sleep-eyes,.sleep-z{opacity:0}.covered .awake-eyes{opacity:0}.covered .sleep-eyes{opacity:1}.awake-eyes{transform-origin:90px 67px}.owl:not(.covered) .awake-eyes{animation:owl-blink-open 6s ease-in-out infinite}.owl:not(.covered) .sleep-eyes{animation:owl-blink-closed 6s ease-in-out infinite}@keyframes owl-blink-open{0%,92%,99%,100%{opacity:1;transform:scaleY(1)}95%,96%{opacity:0;transform:scaleY(.08)}}@keyframes owl-blink-closed{0%,92%,99%,100%{opacity:0}95%,96%{opacity:1}}.resting-wing{opacity:0;transition:opacity 250ms ease}.wing-left{transition:opacity 250ms ease}.covered .resting-wing{opacity:0}.covered .wing-left{opacity:1}.covered .sleep-z{opacity:1;animation:owl-snore 2.8s ease-in-out infinite both}.covered .sleep-z.z2{animation-delay:.65s}.covered .sleep-z.z3{animation-delay:1.3s}.sleep-z{fill:#536f48;font:700 17px Georgia,serif}@keyframes owl-snore{0%,100%{opacity:.8;transform:translateY(0)}50%{opacity:1;transform:translateY(-4px)}}@media(prefers-reduced-motion:reduce){.bird,.awake-eyes,.sleep-eyes,.resting-wing,.wing-left{transition:none}.covered .sleep-z{animation:none;opacity:1}.owl:not(.covered) .awake-eyes,.owl:not(.covered) .sleep-eyes{animation:none}}button:focus-visible{outline:2px solid #ae8240;outline-offset:2px}';
      style.textContent+='.reminder{border-top:1px solid #acb99f;margin-top:10px;padding-top:10px;max-height:320px;overflow:auto}.reminder pre{white-space:pre-wrap;overflow-wrap:anywhere}.reminder input{box-sizing:border-box;width:100%;padding:6px}.card:not(.compact):has(.reminder:not([hidden])){width:260px}';
      const card=document.createElement('section');card.className='card';card.setAttribute('aria-label','Recall-All reading companion');
      const top=document.createElement('div');top.className='top';top.title='Drag to move';
      const owl=document.createElement('span');owl.className='owl';owl.setAttribute('aria-hidden','true');
      const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 -12 202 192');
      const part=(tag,attrs,parent=svg)=>{const node=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [key,value] of Object.entries(attrs))node.setAttribute(key,String(value));parent.append(node);return node;};
      part('path',{d:'M10 153 Q81 146 168 151 M132 150 L155 134 M133 151 L157 169',fill:'none',stroke:'#66553b','stroke-width':8,'stroke-linecap':'round','stroke-linejoin':'round'});
      const bird=part('g',{class:'bird'});
      part('path',{d:'M40 76 Q31 51 45 29 Q58 35 66 27 Q83 17 108 26 L126 15 L126 41 Q150 59 148 93 Q154 130 121 143 Q87 152 57 138 Q29 129 31 100 Z',fill:'#79916b'},bird);
      part('ellipse',{cx:90,cy:65,rx:62,ry:49,fill:'#79916b'},bird);
      part('path',{d:'M49 41 Q45 24 53 14 Q60 25 68 27 Z',fill:'#79916b'},bird);
      part('ellipse',{cx:91,cy:121,rx:36,ry:25,fill:'#e9edcf'},bird);
      part('ellipse',{cx:67,cy:66,rx:25,ry:29,fill:'#f5edce',transform:'rotate(-8 67 66)'},bird);
      part('ellipse',{cx:111,cy:64,rx:25,ry:29,fill:'#f5edce',transform:'rotate(8 111 64)'},bird);
      const awake=part('g',{class:'awake-eyes'},bird);
      for(const x of [70,108]){part('ellipse',{cx:x,cy:67,rx:7,ry:11,fill:'#273e30'},awake);part('circle',{cx:x-2,cy:63,r:2,fill:'#fffaf0'},awake);}
      const asleep=part('g',{class:'sleep-eyes',fill:'none',stroke:'#344b34','stroke-width':4.5,'stroke-linecap':'round'},bird);
      part('path',{d:'M53 67 Q66 84 78 67'},asleep);part('path',{d:'M98 65 Q110 82 122 65'},asleep);
      part('path',{d:'M80 82 Q88 74 96 82 L88 95 Q80 88 80 82',fill:'#cba153'},bird);
      part('path',{d:'M43 86 C28 85 23 98 27 111 C31 125 45 135 61 138 C55 127 59 117 59 106 C59 96 52 88 43 86 Z',fill:'#536f48',class:'wing-left'},bird);
      part('path',{d:'M43 86 C28 85 23 98 27 111 C31 125 45 135 61 138 C55 127 59 117 59 106 C59 96 52 88 43 86 Z',fill:'#536f48',transform:'translate(180 0) scale(-1 1)'},bird);
      for(const [x,y] of [[77,111],[95,110],[68,125],[87,126],[105,124]])part('path',{d:'M'+(x-3)+' '+y+' q4 7 8 0',fill:'none',stroke:'#aab48c','stroke-width':3,'stroke-linecap':'round'},bird);
      part('path',{class:'resting-wing',d:'M25 127 C28 117 45 118 58 123 Q72 128 82 139 L65 135 L73 144 Q48 146 32 140 Q23 136 25 127 Z',fill:'#536f48'});
      for(const x of [72,99]){part('path',{d:'M'+x+' 145 v10 m6 -11 v10 m6 -10 v9',fill:'none',stroke:'#cba153','stroke-width':6,'stroke-linecap':'round'});}
      for(const [i,x,y] of [[1,158,48],[2,173,28],[3,187,8]]){const z=part('text',{x,y,class:'sleep-z z'+i});z.textContent='z';}
      owl.append(svg);
      const name=document.createElement('span');name.className='name';name.textContent='Recall-All · r10';
      const minimize=document.createElement('button');minimize.className='small';minimize.type='button';minimize.textContent='−';minimize.title='Minimize';minimize.setAttribute('aria-label','Minimize companion');
      const toggleSize=()=>{minimized=!minimized;renderWidget();if(position)placeWidget(position.x,position.y);};minimize.onclick=toggleSize;
      top.append(owl,name,minimize);
      const grip=document.createElement('button');grip.className='grip';grip.type='button';grip.textContent='⠿';grip.setAttribute('aria-label','Move companion. Drag or use arrow keys.');
      const expand=document.createElement('button');expand.className='small';expand.type='button';expand.textContent='↗';expand.title='Expand';expand.setAttribute('aria-label','Expand companion');expand.onclick=toggleSize;
      const timer=document.createElement('span');timer.className='study-timer';timer.style.cssText='display:block;font-size:11px;color:#315842;margin:4px 0;font-variant-numeric:tabular-nums';
      const message=document.createElement('p');message.setAttribute('role','status');
      const permissions=document.createElement('div');permissions.className='permissions';
      for(const [label,choice] of [['Allow this site','once'],['Always allow this site','always'],["Don’t allow",'deny']]){
        const option=document.createElement('button');option.type='button';option.textContent=label;option.style.cssText='display:block;width:100%;margin:5px 0';option.onclick=()=>choose(choice);permissions.append(option);
      }
      const explanation=document.createElement('p');explanation.textContent='Allow = this page visit. Always = remember this site. Text stays on this laptop.';permissions.append(explanation);
      const button=document.createElement('button');button.type='button';
      button.onclick=async()=>{
        if(extensionInvalid){location.reload();return;}
        if(!['once','always'].includes(decision)){minimized=false;choosingOverride=true;renderWidget();if(position)placeWidget(position.x,position.y);return;}
        button.disabled=true;
        try{const result=await chrome.runtime.sendMessage({type:'viewing',payload:{viewing:!enabled}});
          if(result.error)throw Error(result.error);actionError='';enabled=result.viewing;diagnostic.phase=enabled?'Viewing enabled — keep reading':'Viewing paused';
        }catch(error){actionError=connectionError(error);diagnostic.phase=actionError;}finally{button.disabled=false;renderWidget();}
      };
      const link=document.createElement('a');link.href='http://127.0.0.1:43127/';link.target='_blank';link.rel='noreferrer';link.textContent='Dashboard';
      const audioButton=document.createElement('button');audioButton.type='button';audioButton.onclick=async()=>{if(!audioState.active){window.open('http://127.0.0.1:43127/#setup','_blank','noopener');return;}audioButton.disabled=true;try{const r=await chrome.runtime.sendMessage({type:'audio/control',payload:{paused:!audioState.paused}});if(r.error)throw Error(r.error);audioState=r;}catch(e){actionError=e.message;}finally{audioButton.disabled=false;renderWidget();}};
      const captureLabel=document.createElement('span');captureLabel.style.cssText='font-size:10px;white-space:normal;max-width:90px';
      const change=document.createElement('button');change.className='change';change.type='button';change.textContent='Site permission';change.style.cssText='display:block;margin-top:8px;background:transparent;color:#315842;padding:3px';change.onclick=()=>{choosingOverride=!choosingOverride;renderWidget();};
      const reminder=document.createElement('section');reminder.className='reminder';reminder.hidden=true;reminder.setAttribute('aria-label','Study question reminder');
      card.append(top,grip,timer,captureLabel,audioButton,message,permissions,button,expand,link,change,reminder);shadow.append(style,card);document.documentElement.append(host);widget={captureLabel,audioButton,host,reminder,timer,message,button,permissions,card,owl,grip,expand};
      for(const handle of [top,grip]){
        let drag=null;
        handle.onpointerdown=event=>{
          if(event.button!==0||(handle===top&&event.target.closest('button')))return;
          const rect=host.getBoundingClientRect();drag={x:event.clientX-rect.left,y:event.clientY-rect.top,id:event.pointerId};
          handle.setPointerCapture(event.pointerId);event.preventDefault();
        };
        handle.onpointermove=event=>{if(drag&&event.pointerId===drag.id){placeWidget(event.clientX-drag.x,event.clientY-drag.y);event.preventDefault();}};
        const finish=()=>{drag=null;};handle.onpointerup=finish;handle.onpointercancel=finish;handle.onlostpointercapture=finish;
      }
      grip.onkeydown=event=>{const delta={ArrowLeft:[-12,0],ArrowRight:[12,0],ArrowUp:[0,-12],ArrowDown:[0,12]}[event.key];if(delta){event.preventDefault();const rect=host.getBoundingClientRect();placeWidget(rect.left+delta[0],rect.top+delta[1]);}};
      addEventListener('resize',()=>{if(position)placeWidget(position.x,position.y);});
    }
    renderReminder();
    widget.reminder.hidden=minimized||extensionInvalid||widget.reminder.hidden;
    widget.card.className=minimized?'card compact':'card';widget.grip.hidden=!minimized;widget.expand.hidden=!minimized;
    widget.owl.className=enabled||(audioState.active&&!audioState.paused)?'owl':'owl covered';widget.captureLabel.textContent=(enabled?'Viewing on':'Viewing off')+' · '+(audioState.active?(audioState.paused?'Audio paused':'Audio on'):'Audio off');widget.audioButton.textContent=audioState.active?(audioState.paused?'Resume audio':'Pause audio'):'Start audio';widget.audioButton.title=audioState.active?'Audio is separate from webpage viewing':'Open Connections to choose and share audio';
    widget.timer.hidden=!enabled;widget.timer.textContent='Today · '+Math.floor(todaySeconds/60)+'m '+String(Math.floor(todaySeconds%60)).padStart(2,'0')+'s';
    widget.permissions.hidden=!(choosing||choosingOverride);
    widget.message.textContent=actionError||(choosing?'May Recall-All view this site?':diagnostic.phase+(diagnostic.savedSections?' · '+diagnostic.savedSections+' saved':''));
    widget.button.hidden=!minimized&&(!['once','always'].includes(decision)||choosingOverride);
    widget.button.textContent=enabled?'Stop viewing':'Start viewing';widget.button.disabled=['once','always'].includes(decision)&&!connected;
    if(extensionInvalid){widget.button.hidden=false;widget.button.disabled=false;widget.button.textContent='Refresh page';}
    widget.button.title=actionError||diagnostic.phase;
    if(position)placeWidget(position.x,position.y);
  }
  chrome.runtime.onMessage.addListener((message,_sender,reply)=>{
    if(message.type==='reading-status')reply(diagnostic);
  });
  const touch=()=>{lastInput=Date.now();};
  for(const event of ['pointerdown','keydown','mousemove','wheel','touchstart']) addEventListener(event,touch,{passive:true});
  addEventListener('scroll',event=>{
    const now=performance.now();
    const target=event.target===document?document.scrollingElement:event.target;
    const position=target.scrollTop || 0;
    const previous=scrollPositions.get(target);
    speed=previous?Math.abs(position-previous.position)/Math.max(.016,(now-previous.at)/1000):200;
    scrollPositions.set(target,{position,at:now});lastScrollAt=now;touch();
  },{passive:true,capture:true});
  const videoSamples=new WeakMap();
  setInterval(async()=>{
    if(busy||extensionInvalid) return;
    busy=true;
    try {
      const now=performance.now(), elapsed=Math.min(1.5,(now-lastAt)/1000);lastAt=now;
      const reminderUpdateAtStart=reminderUpdate;
      const state=await chrome.runtime.sendMessage({type:'status'});
      if(state.workerBuild!=='0.2.0-r10'){
        connected=false;enabled=false;actionError='The owl and background extension are different builds. Reload Recall-All in Extensions, then refresh this page.';records.clear();return;
      }
      if(state.decision){decision=state.decision;choosing=decision==='ask';if(!permissionLoaded){minimized=['once','always','deny'].includes(decision);permissionLoaded=true;}}
      audioState=state.audio||{active:false,paused:false};connected=!state.error;enabled=connected&&state.viewing;todaySeconds=Number(state.todayReadingSeconds)||0;if(!dismissingReminder&&reminderUpdate===reminderUpdateAtStart)reminderState=state;
      if(!['once','always'].includes(decision)){
        diagnostic.phase=decision==='deny'?'This site is blocked. Nothing is collected.':'May Recall-All view this site?';
        records.clear();return;
      }
      if(!state.error&&(state.viewing||(state.audio?.active&&!state.audio.paused))&&['youtube.com','www.youtube.com','m.youtube.com'].includes(location.hostname)){const v=document.querySelector('video');if(v&&Number.isFinite(v.currentTime))await chrome.runtime.sendMessage({type:'video-position',payload:{seconds:v.currentTime,paused:v.paused||v.seeking,rate:v.playbackRate,title:document.title}});}
      if(state.error || !state.viewing || document.visibilityState!=='visible' || !document.hasFocus()) {
        diagnostic.phase=state.error || (!state.viewing?'Viewing paused':'Waiting for this page to be focused');
        records.clear();return;
      }
      if(epoch!==state.epoch || page!==location.href) {records.clear();sent.clear();epoch=state.epoch;page=location.href;}
      const currentSpeed=now-lastScrollAt>450?0:speed;
      let watchingVideo=false;
      for(const video of document.querySelectorAll('video')){
        const rect=video.getBoundingClientRect(),style=getComputedStyle(video);
        const sample={at:now,seconds:video.currentTime,rate:video.playbackRate,paused:video.paused,ended:video.ended,seeking:video.seeking,readyState:video.readyState,
          visible:rect.width>0&&rect.height>0&&rect.bottom>0&&rect.top<innerHeight&&rect.right>0&&rect.left<innerWidth&&style.visibility!=='hidden'&&style.display!=='none'&&style.opacity!=='0'};
        watchingVideo=StudyReading.videoProgress(videoSamples.get(video),sample)||watchingVideo;videoSamples.set(video,sample);
      }
      let accumulating=false;
      diagnostic.visibleSections=0;diagnostic.phase=currentSpeed>=160?'Scrolling too quickly':'Looking for readable text';
      const elements=[...document.querySelectorAll('main p,article p,main li,article li,main pre,article pre')];
      const codeSamples=StudyReading.visibleCode(document,innerHeight,innerWidth);
      const candidates=[...new Set([...elements,...document.querySelectorAll('p,li,pre,code,[role="paragraph"]')]),...codeSamples];
      for(const candidate of candidates.slice(0,2000)) {
        const isEditor=!!candidate.element,el=candidate.element||candidate;
        if(!isEditor&&el.closest('nav,footer,header,form,[contenteditable="true"],[aria-hidden="true"]')) continue;
        const rect=el.getBoundingClientRect();
        if(rect.height<=0 || rect.width<=0 || rect.bottom<0 || rect.top>innerHeight) continue;
        const style=getComputedStyle(el);if(style.visibility==='hidden'||style.opacity==='0')continue;
        const fraction=isEditor?1:Math.max(0,Math.min(rect.bottom,innerHeight)-Math.max(rect.top,0))/rect.height;
        if(fraction<.65)continue;
        const text=isEditor?candidate.text:el.innerText.trim();
        if(text.length<40 || text.length>12000)continue;
        diagnostic.visibleSections++;
        if(sent.has(text))continue;
        const previous=records.get(text);
        const next=StudyReading.step(previous,{words:text.split(/\s+/).length,visibleFraction:fraction,
          speed:currentSpeed,elapsed,idleSeconds:(Date.now()-lastInput)/1000,focused:true});
        records.set(text,next);
        if(next.seconds>(previous?.seconds||0)) accumulating=true;
        if(next.qualified) {
          const response=await chrome.runtime.sendMessage({type:'entry',payload:{text,kind:isEditor||el.tagName==='PRE'||el.tagName==='CODE'?'code':'text',title:document.title,url:location.href,seconds:next.seconds,epoch}});
          if(!response.error)sent.add(text);
          else diagnostic.phase=response.error;
        }
      }
      if(records.size>3000)records.clear();
      diagnostic.savedSections=sent.size;
      if(accumulating)diagnostic.phase='Reading time is accumulating';
      else if(diagnostic.visibleSections && sent.size)diagnostic.phase='Visible sections already saved, or waiting for reading time';
      if(watchingVideo)diagnostic.phase='Video study time is accumulating';
      if(watchingVideo||(diagnostic.visibleSections>0&&currentSpeed<160&&(Date.now()-lastInput)<120000))
        await chrome.runtime.sendMessage({type:'tick',payload:{epoch,elapsed,url:location.href}});
    } catch(error) {connected=false;enabled=false;diagnostic.phase=connectionError(error);records.clear();} finally {
      busy=false;
      renderWidget();
    }
  },1000);
  renderWidget();
})();
