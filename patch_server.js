const fs = require('fs');
let content = fs.readFileSync('src/server.ts', 'utf8');

// Find the verify endpoint block
const startIdx = content.indexOf('app.post(' + "'/api/payments/verify'");
const endIdx = content.indexOf('app.listen(PORT');

if (startIdx === -1 || endIdx === -1) {
    console.error('Could not find verify endpoint block');
    process.exit(1);
}

const replacement =   // 💳 Secure Payment Verification (Manual Admin Workflow)
  app.post('/api/payments/verify', requireAuth, async (req, res) => {
    try {
      const { transactionId } = req.body;
      const userId = getUserId(req);
  
      // 1. Anti-Replay Check
      const { data: existingPayment } = await supabase
        .from('payments')
        .select('id, status')
        .eq('razorpayOrderId', transactionId)
        .maybeSingle();
  
      if (existingPayment) {
         if (existingPayment.status === 'PENDING') return res.status(400).json({ error: 'This Transaction ID is already pending admin approval.' });
         return res.status(400).json({ error: 'Transaction ID already used.' });
      }
  
      // 2. Add to Pending Approvals
      await supabase.from('payments').insert([{
        userId: userId,
        amount: 0,
        planType: 'MONTHLY',
        razorpayOrderId: transactionId,
        status: 'PENDING'
      }]);
  
      console.log('INFO', \User \ requested manual verification for transaction \\);
      res.json({ message: 'Verification request sent! An admin will approve your account shortly.' });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // 🛡️ Admin API Endpoints for Payment Approval
  const requireAdminAuth = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Missing auth header' });
    const token = authHeader.split(' ')[1];
    const { data: { user }, error } = await supabase.auth.getUser(token);
    const ADMIN_UID = process.env.ADMIN_UID || '3a26b2d8-dfbf-41bd-af80-d16cd6e6546c';
    if (error || !user || user.id !== ADMIN_UID) {
      return res.status(403).json({ error: 'Forbidden: Admin access required' });
    }
    next();
  };

  app.get('/api/admin/payments/pending', requireAdminAuth, async (req, res) => {
    try {
      const { data, error } = await supabase
        .from('payments')
        .select(\
          id,
          razorpayOrderId,
          planType,
          status,
          createdAt,
          user:app_users(email, fullName)
        \)
        .eq('status', 'PENDING')
        .order('createdAt', { ascending: false });

      if (error) throw error;
      res.json(data);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/admin/payments/approve', requireAdminAuth, async (req, res) => {
    try {
      const { paymentId, planType } = req.body;
      
      const { data: payment, error: fetchErr } = await supabase.from('payments').select('*').eq('id', paymentId).single();
      if (fetchErr || !payment) throw new Error('Payment not found');

      const approvedPlan = planType || payment.planType || 'MONTHLY';
      
      const days = approvedPlan === 'WEEKLY' ? 7 : approvedPlan === 'MONTHLY' ? 30 : approvedPlan === 'TWO_MONTH' ? 60 : 90;
      const quotas = {
        WEEKLY: { r: 10, h: 10, o: 10 },
        MONTHLY: { r: 15, h: 15, o: 15 },
        TWO_MONTH: { r: 25, h: 25, o: 25 },
        THREE_MONTH: { r: 35, h: 35, o: 35 }
      }[approvedPlan] || { r: 10, h: 10, o: 10 };
      
      await supabase.from('subscriptions').upsert({
        userId: payment.userId,
        planType: approvedPlan,
        status: 'ACTIVE',
        cycleStart: new Date().toISOString(),
        cycleEnd: new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString(),
        jobs_remote_count: quotas.r,
        jobs_hybrid_count: quotas.h,
        jobs_onsite_count: quotas.o
      });

      await supabase.from('payments').update({ status: 'COMPLETED', planType: approvedPlan }).eq('id', paymentId);
      
      console.log('SUCCESS', \Admin approved payment \ for user \\);
      res.json({ message: 'Payment approved successfully!' });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/admin/payments/reject', requireAdminAuth, async (req, res) => {
    try {
      const { paymentId } = req.body;
      await supabase.from('payments').update({ status: 'FAILED' }).eq('id', paymentId);
      res.json({ message: 'Payment rejected.' });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  ;

const newContent = content.substring(0, startIdx) + replacement + content.substring(endIdx);
fs.writeFileSync('src/server.ts', newContent);
console.log('Successfully updated server.ts');
