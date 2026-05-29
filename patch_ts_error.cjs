const fs = require('fs');
const path = require('path');
const serverPath = path.join(__dirname, 'src', 'server.ts');
let content = fs.readFileSync(serverPath, 'utf8');

const target = `const quotas = {
        WEEKLY: { r: 10, h: 10, o: 10 },
        MONTHLY: { r: 15, h: 15, o: 15 },
        TWO_MONTH: { r: 25, h: 25, o: 25 },
        THREE_MONTH: { r: 35, h: 35, o: 35 }
      }[plan] || { r: 10, h: 10, o: 10 };`;

const replacement = `const quotas = ({
        WEEKLY: { r: 10, h: 10, o: 10 },
        MONTHLY: { r: 15, h: 15, o: 15 },
        TWO_MONTH: { r: 25, h: 25, o: 25 },
        THREE_MONTH: { r: 35, h: 35, o: 35 }
      } as Record<string, { r: number, h: number, o: number }>)[plan] || { r: 10, h: 10, o: 10 };`;

// Replace all occurrences
content = content.split(target).join(replacement);

fs.writeFileSync(serverPath, content, 'utf8');
console.log('Successfully fixed TypeScript error!');
