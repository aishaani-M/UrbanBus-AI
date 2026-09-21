import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://pvinhxlbplnxqtwokcmb.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB2aW5oeGxicGxueHF0d29rY21iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk5MDM2MTAsImV4cCI6MjEwNTQ3OTYxMH0.nMAjUU63KojZfOBGaICJIR-BwVAmLFDKS6Jqx1cDGiw';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
