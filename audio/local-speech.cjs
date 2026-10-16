const fs=require('node:fs');
const path=require('node:path');
const {spawn}=require('node:child_process');
const readline=require('node:readline');
const root=path.join(__dirname,'..');
const python=path.join(root,'data','speech-runtime',process.platform==='win32'?'Scripts/python.exe':'bin/python');
const workerFile=path.join(__dirname,'worker.py');
const setupFile=path.join(root,'data/speech-setup.json');

class LocalSpeech {
  constructor(){this.child=null;this.pending=null;this.loading=null;this.ready=false;this.settingUp=false;this.setupError='';this.stage='';}
  status(){
    let setup=null;try{setup=JSON.parse(fs.readFileSync(setupFile,'utf8'));if(setup.running)try{process.kill(setup.pid,0);}catch(error){if(error.code!=='EPERM')setup={error:'Speech setup was interrupted. Run setup again.'};}}catch{}
    return {installed:fs.existsSync(python)&&fs.existsSync(path.join(root,'data/speech-model/ready')),settingUp:this.settingUp||!!setup?.running,error:this.setupError||setup?.error||'',stage:this.stage||setup?.stage||''};
  }
  setupStage(stage){this.stage=stage;fs.mkdirSync(path.dirname(setupFile),{recursive:true});fs.writeFileSync(setupFile,JSON.stringify({pid:process.pid,running:true,stage}));}
  async setup(){
    if(this.status().settingUp)throw Error('Speech setup is already running.');
    this.settingUp=true;this.setupError='';
    try{
      this.setupStage('Preparing the local speech runtime…');
      if(!fs.existsSync(python)){
        await this.run(process.platform==='win32'?'py':'python3',['-m','venv',path.join(root,'data/speech-runtime')]);
      }
      this.setupStage('Downloading speech software. Keep the dashboard app running…');
      try{await this.run(python,['-c','import faster_whisper']);}
      catch{await this.run(python,['-m','pip','install','--cache-dir',path.join(root,'data/speech-download-cache'),'--find-links',path.join(root,'data/speech-wheels'),'--disable-pip-version-check','faster-whisper==1.2.1']);}
      this.setupStage('Downloading and checking the speech model. Slow connections can take an hour…');
      await this.run(python,[workerFile,'--setup']);
    }catch{this.setupError='Setup failed. Install Python 3.11 or 3.12 from python.org if needed, check your internet connection, then try setup again.';throw Error(this.setupError);}
    finally{this.settingUp=false;this.stage='';fs.writeFileSync(setupFile,JSON.stringify({running:false,error:this.setupError}));}
  }
  run(executable,args){return new Promise((resolve,reject)=>{
    const temp=path.join(root,'data/setup-temp');fs.mkdirSync(temp,{recursive:true});
    const child=spawn(executable,args,{windowsHide:true,stdio:'ignore',env:{...process.env,TEMP:temp,TMP:temp}});
    const timer=setTimeout(()=>{child.kill();reject(Error('Setup timed out.'));},60*60*1000);timer.unref();
    child.once('error',error=>{clearTimeout(timer);reject(error);});
    child.once('exit',code=>{clearTimeout(timer);code===0?resolve():reject(Error('Setup failed.'));});
  });}
  async start(){
    if(this.ready)return;
    if(this.loading)return this.loading;
    if(!this.status().installed)throw Error('Set up local transcription in Connections first.');
    this.loading=new Promise((resolve,reject)=>{
      const child=spawn(python,[workerFile],{windowsHide:true,stdio:['pipe','pipe','ignore'],env:{...process.env,HF_HUB_OFFLINE:'1',HF_HUB_DISABLE_TELEMETRY:'1'}});this.child=child;
      const timeout=setTimeout(()=>{this.stop();reject(Error('Speech model took too long to load.'));},60000);timeout.unref();
      const fail=()=>{clearTimeout(timeout);const error=Error('Local speech worker stopped. Start audio again.');if(this.child===child){this.ready=false;this.child=null;if(this.pending){clearTimeout(this.pending.timer);this.pending.reject(error);this.pending=null;}}reject(error);};
      child.once('error',fail);child.once('exit',fail);
      readline.createInterface({input:child.stdout}).on('line',line=>{
        if(this.child!==child)return;
        let result;try{result=JSON.parse(line);}catch{return;}
        if(result.ready){clearTimeout(timeout);this.ready=true;resolve();return;}
        if(!this.ready&&result.error){clearTimeout(timeout);reject(Error(result.error));this.stop();return;}
        const pending=this.pending;this.pending=null;
        if(pending){clearTimeout(pending.timer);result.error?pending.reject(Error(result.error)):pending.resolve(result);}
      });
    });
    try{await this.loading;}finally{this.loading=null;}
  }
  async transcribe(audio){
    if(this.pending)throw Error('Speech processing is busy.');
    await this.start();
    if(this.pending)throw Error('Speech processing is busy.');
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{this.stop();reject(Error('Transcription took too long. Audio stopped to avoid a backlog.'));},180000);timer.unref();
      this.pending={resolve,reject,timer};
      this.child.stdin.write(JSON.stringify({audio})+'\n',error=>{if(error)this.stop();});
    });
  }
  stop(){
    this.ready=false;
    if(this.pending){clearTimeout(this.pending.timer);this.pending.reject(Error('Audio transcription stopped.'));this.pending=null;}
    const child=this.child;this.child=null;child?.kill();
  }
}
module.exports={LocalSpeech};
