const fs = require('fs');
let s = fs.readFileSync('src/services/subscriptionService.ts', 'utf8');

// The function arguments should be camelCase in TypeScript
s = s.replace(/user_id: string/g, 'userId: string');
s = s.replace(/plan_type: PlanType/g, 'planType: PlanType');
s = s.replace(/plan_type ===/g, 'planType ===');
s = s.replace(/plan_type \?/g, 'planType ?');
s = s.replace(/plan_type\]/g, 'planType]');
s = s.replace(/\(plan_type\)/g, '(planType)');
s = s.replace(/plan_type,/g, 'planType,');
s = s.replace(/plan_type\|/g, 'planType|');
s = s.replace(/const plan_type/g, 'const planType');

// The Supabase inserts need to map camelCase variables to snake_case column names
// like { user_id: userId, plan_type: planType }
s = s.replace(/user_id: user_id/g, 'user_id: userId');
s = s.replace(/plan_type: plan_type/g, 'plan_type: planType');

// In server.ts
let c = fs.readFileSync('src/server.ts', 'utf8');
c = c.replace(/userId: string/g, 'userId: string');

fs.writeFileSync('src/services/subscriptionService.ts', s);
fs.writeFileSync('src/server.ts', c);
console.log('Fixed TS variables');
