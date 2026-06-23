const fs = require('fs');
const path = require('path');
const appPath = path.join(__dirname, 'src', 'App.tsx');
let content = fs.readFileSync(appPath, 'utf8');

const importRegex = /import React, \{ useState, useEffect, useRef \} from 'react';/;
if (!content.includes('AlertTriangle')) {
    content = content.replace(
        /import \{([\s\S]*?)Briefcase,/, 
        "import {\n  AlertTriangle,\n$1Briefcase,"
    );
}

const functionStart = /export default function App\(\) \{/;
const stateBlock = `export default function App() {
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [systemCheckComplete, setSystemCheckComplete] = useState(false);

  useEffect(() => {
    checkSystemStatus();
  }, []);

  async function checkSystemStatus() {
    try {
      const res = await fetch(\`\${API_BASE}/system/status\`);
      if (res.ok) {
        const data = await res.json();
        setMaintenanceMode(data.maintenanceMode);
      }
    } catch (e) {
      console.error('System status check failed', e);
    }
    setSystemCheckComplete(true);
  }

  if (!systemCheckComplete) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#0a0a0a', color: '#fff' }}>
        <Loader2 className="animate-spin text-blue-500" size={48} />
      </div>
    );
  }

  if (maintenanceMode) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#0a0a0a', color: '#fff', fontFamily: 'sans-serif', padding: '20px', textAlign: 'center' }}>
        <div style={{ background: 'rgba(244, 67, 54, 0.1)', padding: '40px', borderRadius: '16px', border: '1px solid rgba(244, 67, 54, 0.3)', maxWidth: '500px' }}>
          <AlertTriangle size={64} color="#f44336" style={{ margin: '0 auto 20px auto', display: 'block' }} />
          <h1 style={{ fontSize: '2rem', marginBottom: '15px' }}>System Under Maintenance</h1>
          <p style={{ color: '#aaa', fontSize: '1.1rem', lineHeight: '1.6' }}>
            We are currently performing scheduled maintenance or critical upgrades to improve your experience. 
            The system will be back online shortly. Thank you for your patience!
          </p>
        </div>
      </div>
    );
  }
`;

content = content.replace(functionStart, stateBlock);

fs.writeFileSync(appPath, content, 'utf8');
console.log('Successfully patched App.tsx!');
