import sys
import json
import re
from bs4 import BeautifulSoup
from curl_cffi import requests

def scrape_jobs(url):
    try:
        # Impersonate Chrome to bypass basic anti-bot protections
        response = requests.get(url, impersonate="chrome110", timeout=15)
        response.raise_for_status()
        
        soup = BeautifulSoup(response.content, 'html.parser')
        
        # Strip script and style tags
        for script in soup(["script", "style", "noscript", "header", "footer"]):
            script.extract()
            
        jobs = []
        seen_urls = set()
        
        # Look for links that might be job postings
        # Typical job link indicators in href or text
        job_keywords = ['job', 'career', 'role', 'position', 'opening', 'engineer', 'developer', 'manager', 'analyst', 'designer']
        
        for a_tag in soup.find_all('a', href=True):
            href = a_tag['href']
            text = a_tag.get_text(separator=' ', strip=True)
            
            # Skip empty links
            if not text or len(text) < 5:
                continue
                
            href_lower = href.lower()
            text_lower = text.lower()
            
            # Simple heuristic: Does the URL or text look like a job listing?
            is_job = any(kw in href_lower for kw in ['/job', '/role', '/career', '/position', '/req']) or \
                     any(kw in text_lower for kw in job_keywords)
                     
            if is_job:
                # Resolve relative URLs
                if href.startswith('/'):
                    from urllib.parse import urljoin
                    href = urljoin(url, href)
                    
                if href not in seen_urls and href.startswith('http'):
                    seen_urls.add(href)
                    jobs.append({
                        "title": text,
                        "url": href,
                        "company": "Extracted Company", # Will be mapped by the caller
                        "location": "Remote/Onsite",
                        "description": text # Initial description is just the title for matching
                    })
                    
        print(json.dumps({"success": True, "jobs": jobs}))
        
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))
        sys.exit(1)

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"success": False, "error": "No URL provided"}))
        sys.exit(1)
        
    url = sys.argv[1]
    scrape_jobs(url)
