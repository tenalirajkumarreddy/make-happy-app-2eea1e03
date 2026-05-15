import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://vrhptrtgrpftycvojaqo.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZyaHB0cnRncnBmdHljdm9qYXFvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxMTg5ODMsImV4cCI6MjA4ODY5NDk4M30.ek7gNnoghGYYNrdZr-BttzRn6xY0aVqGU31pVcQ67mU';
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const tables = ['product_stock', 'products', 'staff_stock'];
  
  for (const table of tables) {
    console.log(`Checking ${table}...`);
    const { data, error } = await supabase.from(table).select('*').limit(1);
    if (error) {
      console.log(`Error on ${table}:`, error.message);
    } else {
      console.log(`Success on ${table}: has ${data.length} rows (limit 1)`);
    }
  }
}

check();
