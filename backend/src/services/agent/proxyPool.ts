import axios from 'axios';
import * as cheerio from 'cheerio';
// @ts-ignore
import { SocksProxyAgent } from 'socks-proxy-agent';
// @ts-ignore
import { HttpsProxyAgent } from 'https-proxy-agent';

export interface ProxyItem {
  ip: string;
  port: number;
  speed: number;
  type: string;
}

export class FreeProxyPool {
  private proxies: ProxyItem[] = [];
  private blacklistedIPs: Set<string> = new Set();
  private lastRefreshed: number = 0;

  async refreshPool(): Promise<void> {
    const allProxies = new Set<string>();

    try {
      // Source 1: ProxyScrape (free, 100 rotating proxies)
      const proxyScrape = await axios.get('https://api.proxyscrape.com/v2/?request=getproxies&protocol=http&timeout=10000&country=all&ssl=all&anonymity=all');
      const scrapeProxies = proxyScrape.data.split('\r\n').filter(Boolean);
      scrapeProxies.forEach((p: string) => allProxies.add(p));
    } catch (e) {
      console.warn('[ProxyPool] Failed to fetch ProxyScrape', e);
    }
    
    try {
      // Source 2: Free Proxy List
      const freeProxyList = await axios.get('https://free-proxy-list.net/');
      const $ = cheerio.load(freeProxyList.data);
      $('table.table tbody tr').each((i, el) => {
        const ip = $(el).find('td').eq(0).text();
        const port = $(el).find('td').eq(1).text();
        if (ip && port) allProxies.add(`${ip}:${port}`);
      });
    } catch (e) {
      console.warn('[ProxyPool] Failed to fetch Free Proxy List', e);
    }
    
    // Test each proxy (async, with timeout)
    const candidates = Array.from(allProxies).slice(0, 100);
    const tested = await Promise.allSettled(
      candidates.map(async (proxy) => {
        const [ip, port] = proxy.split(':');
        const testResult = await this.testProxy(ip, parseInt(port));
        if (testResult.working) {
          return { ip, port: parseInt(port), speed: testResult.speed, type: testResult.type };
        }
        return null;
      })
    );
    
    this.proxies = tested
      .filter(r => r.status === 'fulfilled' && r.value !== null)
      .map(r => (r as PromiseFulfilledResult<ProxyItem>).value);
    
    this.lastRefreshed = Date.now();
    console.log(`[ProxyPool] Found ${this.proxies.length} working proxies`);
  }

  async getProxy(): Promise<string | null> {
    // Refresh if pool is stale (>15 min)
    if (Date.now() - this.lastRefreshed > 900000 || this.proxies.length < 3) {
      await this.refreshPool();
    }
    
    // Pick random non-blacklisted proxy
    const available = this.proxies.filter(p => !this.blacklistedIPs.has(p.ip));
    if (available.length === 0) return null;
    
    const proxy = available[Math.floor(Math.random() * available.length)];
    return `${proxy.ip}:${proxy.port}`;
  }

  private async testProxy(ip: string, port: number): Promise<{ working: boolean; speed: number; type: string }> {
    const start = Date.now();
    try {
      await axios.get('http://httpbin.org/ip', {
        proxy: { host: ip, port },
        timeout: 4000
      });
      return { working: true, speed: Date.now() - start, type: 'http' };
    } catch {
      // Try SOCKS5
      try {
        const agent = new SocksProxyAgent(`socks5://${ip}:${port}`);
        await axios.get('http://httpbin.org/ip', {
          httpAgent: agent,
          timeout: 4000
        });
        return { working: true, speed: Date.now() - start, type: 'socks5' };
      } catch {
        return { working: false, speed: 99999, type: '' };
      }
    }
  }

  markBlacklisted(ip: string): void {
    this.blacklistedIPs.add(ip);
    if (this.blacklistedIPs.size > 500) this.blacklistedIPs.clear(); // Prevent memory leak
  }
}

export const proxyPool = new FreeProxyPool();
