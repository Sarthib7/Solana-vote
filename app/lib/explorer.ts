export function getExplorerUrl(path: string, cluster: string = "devnet"): string {
  const base = "https://explorer.solana.com";
  const url = new URL(path, base);
  if (cluster !== "mainnet-beta") {
    url.searchParams.set("cluster", cluster);
  }
  return url.toString();
}

export function ellipsify(str: string, chars = 4): string {
  if (str.length <= chars * 2 + 3) return str;
  return `${str.slice(0, chars)}...${str.slice(-chars)}`;
}
