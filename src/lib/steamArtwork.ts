export type SteamArtworkUrls = {
  library: string;
  header: string;
  capsule: string;
};

export function getSteamArtworkUrls(steamAppId: number): SteamArtworkUrls {
  const baseUrl = `https://cdn.cloudflare.steamstatic.com/steam/apps/${steamAppId}`;

  return {
    library: `${baseUrl}/library_600x900.jpg`,
    header: `${baseUrl}/header.jpg`,
    capsule: `${baseUrl}/capsule_616x353.jpg`,
  };
}
