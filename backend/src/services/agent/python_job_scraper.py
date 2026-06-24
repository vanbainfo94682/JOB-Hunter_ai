import sys
import json
import re
from bs4 import BeautifulSoup
from curl_cffi import requests
from urllib.parse import urljoin, urlparse

def extract_jobs_from_page(soup, base_url):
    """Generic job extractor that looks for common job listing patterns."""
    jobs = []
    seen_urls = set()
    
    job_keywords = [
        'job', 'career', 'role', 'position', 'opening', 'vacancy', 'hiring',
        'engineer', 'developer', 'manager', 'analyst', 'designer', 'consultant',
        'specialist', 'coordinator', 'director', 'lead', 'architect', 'scientist',
        'tester', 'qa', 'devops', 'admin', 'executive', 'associate', 'intern'
    ]
    
    def add_job(title, href, description=""):
        if not title or len(title.strip()) < 3:
            return
        if href.startswith('/'):
            href = urljoin(base_url, href)
        if not href.startswith('http'):
            href = urljoin(base_url, href)
        # Filter out non-job URLs
        parsed = urlparse(href)
        path_lower = parsed.path.lower()
        if any(skip in path_lower for skip in ['/category/', '/tag/', '/author/', '/page/', '/feed', '.css', '.js', '.png', '.jpg', '.svg']):
            return
        if href in seen_urls:
            return
        seen_urls.add(href)
        
        jobs.append({
            "title": title.strip(),
            "url": href,
            "company": "Extracted Company",
            "location": "Remote/Onsite",
            "description": description or title.strip()
        })
    
    # Strategy 1: Look for JSON-LD structured data (most reliable)
    for script in soup.find_all('script', type='application/ld+json'):
        try:
            data = json.loads(script.string)
            if isinstance(data, dict) and data.get('@type') in ['JobPosting', 'ItemList']:
                items = data.get('itemListElement', [data])
                for item in items:
                    if isinstance(item, dict):
                        job = item.get('item', item)
                        if job.get('@type') == 'JobPosting':
                            title = job.get('title', '')
                            url = job.get('url', '')
                            desc = job.get('description', '') or job.get('qualifications', '') or ''
                            if title:
                                add_job(title, url, desc[:500] if desc else title)
        except (json.JSONDecodeError, AttributeError):
            pass
    
    # Strategy 2: Look for common job listing CSS classes and IDs
    job_selectors = [
        '[class*="job-desc"]', '[class*="job-list"]', '[class*="job-results"]',
        '[class*="job-listing"]', '[class*="job-posting"]', '[class*="job-card"]',
        '[class*="position"]', '[class*="opening"]', '[class*="vacancy"]',
        '[id*="job-desc"]', '[id*="job-list"]', '[id*="job-results"]',
        '[id*="job-listing"]', '[id*="job-posting"]', '[id*="job-card"]',
        '.search-results', '.job-results', '.career-list', '.career-opportunities',
        '.open-positions', '.current-openings', '.job-openings'
    ]
    
    for selector in job_selectors:
        try:
            containers = soup.select(selector)
            for container in containers:
                for a_tag in container.find_all('a', href=True):
                    text = a_tag.get_text(separator=' ', strip=True)
                    if text and len(text) > 5:
                        add_job(text, a_tag['href'], text)
        except Exception:
            continue
    
    # Strategy 3: Generic link scraping with job keyword matching
    for a_tag in soup.find_all('a', href=True):
        href = a_tag['href']
        text = a_tag.get_text(separator=' ', strip=True)
        
        if not text or len(text) < 5:
            continue
            
        href_lower = href.lower()
        text_lower = text.lower()
        
        is_job = (
            any(kw in href_lower for kw in ['/job', '/role', '/career', '/position', '/req', '/opening', '/vacancy']) or
            any(kw in text_lower for kw in job_keywords)
        )
        
        if is_job:
            add_job(text, href, text)
    
    return jobs

def scrape_jobs(url):
    try:
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Referer': 'https://google.com/',
            'Connection': 'keep-alive'
        }
        response = requests.get(url, impersonate="chrome110", timeout=20, headers=headers)
        response.raise_for_status()
        
        soup = BeautifulSoup(response.content, 'html.parser')
        
        # Strip script/style tags
        for tag in soup(["script", "style", "noscript", "header", "footer", "nav"]):
            tag.extract()
        
        jobs = extract_jobs_from_page(soup, url)
        
        # Deduplicate by URL
        seen = set()
        unique_jobs = []
        for job in jobs:
            if job['url'] not in seen:
                seen.add(job['url'])
                unique_jobs.append(job)
        
        print(json.dumps({"success": True, "jobs": unique_jobs, "count": len(unique_jobs)}))
        
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))
        sys.exit(1)

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"success": False, "error": "No URL provided"}))
        sys.exit(1)
        
    url = sys.argv[1]
    scrape_jobs(url)

