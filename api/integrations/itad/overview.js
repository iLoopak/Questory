import { endpoint, requireString, upstreamJson } from '../_shared/proxy.js';
export default (req,res)=>endpoint(req,res,'itad',async(body)=>{
 const apiKey=requireString(body,'apiKey','itad','IsThereAnyDeal API key'); const ids=Array.isArray(body.ids)?body.ids.filter(x=>typeof x==='string'&&x.trim()):[];
 if(!ids.length) throw Object.assign(new Error('Missing IsThereAnyDeal game ids.'),{status:400,code:'MISSING_IDS'});
 const url=new URL('https://api.isthereanydeal.com/games/overview/v2'); url.searchParams.set('key',apiKey); url.searchParams.set('country',typeof body.country==='string'?body.country:'US'); url.searchParams.set('vouchers','true');
 return {success:true,provider:'itad',response:await upstreamJson('itad',url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(ids)})};
});
