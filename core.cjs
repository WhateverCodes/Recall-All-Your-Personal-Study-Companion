const { createHash, randomUUID } = require('node:crypto');
function cleanEntry(input) {
  if (!input || typeof input.text !== 'string' || input.text.trim().length < 40 || input.text.length > 12000) throw new Error('Invalid section');
  const url = new URL(input.url);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Invalid source');
  url.hash = ''; url.search = '';
  const text = input.kind==='code'?input.text.trim():input.text.replace(/\s+/g, ' ').trim();
  return {
    id: createHash('sha256').update(url.href + '\n' + text).digest('hex').slice(0, 24),
    text, kind:input.kind==='code'?'code':'text', url: url.href, title: String(input.title || url.hostname).slice(0, 250),
    seconds: Math.min(3600, Math.max(0, Number(input.seconds) || 0)),
    capturedAt: new Date().toISOString(), method: 'browser-visible-section'
  };
}
function makeQuiz(entries) {
  const questions = entries.map(entry => {
    const sentence = entry.text.match(/[^.!?]+[.!?]+/g)?.find(s => s.trim().length >= 60) || entry.text.slice(0, 350);
    const candidates = sentence.match(/\b[A-Za-z][A-Za-z-]{6,}\b/g) || [];
    const answer = candidates.sort((a,b) => b.length-a.length)[0];
    if (!answer) return null;
    return { id: randomUUID(), sourceId: entry.id, source: entry.url, title: entry.title,
      prompt: sentence.trim().replace(answer, '________'), answer,
      explanation: sentence.trim(), kind: 'local-cloze' };
  }).filter(Boolean);
  if(questions.length<=10)return questions;
  return Array.from({length:10},(_,i)=>questions[Math.round(i*(questions.length-1)/9)]);
}
function summarizePages(entries) {
  const groups=new Map();
  for(const entry of entries){
    if(!groups.has(entry.url))groups.set(entry.url,{url:entry.url,title:entry.title,entries:[]});
    groups.get(entry.url).entries.push(entry);
  }
  const stop=new Set('about after again also another because before being between could from have into more most other over same should some than that their them there these they this those through under very what when where which while with would your'.split(' '));
  return [...groups.values()].map(group=>{
    const sentences=[...new Set(group.entries.flatMap(e=>e.text.match(/[^.!?]+(?:[.!?]+|$)/g)||[e.text]).map(s=>s.trim()).filter(Boolean))];
    const words=s=>(s.toLowerCase().match(/[a-z]{4,}/g)||[]).filter(w=>!stop.has(w));
    const frequency=new Map();for(const sentence of sentences)for(const word of new Set(words(sentence)))frequency.set(word,(frequency.get(word)||0)+1);
    const ranked=sentences.map((text,index)=>({text,index,score:words(text).reduce((sum,w)=>sum+(frequency.get(w)||0),0)/Math.sqrt(Math.max(1,text.split(/\s+/).length))})).sort((a,b)=>b.score-a.score);
    let budget=90;const selected=[];
    for(const sentence of ranked){
      const parts=sentence.text.split(/\s+/);if(parts.length>budget)continue;
      selected.push(sentence);budget-=parts.length;if(selected.length===3)break;
    }
    if(!selected.length&&ranked.length)selected.push({...ranked[0],text:ranked[0].text.split(/\s+/).slice(0,89).join(' ')+'…'});
    return {url:group.url,title:group.title,sectionCount:group.entries.length,
      summary:selected.sort((a,b)=>a.index-b.index).map(s=>s.text).join(' '),method:'local-extractive'};
  });
}
module.exports = { cleanEntry, makeQuiz, summarizePages };

function studyPeriod(period='today', stamp=Date.now()) {
 const offsets={today:[0,0],yesterday:[1,1],week1:[7,1],week2:[14,8],week3:[21,15],week4:[28,22]};
 if(!Object.hasOwn(offsets,period))throw Error('Invalid revision period');
 const [older,newer]=offsets[period];
 const start=new Date(stamp);start.setHours(0,0,0,0);start.setDate(start.getDate()-older);
 const end=new Date(stamp);end.setHours(0,0,0,0);end.setDate(end.getDate()-newer+1);
 const last=new Date(end);last.setDate(last.getDate()-1);
 return {period,start:start.toISOString(),end:end.toISOString(),label:period==='today'?'Today':period==='yesterday'?'Yesterday':start.toLocaleDateString()+' – '+last.toLocaleDateString()};
}
function periodEntries(entries, range){return entries.filter(e=>new Date(e.capturedAt)>=new Date(range.start)&&new Date(e.capturedAt)<new Date(range.end));}
module.exports.studyPeriod=studyPeriod;module.exports.periodEntries=periodEntries;
