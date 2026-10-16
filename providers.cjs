async function requestWithRetry(url,options,request=fetch,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))){
 for(let attempt=0;attempt<3;attempt++){
  const response=await request(url,options);
  if(![502,503,504].includes(response.status)||attempt===2)return response;
  const header=response.headers?.get('retry-after');
  const retryAfter=header===null||header===undefined?0:/^\d+$/.test(header)?Number(header)*1000:Math.max(0,Date.parse(header)-Date.now());
  // Do not retry earlier than requested, or hold the user through a long outage.
  if(retryAfter>10000)return response;
  await response.body?.cancel();
  await wait(Math.max(Number.isFinite(retryAfter)?retryAfter:0,1000*2**attempt+Math.floor(Math.random()*250)));
 }
}
const PROVIDERS={gemini:{name:'Google Gemini',base:'https://generativelanguage.googleapis.com/v1beta'},openai:{name:'OpenAI',base:'https://api.openai.com/v1'},groq:{name:'Groq',base:'https://api.groq.com/openai/v1'},openrouter:{name:'OpenRouter',base:'https://openrouter.ai/api/v1'}};
function config(body){
 if(!Object.hasOwn(PROVIDERS,body.provider))throw Error('Choose a supported AI provider.');
 if(typeof body.apiKey!=='string'||body.apiKey.trim().length<10||body.apiKey.length>1000||/\s/.test(body.apiKey.trim()))throw Error('Enter a valid API key.');
 if(typeof body.model!=='string'||! /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,149}$/.test(body.model))throw Error('Enter the model ID from your provider.');
 if(body.consent!==true)throw Error('Please allow selected study material to be sent to this provider.');
 return {provider:body.provider,apiKey:body.apiKey.trim(),model:body.model,consent:true};
}
async function complete(c,instruction,content,schema,request=fetch){
 const p=PROVIDERS[c.provider];if(!p)throw Error('Unsupported AI provider.');
 const gemini=c.provider==='gemini';
 const url=gemini?p.base+'/models/'+encodeURIComponent(c.model)+':generateContent':p.base+'/chat/completions';
 const headers={'Content-Type':'application/json',...(gemini?{'x-goog-api-key':c.apiKey}:{Authorization:'Bearer '+c.apiKey})};
 const body=gemini?{systemInstruction:{parts:[{text:instruction}]},contents:[{role:'user',parts:[{text:content}]}],generationConfig:{responseMimeType:'application/json',responseJsonSchema:schema,maxOutputTokens:8192}}:{model:c.model,messages:[{role:'system',content:instruction+' Return only JSON matching this schema: '+JSON.stringify(schema)},{role:'user',content}],response_format:{type:'json_object'}};
 let r;try{r=await requestWithRetry(url,{method:'POST',headers,body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(180000)},request);}catch{throw Error('Could not reach '+p.name+'. Check your internet connection and try again.');}
 if(!r.ok){const message=r.status===429?'Usage limit reached. Wait for your quota to reset; no automatic paid upgrade is made.':r.status===401||r.status===403?'Key rejected or access denied. Check the key and project permissions.':r.status===404?'Model unavailable for this API. Click Load available models and select a returned model.':r.status===400?'Provider rejected the request. Check your key and use a model supporting JSON output.':r.status===503?'The provider is still unavailable (503). Automatic retries are limited. Try another model from the available-model list or return later; replacing your key will not fix a service outage.':r.status===502||r.status===504?'The provider gateway timed out. Please retry later.':r.status===500?'The provider encountered an internal error. Please retry later.':r.status===402?'This provider requires credits for the selected model. Choose a free-tier model; do not enable billing if you want free-only use.':'Unexpected provider response. Please share this HTTP status, not your key.';throw Error(p.name+' (HTTP '+r.status+'): '+message);}
 let d;try{d=await r.json();}catch{throw Error('Provider returned an unreadable response.');}
 const text=gemini?d.candidates?.[0]?.content?.parts?.filter(p=>!p.thought).map(p=>p.text||'').join(''):d.choices?.[0]?.message?.content;
 if(typeof text!=='string'||!text.trim())throw Error('The model returned no answer. Try different study material or a different model.');
 return text;
}
async function testConnection(c,request=fetch){if(c.provider==='gemini'){const models=await listModels(c,request);if(!models.some(m=>m.id===c.model))throw Error('This model is not available. Load available models and select a returned model.');return;}const result=await complete(c,'Connection test. Return JSON with ok equal to true.','Return {"ok":true}. No study material is included.',{type:'object',properties:{ok:{type:'boolean'}},required:['ok']},request);let value;try{value=JSON.parse(result);}catch{}if(value?.ok!==true)throw Error('The model responded, but did not pass the JSON connection test.');}
module.exports={config,complete,testConnection,PROVIDERS};

async function listModels(body,request=fetch){
 const c=config({...body,model:'discovery',consent:true}),p=PROVIDERS[c.provider],gemini=c.provider==='gemini';
 const models=[];let pageToken='';
 for(let page=0;page<10;page++){
 const url=p.base+'/models'+(gemini?'?pageSize=1000'+(pageToken?'&pageToken='+encodeURIComponent(pageToken):''):'');
 let r;try{r=await request(url,{headers:gemini?{'x-goog-api-key':c.apiKey}:{Authorization:'Bearer '+c.apiKey},redirect:'error',signal:AbortSignal.timeout(15000)},request);}catch{throw Error('Could not reach the provider to load models. Check your connection.');}
 if(!r.ok)throw Error(r.status===401||r.status===403?'The provider rejected this key or its permissions.':r.status===429?'Provider rate limit reached. Please try later.':'Could not load models (HTTP '+r.status+').');
 const data=await r.json();
 if(gemini){for(const m of data.models||[]){if(m.supportedGenerationMethods?.includes('generateContent')&&typeof m.name==='string')models.push({id:m.name.replace(/^models\//,''),name:String(m.displayName||m.name)});}pageToken=data.nextPageToken||'';if(!pageToken)break;}
 else {for(const m of data.data||[])if(typeof m.id==='string')models.push({id:m.id,name:m.id});break;}
 }
 return models.filter(m=>/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,149}$/.test(m.id)).sort((a,b)=>a.id.localeCompare(b.id));
}
module.exports.listModels=listModels;

module.exports.requestWithRetry=requestWithRetry;
