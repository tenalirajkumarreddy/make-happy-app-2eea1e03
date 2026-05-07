const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://vrhptrtgrpftycvojaqo.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZyaHB0cnRncnBmdHljdm9qYXFvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxMTg5ODMsImV4cCI6MjA4ODY5NDk4M30.ek7gNnoghGYYNrdZr-BttzRn6xY0aVqGU31pVcQ67mU'
);

async function run() {
  // Test products fetch from staff_stock
  const { data, error } = await supabase
    .from('staff_stock')
    .select('product_id, quantity, warehouse_id, product:products(id, name, sku, unit, base_price)')
    .limit(5);
    
  if (error) {
    console.error('Error fetching staff_stock:', error);
  } else {
    console.log('staff_stock:', data);
  }

  // Test from warehouse
  const { data: wData, error: wError } = await supabase
    .from('product_stock')
    .select('product_id, quantity, product:products(id, name, sku, unit, base_price)')
    .limit(5);

  if (wError) {
    console.error('Error fetching product_stock:', wError);
  } else {
    console.log('product_stock:', wData);
  }
}

run();
