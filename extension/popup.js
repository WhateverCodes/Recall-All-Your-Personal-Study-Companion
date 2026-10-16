const status=document.getElementById('status');
async function inspect(){const state=await chrome.runtime.sendMessage({type:'status'});if(state.workerBuild!=='0.2.0-r2')state.error='Background code is out of date. Reload Recall-All on the Extensions page.';status.textContent=state.error||('Connected · viewing '+(state.viewing?'enabled':'paused')+' · '+state.workerBuild);return state;}
document.getElementById('viewing').onclick=async()=>{try{const state=await inspect();if(state.error)return;const result=await chrome.runtime.sendMessage({type:'viewing',payload:{viewing:!state.viewing}});if(result.error)throw Error(result.error);await inspect();}catch(error){status.textContent=error.message;}};
inspect().catch(error=>{status.textContent=error.message;});
