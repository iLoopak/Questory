import { endpoint, requireString, upstreamJson } from '../_shared/proxy.js';
async function sgdb(apiKey,path,params={}){const url=new URL(`https://www.steamgriddb.com/api/v2${path}`); for(const[k,v]of Object.entries(params)) url.searchParams.set(k,v); return upstreamJson('steamgriddb',url,{headers:{Authorization:`Bearer ${apiKey}`,Accept:'application/json'}})}
function candidates(images,limit=24){return (Array.isArray(images)?images:[]).filter(i=>i?.url&&!i.nsfw&&!i.humor&&(i.type==='static'||i.mime!=='image/gif')).sort((a,b)=>(b.score||0)-(a.score||0)).slice(0,limit).map(({url,width,height})=>({url,width,height}));}
function pick(images,usage){const target=usage==='portrait'?2/3:usage==='hero'?1920/620:usage==='icon'||usage==='logo'?1:920/430; return (Array.isArray(images)?images:[]).filter(i=>i?.url&&!i.nsfw&&!i.humor&&(i.type==='static'||i.mime!=='image/gif')).sort((a,b)=>score(b,target)-score(a,target))[0]?.url;}
function score(i,target){const ratio=(i.width||0)/(i.height||1); return (i.score||0)+Math.min(i.width||0,1920)/1000-Math.abs(ratio-target)*3;}
export default (req,res)=>endpoint(req,res,'steamgriddb',async(body)=>{
 const apiKey=requireString(body,'apiKey','steamgriddb','SteamGridDB API key'); const steamAppId=String(body.steamAppId||'').trim(); const title=String(body.title||'').trim(); const mode=body.mode==='candidates'?'candidates':'artwork';
 if(!steamAppId&&!title) throw Object.assign(new Error('Missing Steam app ID or title.'),{status:400,code:'MISSING_LOOKUP'});
 let gameId=null; let lookup=steamAppId?'steam-app-id':'title';
 if(steamAppId){const r=await sgdb(apiKey,`/games/steam/${encodeURIComponent(steamAppId)}`); gameId=typeof r?.data?.id==='number'?r.data.id:null;} else {const r=await sgdb(apiKey,`/search/autocomplete/${encodeURIComponent(title)}`); gameId=Array.isArray(r?.data)&&typeof r.data[0]?.id==='number'?r.data[0].id:null;}
 if(!gameId) throw Object.assign(new Error('No SteamGridDB game match found.'),{status:404,code:'NO_RESULTS'});
 const [grids, heroes, logos, icons] = await Promise.all([
  sgdb(apiKey,`/grids/game/${gameId}`,{types:'static'}).catch(()=>({data:[]})), sgdb(apiKey,`/heroes/game/${gameId}`,{types:'static'}).catch(()=>({data:[]})), sgdb(apiKey,`/logos/game/${gameId}`,{types:'static'}).catch(()=>({data:[]})), sgdb(apiKey,`/icons/game/${gameId}`,{types:'static'}).catch(()=>({data:[]}))]);
 if(mode==='candidates') return {success:true,provider:'steamgriddb',gameId,cover:candidates(grids.data),wideCover:candidates(grids.data),hero:candidates(heroes.data),logo:candidates(logos.data),icon:candidates(icons.data)};
 return {success:true,provider:'steamgriddb',coverImage:pick(grids.data,'portrait'),wideCoverImage:pick(grids.data,'landscape'),heroImage:pick(heroes.data,'hero'),logoImage:pick(logos.data,'logo'),iconImage:pick(icons.data,'icon'),artworkSource:'steamgriddb',artworkSourceMetadata:{steamGridDb:{gameId,lookup,refreshedAt:new Date().toISOString()}}};
});
