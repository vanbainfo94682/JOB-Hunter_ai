const dotenv = require('dotenv');
dotenv.config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkSchema() {
  // Let's just fetch one user_profile and one payment to see the keys
  const { data: profile } = await supabase.from('user_profiles').select('*').limit(1);
  console.log('User Profile schema sample:', profile);

  const { data: payment } = await supabase.from('payments').select('*').limit(1);
  console.log('Payment schema sample:', payment);
}

checkSchema();
