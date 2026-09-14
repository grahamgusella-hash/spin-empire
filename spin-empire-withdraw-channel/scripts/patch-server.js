import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const serverPath = path.join(here, '..', 'server.js');
let source = fs.readFileSync(serverPath, 'utf8');

if (source.includes("app.use(express.static(path.join(__dirname, 'dist')));")) source = source.replace("app.use(express.static(path.join(__dirname, 'dist')));", "app.use((req,res,next) => { if (req.path === '/' || req.path === '/index.html' || req.path.startsWith('/assets/')) { res.set('Cache-Control','no-store, no-cache, must-revalidate, proxy-revalidate'); res.set('Pragma','no-cache'); res.set('Expires','0'); } next(); });\napp.use(express.static(path.join(__dirname, 'dist'), { etag: false, maxAge: 0 }));");
source = source.replace("import { startAdminBot, validateGrant, hasOwnerRole } from './admin.js';", "import { startAdminBot, validateGrant, hasOwnerRole, consumeActivityLaunch } from './admin.js';");
source = source.replace("import nodeFetch from 'node-fetch';\n", '');
for (const routeName of ["app.post('/api/login-ping'", "app.get('/api/activity-login'"]) {
  const start=source.indexOf(routeName); if(start!==-1){ const c=[source.indexOf("app.post('/api/token'",start+1),source.indexOf("app.get('/api/community'",start+1)].filter(i=>i!==-1); const end=Math.min(...c); source=source.slice(0,start)+source.slice(end); }
}
const tokenStart=source.indexOf("app.post('/api/token'"); if(tokenStart!==-1){const tokenEnd=source.indexOf("app.get('/api/community'",tokenStart);if(tokenEnd===-1)throw new Error('Could not locate token route boundary.');source=source.slice(0,tokenStart)+source.slice(tokenEnd);}
const insertAt=source.indexOf("app.get('/api/community'"); if(insertAt===-1)throw new Error('Could not locate API insertion point.');
const loginRoute=`app.get('/api/activity-login',(req,res)=>{res.set('Cache-Control','no-store');const instanceId=String(req.query?.instanceId||'');const guildId=String(req.query?.guildId||'');console.log('Activity login GET received:',instanceId,guildId);try{if(!instanceId){res.set('X-Spin-Error','Activity instance ID is missing.');return res.status(400).end();}const launch=consumeActivityLaunch(instanceId,guildId);if(!launch){console.error('No pending /casino launch matched:',instanceId,guildId);res.set('X-Spin-Error','No recent /casino launch matched this Activity. Close Spin Empire and run /casino again.');return res.status(401).end();}const user=ensureUser(launch.user);const session=crypto.randomBytes(32).toString('hex');sessions.set(session,user.id);setTimeout(()=>sessions.delete(session),12*60*60*1000).unref();const compact={session,user:cleanUser(user),guildId:launch.guildId,state:gameState(user,Date.now())};const encoded=encodeURIComponent(JSON.stringify(compact));console.log('Activity login verified for Discord user',user.id,'header bytes',Buffer.byteLength(encoded));res.set('X-Spin-Login',encoded);res.set('Content-Length','0');return res.status(204).end();}catch(error){console.error('Activity launch login failed:',error?.message||error);res.set('X-Spin-Error','Spin Empire login failed: '+(error?.message||'unknown error'));return res.status(500).end();}});
app.post('/api/login-ping',(req,res)=>res.status(410).json({error:'Outdated Activity build. Close Spin Empire and run /casino again.'}));
app.post('/api/token',(req,res)=>res.status(410).json({error:'Outdated Activity build. Close Spin Empire and run /casino again.'}));

`;
source=source.slice(0,insertAt)+loginRoute+source.slice(insertAt);
if(!source.includes("res.set('X-Spin-Login'"))throw new Error('Header login response was not applied.');
fs.writeFileSync(serverPath,source);
console.log('Patched server to return compact Activity login data in headers (server-1952).');
