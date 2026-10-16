// Audio-only recording: the required screen-sharing video track is never encoded or sent.
(() => {
  const panel=document.createElement('div');panel.className='pending';
  panel.innerHTML=`<h2>Learn from audio</h2><p>Transcribe a lecture or video on this laptop. Only transcript text is saved. Transcription is free and local; generating quizzes still uses your connected AI provider and its quota.</p><p>Click Start audio, choose a browser tab or your entire screen, and enable <b>Share audio</b>. Only sound is processed. Keep this dashboard tab open. System audio may include other apps; choose a single tab to limit what is heard.</p><p><button id="speechSetup">Set up local transcription</button></p><p class="muted">One-time internet download of speech software and the base speech model (several hundred MB). Transcription runs on your CPU afterward.</p><label for="audioTitle">Study title (optional)</label><input id="audioTitle" maxlength="160" placeholder="For example: Python lecture"><label for="audioVideo">YouTube timestamps (optional)</label><select id="audioVideo"><option value="">No video link</option></select><p>Select the same video you share in the browser picker. Open YouTube and allow the owl first to detect it. Timestamps are approximate.</p><p><button id="startAudio" class="primary" disabled>Start audio</button> <button id="stopAudio" disabled>Stop audio</button></p><p id="speechStatus" role="status">Checking local speech setup…</p><p id="transcriptStatus" role="status"></p><p class="muted">Automatic transcripts can contain mistakes. Open their source links in Summary to review them. Audio does not increase your webpage reading timer or trigger reading-interval questions.</p>`;
  document.getElementById('setup').prepend(panel);
  const badge=document.createElement('div');badge.className='audio-status';badge.hidden=true;
  const badgeText=document.createElement('span'),stopBadge=document.createElement('button');stopBadge.textContent='Stop audio';badge.append(badgeText,stopBadge);document.querySelector('main header').after(badge);
  const el=id=>document.getElementById(id);
  let current=null,installed=false,remoteActive=false,polling=false;
  async function request(route,body){
    const response=await fetch('/api/audio/'+route,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
    const value=await response.json();if(!response.ok)throw Error(response.status===404?'Restart the dashboard app to enable audio transcription.':value.error||'Audio request failed.');return value;
  }
  function status(message){el('transcriptStatus').textContent=message;}
  function controls(){el('startAudio').disabled=!installed||!!current||remoteActive;el('stopAudio').disabled=!current&&!remoteActive;badge.hidden=!current&&!remoteActive;badgeText.textContent=current?.paused?'Audio paused':current?.ending?'Finishing local transcript…':current?.recording?'● Audio recording · processed on this laptop':current?'Preparing audio…':'Audio active in another dashboard tab';}
  async function poll(){if(polling)return;polling=true;const polledSession=current,polledId=current?.id;try{const value=await request('status');installed=value.installed;remoteActive=value.active;if(current?.id&&current===polledSession&&polledId===current.id){current.version=value.version||0;applyPause(current,!!value.paused);}if(!current){const chosen=el('audioVideo').value;const signature=JSON.stringify(value.videos||[]);if(el('audioVideo').dataset?.signature!==signature){el('audioVideo').replaceChildren(new Option('No video link',''));for(const v of value.videos||[])el('audioVideo').append(new Option(v.title,v.key));el('audioVideo').value=chosen;if(el('audioVideo').dataset)el('audioVideo').dataset.signature=signature;}}el('speechSetup').disabled=value.settingUp||value.active||!!current;el('speechSetup').hidden=installed&&!value.error&&!value.settingUp;el('speechSetup').textContent=value.error?'Retry speech setup':'Set up local transcription';el('speechStatus').textContent=value.settingUp?(value.stage||'Downloading and preparing local speech software. This can take several minutes.'):value.error|| (installed?'Local transcription is ready.':'Local speech model is not installed yet.');if(polledId&&current===polledSession&&current.id===polledId&&!remoteActive&&!current.ending)abort(current,'Audio session ended. Previously saved transcripts are kept.');controls();}catch(error){el('speechStatus').textContent=error.message;installed=false;if(current)abort(current,'Dashboard connection lost. Recording stopped.');controls();}finally{polling=false;}}
  el('speechSetup').onclick=async()=>{el('speechSetup').disabled=true;try{await request('setup',{});await poll();}catch(error){el('speechStatus').textContent=error.message;el('speechSetup').disabled=false;}};
  function applyPause(s,paused){if(s.paused===paused||s.ending)return;s.paused=paused;if(paused){clearTimeout(s.timer);s.queue.length=0;if(s.recorder?.state==='recording'){s.waiting=true;s.recorder.stop();}status('Audio paused from the owl. Resume there when ready.');}else{recordPart(s);status('Audio resumed.');}}
  function release(s){clearTimeout(s.timer);s.recording=false;for(const track of s.stream?.getTracks()||[])track.stop();}
  function abort(s,message){if(current!==s)return;s.cancelled=true;release(s);s.queue.length=0;try{if(s.recorder?.state==='recording')s.recorder.stop();}catch{}if(s.id)request('stop',{id:s.id}).catch(()=>{});current=null;remoteActive=false;status(message);controls();}
  function asBase64(blob){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onerror=()=>reject(Error('Audio could not be read.'));reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.readAsDataURL(blob);});}
  async function drain(s){
    if(s.processing||s.cancelled)return;s.processing=true;
    try{while(s.queue.length&&!s.cancelled){const part=s.queue.shift();const audio=await asBase64(part.blob);if(s.cancelled)break;const result=await request('chunk',{id:s.id,sequence:s.sequence++,audio,duration:part.duration,version:part.version,startedAt:part.startedAt});if(s.cancelled)break;status(result.message+' Saved transcripts appear in Summary and Practice topics.');}}
    catch(error){abort(s,error.message);}finally{s.processing=false;if(s.ending&&!s.cancelled&&!s.queue.length&&!s.waiting)await finish(s);}
  }
  async function finish(s){if(s.finishing||s.cancelled)return;s.finishing=true;try{await request('stop',{id:s.id});if(current===s){current=null;remoteActive=false;status('Audio stopped. Saved transcripts are ready in Summary and Practice.');controls();}}catch(error){abort(s,error.message);}}
  function recordPart(s){
    if(s.ending||s.cancelled||s.paused||s.waiting)return;
    const parts=[];const began=performance.now(),startedAt=Date.now(),version=s.version||0;
    const recorder=new MediaRecorder(new MediaStream(s.stream.getAudioTracks()),{mimeType:s.mimeType,audioBitsPerSecond:64000});s.recorder=recorder;
    recorder.ondataavailable=event=>{if(event.data.size)parts.push(event.data);};
    recorder.onerror=()=>abort(s,'Audio recording failed. Start again or choose a browser tab with audio.');
    recorder.onstop=()=>{
      clearTimeout(s.timer);s.waiting=false;if(s.cancelled)return;if(s.paused||version!==s.version){if(s.ending){if(!s.processing)finish(s);}else if(!s.paused)recordPart(s);return;}
      const duration=(performance.now()-began)/1000,blob=new Blob(parts,{type:s.mimeType});
      if(duration>120){abort(s,'Recording was interrupted or the laptop slept. Start audio again.');return;}
      if(blob.size&&duration>.2){if(blob.size>2000000||s.queue.length>=2){abort(s,'Transcription cannot keep up with playback. Recording stopped; earlier transcripts are saved.');return;}s.queue.push({blob,duration,startedAt,version});}
      if(!s.ending)recordPart(s);
      drain(s);
    };
    recorder.start();s.timer=setTimeout(()=>{s.waiting=true;if(recorder.state==='recording')recorder.stop();},20000);
  }
  function stopLocal(){const s=current;if(!s||s.ending)return;if(!s.id){abort(s,'Audio preparation cancelled.');return;}s.ending=true;s.waiting=s.waiting||s.recorder?.state==='recording';if(s.recorder?.state==='recording')s.recorder.stop();release(s);controls();if(!s.waiting&&!s.processing)finish(s);}
  async function stop(){if(current)stopLocal();else{try{await request('stop',{});remoteActive=false;status('Audio stopped.');controls();}catch(error){status(error.message);}}}
  el('stopAudio').onclick=stop;stopBadge.onclick=stop;
  el('startAudio').onclick=async()=>{
    if(current)return;
    if(!navigator.mediaDevices?.getDisplayMedia||!window.MediaRecorder){status('Open this dashboard in Chrome or Edge to share audio.');return;}
    const s={queue:[],sequence:0,cancelled:false,ending:false,processing:false};current=s;controls();
    try{
      // Invoke the picker before any await so the browser retains the user's click.
      s.stream=await navigator.mediaDevices.getDisplayMedia({video:true,audio:true,systemAudio:'include',selfBrowserSurface:'exclude'});
      if(s.cancelled||s.ending){release(s);return;}
      if(!s.stream.getAudioTracks().length)throw Error('No audio was shared. Choose a tab or Entire screen and enable Share audio, then try again.');
      s.mimeType=['audio/webm;codecs=opus','audio/webm'].find(type=>MediaRecorder.isTypeSupported(type));if(!s.mimeType)throw Error('This browser does not support audio recording. Use Chrome or Edge.');
      for(const track of s.stream.getTracks())track.addEventListener('ended',()=>{if(current===s&&!s.ending)stopLocal();});
      const session=await request('start',{videoKey:el('audioVideo').value||undefined,title:el('audioTitle').value.trim()||(el('audioVideo').value?'':'Audio study · '+new Date().toLocaleString())});s.id=session.id;s.version=session.version||0;s.paused=false;
      if(s.cancelled||s.ending){await request('stop',{id:s.id});release(s);return;}
      s.recording=true;recordPart(s);status('Listening. The first transcript will appear after about 20 seconds plus processing time.');controls();
    }catch(error){abort(s,error.name==='NotAllowedError'?'Audio sharing was cancelled or not permitted.':error.message);}
  };
  window.addEventListener('pagehide',()=>{if(!current)return;const s=current;s.cancelled=true;release(s);if(s.id)navigator.sendBeacon('/api/audio/stop',JSON.stringify({id:s.id}));});
  window.addEventListener('study-data-deleted',()=>{if(current)abort(current,'Audio stopped and study data deleted.');});
  poll();setInterval(poll,3000);
})();
