const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('studyDesktop',{showDashboard:()=>ipcRenderer.invoke('show-dashboard')});
