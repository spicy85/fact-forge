export function extractDomain(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch (error) {
    console.error(`Failed to extract domain from URL: ${url}`, error);
    return url;
  }
}
