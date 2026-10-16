const {app,BrowserWindow,ipcMain,powerMonitor,screen,shell}=require('electron');
const path=require('node:path');
const {startServer}=require('../server.cjs');
// Keep the prototype's profile and study data inside its project directory.
app.setPath('userData',path.join(__dirname,'../data/desktop-profile'));
let dashboard,mascot,bridge;
const base='http://127.0.0.1:43127';
function secureWindow(options){
  const win=new BrowserWindow({...options,webPreferences:{preload:path.join(__dirname,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true}});
  win.webContents.setWindowOpenHandler(({url})=>{if(/^https?:\/\//.test(url))shell.openExternal(url);return {action:'deny'};});
  win.webContents.on('will-navigate',(event,url)=>{if(new URL(url).origin!==base)event.preventDefault();});
  win.webContents.session.setPermissionRequestHandler((_contents,_permission,callback)=>callback(false));
  return win;
}
if(!app.requestSingleInstanceLock())app.quit();
else {
app.on('second-instance',()=>{dashboard?.show();dashboard?.focus();});
app.whenReady().then(async()=>{
  bridge=await startServer();
  dashboard=secureWindow({width:1240,height:900,minWidth:760,minHeight:600,backgroundColor:'#f6f4ed',title:'Recall-All'});
  const {x,y,width,height}=screen.getPrimaryDisplay().workArea;
  mascot=secureWindow({width:215,height:245,x:x+width-235,y:y+height-265,frame:false,transparent:true,alwaysOnTop:true,resizable:false,skipTaskbar:true,title:'Recall-All Companion'});
  await dashboard.loadURL(base);await mascot.loadURL(base+'/mascot.html');
  ipcMain.handle('show-dashboard',event=>{if(event.sender===mascot.webContents){dashboard.show();dashboard.focus();}});
  powerMonitor.on('lock-screen',()=>bridge.pause());powerMonitor.on('suspend',()=>bridge.pause());
  dashboard.on('closed',()=>app.quit());
}).catch(error=>{console.error(error);app.quit();});
app.on('before-quit',()=>{bridge?.pause();bridge?.server.close();});
app.on('window-all-closed',()=>app.quit());
}
