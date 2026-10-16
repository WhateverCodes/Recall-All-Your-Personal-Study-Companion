function videoURL(value){try{const u=new URL(value);const id=u.searchParams.get('v');return ['youtube.com','www.youtube.com','m.youtube.com'].includes(u.hostname)&&u.protocol==='https:'&&u.pathname==='/watch'&&/^[\w-]{11}$/.test(id||'')?'https://www.youtube.com/watch?v='+id:null;}catch{return null;}}
class VideoTimeline {
 constructor(now=Date.now){this.now=now;this.sources=new Map();}
 update(body){const url=videoURL(body.url);if(!url||!Number.isFinite(body.seconds)||body.seconds<0||body.seconds>604800||!Number.isFinite(body.rate)||body.rate<=0||body.rate>16||typeof body.key!=='string'||body.key.length>200)throw Error('Invalid video position.');
  const at=this.now();for(const [key,s] of this.sources)if(at-s.at>180000)this.sources.delete(key);
  if(!this.sources.has(body.key)&&this.sources.size>=50)throw Error('Too many video sources.');
  const s=this.sources.get(body.key)||{samples:[]};if(s.url!==url)s.samples=[];
  Object.assign(s,{key:body.key,url,title:String(body.title||'YouTube video').slice(0,250),at});s.samples.push({at,seconds:body.seconds,rate:body.rate,paused:!!body.paused});s.samples=s.samples.slice(-300);this.sources.set(body.key,s);
 }
 list(){return [...this.sources.values()].filter(s=>this.now()-s.at<10000).map(({key,url,title})=>({key,url,title}));}
 at(key,stamp){const s=this.sources.get(key);if(!s)return null;const p=s.samples.filter(p=>p.at<=stamp).at(-1);if(!p||p.paused||stamp-p.at>4000)return null;return {url:s.url,seconds:Math.max(0,p.seconds+(stamp-p.at)/1000*p.rate)};}
}
function questionVideo(source,evidence){const start=source.text.toLowerCase().indexOf(evidence.toLowerCase());if(start<0)return undefined;const cue=source.videoCues?.find(c=>c.endChar>start&&c.startChar<=start);if(!cue||!videoURL(cue.url))return undefined;return videoURL(cue.url)+'&t='+Math.floor(cue.seconds)+'s';}
module.exports={VideoTimeline,videoURL,questionVideo};
