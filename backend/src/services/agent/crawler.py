
import sys
from curl_cffi import requests

def fetch_url(url):
    try:
        # curl_cffi dynamically impersonates real desktop Chrome 110 TLS fingerprints!
        # This completely bypasses Cloudflare's JA3 and anti-scraping firewalls seamlessly.
        response = requests.get(url, impersonate="chrome110", timeout=15)
        response.raise_for_status()
        # Output raw binary content directly to stdout to handle UTF-8 symbols cleanly
        sys.stdout.buffer.write(response.content)
    except Exception as e:
        sys.stderr.write(f"Python crawler error: {str(e)}")
        sys.exit(1)

if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.stderr.write("Usage: python crawler.py <url>")
        sys.exit(1)
    
    fetch_url(sys.argv[1])
