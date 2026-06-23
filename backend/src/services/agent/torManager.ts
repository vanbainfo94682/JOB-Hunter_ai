import { spawn, ChildProcess } from 'child_process';
// @ts-ignore
import { SocksProxyAgent } from 'socks-proxy-agent';
import * as fs from 'fs';
import * as net from 'net';
import * as os from 'os';
import * as path from 'path';

export class TORManager {
  private torProcess: ChildProcess | null = null;
  public isReady: boolean = false;
  private controlPort: number = 9051;
  private socksPort: number = 9050;

  async startTOR(): Promise<boolean> {
    try {
      const tempDir = os.tmpdir();
      const torrcPath = path.join(tempDir, 'torrc_scraping');
      
      const torrc = `
ControlPort ${this.controlPort}
SocksPort ${this.socksPort}
NewCircuitPeriod 60
MaxCircuitDirtiness 30
NumEntryGuards 1
      `;
      
      fs.writeFileSync(torrcPath, torrc.trim());
      
      // On Windows, expect tor.exe to be in PATH, or tor
      const command = os.platform() === 'win32' ? 'tor.exe' : 'tor';
      
      this.torProcess = spawn(command, ['-f', torrcPath], {
        stdio: 'pipe'
      });
      
      return new Promise((resolve) => {
        const timeout = setTimeout(() => {
            console.log('[TOR] Timeout waiting for Tor to bootstrap.');
            resolve(false);
        }, 30000);

        this.torProcess?.stdout?.on('data', (data) => {
          const out = data.toString();
          if (out.includes('Bootstrapped 100%')) {
            clearTimeout(timeout);
            this.isReady = true;
            console.log('[TOR] Network Bootstrapped and Ready.');
            resolve(true);
          }
        });

        this.torProcess?.on('error', (err) => {
          clearTimeout(timeout);
          console.log('[TOR] Failed to start Tor executable. Is it installed?', err.message);
          resolve(false);
        });
      });
    } catch (e) {
      console.log('[TOR] Exception starting Tor:', e);
      return false;
    }
  }

  async requestNewIdentity(): Promise<boolean> {
    if (!this.isReady) return false;
    
    return new Promise((resolve) => {
      const client = new net.Socket();
      client.connect(this.controlPort, '127.0.0.1', () => {
        client.write('AUTHENTICATE ""\r\n');
        client.write('SIGNAL NEWNYM\r\n');
      });
      
      client.on('data', (data) => {
        if (data.toString().includes('250 OK')) {
          // Disconnect after successful signal
          client.destroy();
        }
      });
      
      client.on('close', () => {
         // Wait for new circuit to establish
         setTimeout(() => resolve(true), 3000);
      });

      client.on('error', () => {
          resolve(false);
      });
    });
  }

  getProxyUrl(): string {
    return `socks5://127.0.0.1:${this.socksPort}`;
  }
}

export const torManager = new TORManager();
