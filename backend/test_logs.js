const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('https://xzndofdchhvzifuivroi.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh6bmRvZmRjaGh2emlmdWl2cm9pIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTYwMTIzMCwiZXhwIjoyMDk1MTc3MjMwfQ.AR4nqMuxFwDm9zCzjqdcJ-B6hFicwfTiEiwE0f5mDX0');
async function run() {
  const { data, error } = await supabase.from('system_logs').select('*').order('timestamp', { ascending: false }).limit(100);
  console.log('Error:', error);
  console.log('Data:', data?.length);
}
run();
