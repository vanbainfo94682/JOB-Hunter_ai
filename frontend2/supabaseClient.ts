import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://xzndofdchhvzifuivroi.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh6bmRvZmRjaGh2emlmdWl2cm9pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2MDEyMzAsImV4cCI6MjA5NTE3NzIzMH0.aV4duR8Y6jo1XaXbc5lfhRf1f7usrXzVVEZ-qnAfnzY";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
export const ADMIN_UID = "3a26b2d8-dfbf-41bd-af80-d16cd6e6546c";
