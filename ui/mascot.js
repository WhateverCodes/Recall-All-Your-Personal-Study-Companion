let viewing=false;
async function refresh(){try{const response=await fetch('/api/state');if(!response.ok)throw Error();const state=await response.json();viewing=state.viewing;document.body.classList.toggle('paused',!viewing||!state.extensionConnected);document.getElementById('status').textContent=!state.extensionConnected?'Extension not connected':state.questionReady?'A question is ready':viewing?'Viewing enabled':'Viewing paused';document.getElementById('pause').textContent=viewing?'Pause viewing':'Start viewing';}catch{document.getElementById('status').textContent='Disconnected — not viewing';}}
document.getElementById('pause').onclick=async()=>{await fetch('/api/viewing',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({viewing:!viewing})});await refresh();};
document.getElementById('open').onclick=()=>window.studyDesktop?.showDashboard();
refresh();setInterval(refresh,1000);
