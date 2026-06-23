require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  const { data, error } = await supabase.from('jobs').select('id, status, hr_email');
  if(error) { console.error('Error:', error); return; }
  console.log('Total jobs:', data.length);
  console.log('Queued:', data.filter(j => j.status === 'QUEUED').length);
  console.log('Applied:', data.filter(j => j.status === 'APPLIED').length);
  console.log('With HR Email:', data.filter(j => j.hr_email).length);
}
check();
