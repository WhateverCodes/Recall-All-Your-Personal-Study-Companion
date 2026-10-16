const crypto=require('node:crypto');
class AudioSession {
  constructor(speech,save,now=Date.now,videos=null){this.speech=speech;this.save=save;this.now=now;this.current=null;this.videos=videos;}
  async start(title,videoKey){
    if(this.current)throw Error('Audio is already active in another dashboard tab. Stop it there first.');
    if(videoKey&&!this.videos?.list().some(v=>v.key===videoKey))throw Error('Video is no longer available. Open the permitted YouTube page, then choose it again.');
    const session={id:crypto.randomUUID(),title:String(title||this.videos?.list().find(v=>v.key===videoKey)?.title||'Audio study').trim().slice(0,160)||'Audio study',next:0,busy:false,paused:false,version:0,videoKey};
    this.current=session;
    try{await this.speech.start();if(this.current!==session)throw Error('Audio session ended.');return {id:session.id,version:0};}
    catch(error){if(this.current===session)this.current=null;throw error;}
  }
  pause(paused){if(!this.current)throw Error('Start audio in Connections first.');if(this.current.paused!==paused){this.current.paused=paused;this.current.version++;}}
  async chunk(body,origin){
    const session=this.current;
    if(!session||body.id!==session.id)throw Error('Audio session ended. Start audio again.');
    if(session.busy||body.sequence!==session.next)throw Error('Audio chunk is out of order or still processing.');
    if(typeof body.audio!=='string'||body.audio.length>2666668||!body.audio.length||body.audio.length%4||!/^[A-Za-z0-9+/]*={0,2}$/.test(body.audio))throw Error('Invalid audio chunk.');
    if(!Number.isFinite(body.duration)||body.duration<=0||body.duration>120)throw Error('Invalid audio duration.');
    session.busy=true;
    try{
      const version=body.version??0;
      if(session.paused||version!==session.version){session.next++;return {saved:false,message:'Audio paused; unfinished segment discarded.'};}
      const result=await this.speech.transcribe(body.audio);
      if(this.current!==session)throw Error('Audio stopped; pending transcript discarded.');
      session.next++;
      if(session.paused||version!==session.version)return {saved:false,message:'Audio paused; unfinished segment discarded.'};
      const text=(result.segments||[]).map(s=>s.text).join(' ').trim().slice(0,12000);
      const videoCues=[];let offset=0;
      if(Number.isFinite(body.startedAt)&&Math.abs(this.now()-body.startedAt)<600000)for(const segment of result.segments||[]){
        const cue=this.videos?.at(session.videoKey,body.startedAt+segment.start*1000);
        if(cue)videoCues.push({startChar:offset,endChar:offset+segment.text.length,...cue});offset+=segment.text.length+1;
      }
      if(text.length>=40)this.save({id:crypto.randomUUID(),title:session.title,url:origin+'/audio/'+session.id,text,kind:'audio',method:'local-audio-transcript',language:result.language,capturedAt:new Date(this.now()).toISOString(),duration:body.duration,videoCues});
      return {saved:text.length>=40,text:text.length>=40?text:'',message:text.length>=40?'Transcript saved.':'No clear speech saved in this segment.'};
    }finally{session.busy=false;}
  }
  stop(id){if(id&&id!==this.current?.id)return;this.current=null;this.speech.stop();}
}
module.exports={AudioSession};
