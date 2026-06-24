import { endpoint, requireString, upstreamJson } from '../_shared/proxy.js';
export default (req,res)=>endpoint(req,res,'itad',async(body)=>{
 const apiKey=requireString(body,'apiKey','itad','IsThereAnyDeal API key'); const title=requireString(body,'title','itad','game title');
 const url=new URL('https://api.isthereanydeal.com/games/search/v1'); url.searchParams.set('key',apiKey); url.searchParams.set('title',title); url.searchParams.set('results',String(body.results||5));
 return {success:true,provider:'itad',response:await upstreamJson('itad',url)};
});
