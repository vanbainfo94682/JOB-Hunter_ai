const fs = require('fs');
const path = require('path');
const serverPath = path.join(__dirname, 'src', 'server.ts');
let content = fs.readFileSync(serverPath, 'utf8');

const newApis = `  // ==========================================
  // SYSTEM & MAINTENANCE APIs
  // ==========================================
  app.get('/api/system/status', async (req, res) => {
    try {
      const { data } = await supabase.from('system_config').select('*').eq('key', 'maintenanceMode').maybeSingle();
      res.json({ maintenanceMode: data?.value === 'true' });
    } catch (error: any) {
      res.json({ maintenanceMode: false });
    }
  });

  app.post('/api/admin/system/config', requireAuth, async (req, res) => {
    try {
      if (getUserId(req) !== ADMIN_UID) return res.status(403).json({ error: 'Forbidden' });
      const { key, value } = req.body;
      await supabase.from('system_config').upsert({ key, value, updatedAt: new Date().toISOString() });
      res.json({ message: 'Configuration updated successfully' });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/admin/users', requireAuth, async (req, res) => {
    try {
      if (getUserId(req) !== ADMIN_UID) return res.status(403).json({ error: 'Forbidden' });
      
      const { data: users, error } = await supabase
        .from('app_users')
        .select('*, subscriptions(*), user_profiles(*)');
        
      if (error) throw error;
      res.json({ users });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/admin/users/plan', requireAuth, async (req, res) => {
    try {
      if (getUserId(req) !== ADMIN_UID) return res.status(403).json({ error: 'Forbidden' });
      
      const { userId, planType } = req.body;
      const plan = planType || 'MONTHLY';
      const days = plan === 'WEEKLY' ? 7 : plan === 'MONTHLY' ? 30 : plan === 'TWO_MONTH' ? 60 : 90;
      const quotas = {
        WEEKLY: { r: 10, h: 10, o: 10 },
        MONTHLY: { r: 15, h: 15, o: 15 },
        TWO_MONTH: { r: 25, h: 25, o: 25 },
        THREE_MONTH: { r: 35, h: 35, o: 35 }
      }[plan] || { r: 10, h: 10, o: 10 };
      
      await supabase.from('subscriptions').upsert({
        userId: userId,
        planType: plan,
        status: 'ACTIVE',
        cycleStart: new Date().toISOString(),
        cycleEnd: new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString(),
        jobs_remote_count: quotas.r,
        jobs_hybrid_count: quotas.h,
        jobs_onsite_count: quotas.o
      });

      res.json({ message: 'User plan updated successfully!' });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.listen(PORT, () => {`;

const regex = /app\.listen\(PORT,\s*\(\)\s*=>\s*\{/m;
content = content.replace(regex, newApis);

fs.writeFileSync(serverPath, content, 'utf8');
console.log('Successfully updated server.ts!');
