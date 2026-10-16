const {spawn}=require('node:child_process');
const {startServer}=require('./server.cjs');
const URL='http://127.0.0.1:43127/';
function openBrowser(url){
  return new Promise((resolve,reject)=>{
    const child=spawn('rundll32.exe',['url.dll,FileProtocolHandler',url],{windowsHide:true,stdio:'ignore'});
    child.once('error',reject);
    child.once('exit',code=>code===0?resolve():reject(Error('Browser launch failed. Open '+url)));
  });
}
async function isDashboard(request=fetch){
  const response=await request(URL,{signal:AbortSignal.timeout(3000),redirect:'error'});
  return response.ok&&(await response.text()).includes('<title>Recall-All — Your study day</title>');
}
async function launch({start=startServer,open=openBrowser,probe=isDashboard}={}){
  let app;
  try{app=await start();}catch(error){
    if(error.code!=='EADDRINUSE')throw error;
    if(!await probe())throw Error('Another app is using port 43127. Close it and try again.');
  }
  await open(URL);
  return app;
}
if(require.main===module)launch().then(app=>console.log(app?'Recall-All opened. Keep this window running while studying.':'Recall-All is already running. Dashboard opened.')).catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={launch,isDashboard};
