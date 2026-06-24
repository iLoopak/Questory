import { endpoint, requireString, upstreamJson } from '../_shared/proxy.js';
export default (req,res)=>endpoint(req,res,'steam',async(body)=>{
 const apiKey=requireString(body,'apiKey','steam','Steam API key'); const steamId64=requireString(body,'steamId64','steam','SteamID64');
 const url=new URL('https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/');
 url.searchParams.set('key',apiKey); url.searchParams.set('steamids',steamId64); url.searchParams.set('format','json');
 return {success:true,provider:'steam',response:await upstreamJson('steam',url)};
});
