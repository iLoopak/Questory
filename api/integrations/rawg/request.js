import { endpoint, requireString, upstreamJson } from '../_shared/proxy.js';
const allowed = new Set(['/games','/games/{id}','/games/{id}/screenshots']);
export default (req,res)=>endpoint(req,res,'rawg',async(body)=>{
 const apiKey=requireString(body,'apiKey','rawg','RAWG API key'); const route=requireString(body,'route','rawg','RAWG route');
 if(!allowed.has(route)) throw Object.assign(new Error('Unsupported RAWG proxy route.'),{status:400,code:'UNSUPPORTED_ROUTE'});
 const id=body.rawgId; const path=route.replace('{id}', encodeURIComponent(String(id ?? '')));
 if(path.includes('{id}') || /\/games\/($|\/screenshots)/.test(path)) throw Object.assign(new Error('Missing RAWG game id.'),{status:400,code:'MISSING_RAWG_ID'});
 const url=new URL(`https://api.rawg.io/api${path}`); url.searchParams.set('key',apiKey);
 for (const [k,v] of Object.entries(body.params||{})) if (typeof v==='string') url.searchParams.set(k,v);
 return {success:true,provider:'rawg',response:await upstreamJson('rawg',url)};
});
