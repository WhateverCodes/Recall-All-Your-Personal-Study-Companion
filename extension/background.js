const BASE='http://127.0.0.1:43127';
const WORKER_BUILD='0.2.0-r10';
async function bridge(type,payload){
  let {token}=await chrome.storage.local.get('token');
  async function connect(){
    const response=await fetch(BASE+'/api/connect',{headers:{'X-Recall-Extension':chrome.runtime.id},signal:AbortSignal.timeout(2500)});
    if(!response.ok)throw Error('Local connection rejected. Reload Recall-All version 0.2.0.');
    token=(await response.json()).token;await chrome.storage.local.set({token});
  }
  if(!token)await connect();
  const request=()=>fetch(BASE+'/api/'+type,{method:type==='status'?'GET':'POST',headers:{'Content-Type':'application/json','X-Study-Token':token},...(type==='status'?{}:{body:JSON.stringify(payload)}),signal:AbortSignal.timeout(2500)});
  let response=await request();if(response.status===401){await connect();response=await request();}
  const result=await response.json();if(!response.ok)throw Error(result.error);return result;
}
async function policy(sender){
  const origin=new URL(sender.url).origin;
  const {decisions={}}=await chrome.storage.local.get('decisions');
  const key='tab-'+sender.tab.id;
  const stored=(await chrome.storage.session.get(key))[key];
  const document=sender.documentId || sender.url;
  return {origin,key,document,decision:decisions[origin]==='always'?'always':decisions[origin]==='deny'?'deny':stored?.document===document&&stored?.origin===origin?'once':'ask'};
}
chrome.runtime.onInstalled.addListener(async()=>{
  await chrome.scripting.unregisterContentScripts();
  for(const tab of await chrome.tabs.query({})){
    if(/^https?:/.test(tab.url||''))try{await chrome.scripting.executeScript({target:{tabId:tab.id},files:['reading.js','content.js']});}catch{}
  }
});
chrome.tabs.onRemoved.addListener(id=>chrome.storage.session.remove('tab-'+id));
chrome.runtime.onMessage.addListener((message,sender,reply)=>{
  (async()=>{
    if(sender.tab){
      if(sender.frameId && sender.frameId!==0)throw Error('Top-level pages only');
      const access=await policy(sender);
      if(message.type==='consent'){
        const choice=message.choice;
        if(!['once','always','deny','ask'].includes(choice))throw Error('Invalid choice');
        const {decisions={}}=await chrome.storage.local.get('decisions');
        delete decisions[access.origin];
        if(choice==='always'||choice==='deny')decisions[access.origin]=choice;
        await chrome.storage.local.set({decisions});await chrome.storage.session.remove(access.key);
        if(choice==='once')await chrome.storage.session.set({[access.key]:{document:access.document,origin:access.origin}});
        if(choice==='always'||choice==='once'){
          try{return {decision:choice,...await bridge('viewing',{viewing:true})};}
          catch{return {decision:choice,error:'Permission saved. Open the Recall-All app to connect.'};}
        }
        return {decision:choice,viewing:false};
      }
      if(message.type==='status'){
        if(!['once','always'].includes(access.decision)){const {token}=await chrome.storage.local.get('token');if(!token)return {decision:access.decision,viewing:false};try{const status=await bridge('status');return {decision:access.decision,viewing:false,audio:status.audio};}catch{return {decision:access.decision,viewing:false};}}
        try{return {...await bridge('status'),decision:access.decision};}
        catch{return {decision:access.decision,error:'Open the Recall-All app to connect. Your permission is saved.'};}
      }
      if(message.type==='audio/control')return await bridge('audio/control',message.payload);
      if(!['once','always'].includes(access.decision))throw Error('Site not approved');
      if(message.type==='video-position'){const url=new URL(sender.url);if(!['youtube.com','www.youtube.com','m.youtube.com'].includes(url.hostname)||url.pathname!=='/watch')throw Error('YouTube only');return await bridge('video-position',{...message.payload,url:sender.url,key:String(sender.tab.id)+':'+(sender.documentId||'page')});}
      const tab=await chrome.tabs.get(sender.tab.id);const win=await chrome.windows.get(tab.windowId);
      if(!tab.active||!win.focused)throw Error('Keep this page focused');
      if(['entry','tick'].includes(message.type)&&message.payload.url&&new URL(message.payload.url).origin!==access.origin)throw Error('Source mismatch');
    }
    if(!['status','entry','tick','viewing','reminder-dismiss','reminder-answer','question-feedback','audio/control'].includes(message.type))throw Error('Command '+String(message.type)+' is not supported by '+WORKER_BUILD+' (page sender: '+Boolean(sender.tab)+').');
    try{return await bridge(message.type,message.payload);}catch(error){throw Error(error.message==='Failed to fetch'?'Open the Recall-All app to connect.':error.message);}
  })().then(result=>reply({...result,workerBuild:WORKER_BUILD})).catch(error=>reply({error:error.message,workerBuild:WORKER_BUILD}));return true;
});

