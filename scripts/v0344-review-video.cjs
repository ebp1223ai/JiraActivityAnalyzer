// Read-only local incident replay. Frames stay outside the repository.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http');
const {app,BrowserWindow}=require('electron');
const root=path.resolve(__dirname,'..');
const input=path.join(fs.readFileSync(path.join(root,'test-artifacts/v0.3.44/input-root.txt'),'utf8').trim(),'JiraActivityAnalyzer_v0.3.44_Complete_Codex_Input');
const file=path.join(input,'08_private_local_only/v043_incident/v043-integrated-hang-original.mp4');
const output=fs.mkdtempSync(path.join(os.tmpdir(),'jaa-v0344-incident-frames-'));
app.setPath('userData',path.join(output,'runtime'));app.setPath('sessionData',path.join(output,'runtime'));
const server=http.createServer((req,res)=>{
  if(req.url!=='/video'){res.setHeader('Content-Type','text/html');res.end('<html><body style="margin:0;background:white"><video id="v" muted style="width:100vw;height:100vh;object-fit:contain" src="/video"></video></body></html>');return;}
  const size=fs.statSync(file).size,m=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range||'');
  if(m){const start=Number(m[1]),end=m[2]?Math.min(Number(m[2]),size-1):size-1;res.writeHead(206,{'Content-Type':'video/mp4','Accept-Ranges':'bytes','Content-Range':`bytes ${start}-${end}/${size}`,'Content-Length':end-start+1});fs.createReadStream(file,{start,end}).pipe(res);}
  else {res.writeHead(200,{'Content-Type':'video/mp4','Content-Length':size,'Accept-Ranges':'bytes'});fs.createReadStream(file).pipe(res);}
});
app.whenReady().then(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const window=new BrowserWindow({show:false,width:1366,height:768,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,backgroundThrottling:false}});
  await window.loadURL(`http://127.0.0.1:${server.address().port}/`);
  const meta=await window.webContents.executeJavaScript(`new Promise((resolve,reject)=>{const v=document.querySelector('video');const done=()=>resolve({duration:v.duration,width:v.videoWidth,height:v.videoHeight});v.readyState>=1?done():v.addEventListener('loadedmetadata',done,{once:true});v.addEventListener('error',()=>reject(Error('VIDEO_DECODE_FAILED')),{once:true});setTimeout(()=>reject(Error('VIDEO_METADATA_TIMEOUT')),10000);})`);
  const frames=[];
  for(const seconds of [30,180,210]){const time=Math.min(seconds,meta.duration-1);await window.webContents.executeJavaScript(`new Promise((resolve,reject)=>{const v=document.querySelector('video');v.addEventListener('seeked',resolve,{once:true});v.currentTime=${time};setTimeout(()=>reject(Error('VIDEO_SEEK_TIMEOUT')),10000);})`);await new Promise(r=>setTimeout(r,100));const name=path.join(output,`frame-${seconds}.png`);fs.writeFileSync(name,(await window.capturePage(undefined,{stayHidden:true})).toPNG());frames.push({seconds:time,path:name});}
  fs.writeFileSync(path.join(root,'test-artifacts/v0.3.44/incident-video-frames.json'),JSON.stringify({source:'provided original incident video',...meta,frames},null,2));console.log(JSON.stringify({meta,frames}));window.destroy();server.close();app.quit();
}).catch(e=>{console.error(e);server.close();app.exit(1);});
