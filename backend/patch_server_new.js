const fs = require('fs');
const path = require('path');
const serverPath = path.join(__dirname, 'src', 'server.ts');
let content = fs.readFileSync(serverPath, 'utf8');

const newVerifyLogic = `  // Secure Payment Verification
  app.post('/api/payments/verify', requireAuth, async (req, res) => {
    try {
      const { transactionId } = req.body;
      const userId = getUserId(req);

      if (!transactionId || transactionId.trim().length < 5) {
        return res.status(400).json({ error: 'Invalid transaction ID format.' });
      }

      const { data: existingPayment } = await supabase
        .from('payments')
        .select('id')
        .eq('razorpayOrderId', transactionId)
        .maybeSingle();

      if (existingPayment) return res.status(400).json({ error: 'Transaction ID already submitted.' });

      await supabase.from('payments').insert([{
        userId: userId,
        amount: 0,
        planType: 'MONTHLY',
        razorpayOrderId: transactionId,
        status: 'PENDING'
      }]);

      console.log('PENDING', \`Payment verification submitted for user \${userId} with transaction \${transactionId}\`);
      res.json({ message: 'Verification request sent! An admin will approve your account shortly.', pending: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Admin Endpoints
  const ADMIN_UID = '3a26b2d8-dfbf-41bd-af80-d16cd6e6546c';

  app.get('/api/admin/payments', requireAuth, async (req, res) => {
    try {
      if (getUserId(req) !== ADMIN_UID) return res.status(403).json({ error: 'Forbidden' });
      
      const { data, error } = await supabase
        .from('payments')
        .select('*, app_users(email)')
        .eq('status', 'PENDING')
        .order('createdAt', { ascending: false });
        
      if (error) throw error;
      res.json({ payments: data });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/admin/payments/approve', requireAuth, async (req, res) => {
    try {
      if (getUserId(req) !== ADMIN_UID) return res.status(403).json({ error: 'Forbidden' });
      
      const { paymentId, planType } = req.body;
      
      const { data: payment } = await supabase.from('payments').select('*').eq('id', paymentId).single();
      if (!payment) return res.status(404).json({ error: 'Payment not found' });

      const plan = planType || payment.planType || 'MONTHLY';
      const days = plan === 'WEEKLY' ? 7 : plan === 'MONTHLY' ? 30 : plan === 'TWO_MONTH' ? 60 : 90;
      const quotas = {
        WEEKLY: { r: 10, h: 10, o: 10 },
        MONTHLY: { r: 15, h: 15, o: 15 },
        TWO_MONTH: { r: 25, h: 25, o: 25 },
        THREE_MONTH: { r: 35, h: 35, o: 35 }
      }[plan] || { r: 10, h: 10, o: 10 };
      
      await supabase.from('subscriptions').upsert({
        userId: payment.userId,
        planType: plan,
        status: 'ACTIVE',
        cycleStart: new Date().toISOString(),
        cycleEnd: new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString(),
        jobs_remote_count: quotas.r,
        jobs_hybrid_count: quotas.h,
        jobs_onsite_count: quotas.o
      });

      await supabase.from('payments').update({ status: 'COMPLETED', planType: plan }).eq('id', paymentId);
      res.json({ message: 'Payment approved successfully!' });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/admin/payments/reject', requireAuth, async (req, res) => {
    try {
      if (getUserId(req) !== ADMIN_UID) return res.status(403).json({ error: 'Forbidden' });
      const { paymentId } = req.body;
      await supabase.from('payments').update({ status: 'FAILED' }).eq('id', paymentId);
      res.json({ message: 'Payment rejected.' });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.listen(PORT, () => {`;

const regex = /app\.post\('\/api\/payments\/verify'[\s\S]*?app\.listen\(PORT,\s*\(\)\s*=>\s*\{/m;
content = content.replace(regex, newVerifyLogic);

fs.writeFileSync(serverPath, content, 'utf8');
console.log('Successfully updated server.ts!');
