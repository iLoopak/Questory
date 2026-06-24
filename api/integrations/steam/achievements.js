import { endpoint, requireString, upstreamJson } from '../_shared/proxy.js';
export default (req,res)=>endpoint(req,res,'steam',async(body)=>{
 const apiKey=requireString(body,'apiKey','steam','Steam API key'); const steamId64=requireString(body,'steamId64','steam','SteamID64'); const appId=requireString(body,'appId','steam','Steam app ID');
 const schema=new URL('https://api.steampowered.com/ISteamUserStats/GetSchemaForGame/v2/'); schema.searchParams.set('key',apiKey); schema.searchParams.set('appid',appId); schema.searchParams.set('format','json');
 const player=new URL('https://api.steampowered.com/ISteamUserStats/GetPlayerAchievements/v0001/'); player.searchParams.set('key',apiKey); player.searchParams.set('steamid',steamId64); player.searchParams.set('appid',appId); player.searchParams.set('format','json');
 return {success:true,provider:'steam',schema:await upstreamJson('steam',schema),playerAchievements:await upstreamJson('steam',player)};
});
