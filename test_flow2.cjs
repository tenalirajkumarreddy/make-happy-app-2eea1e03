const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.log("Missing Supabase credentials in .env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  console.log("Testing stock transfer visibility...");
  
  const { data: agentProfile } = await supabase.from('profiles').select('*').eq('phone', '+919879879870').single();
  console.log("Agent:", agentProfile?.id, agentProfile?.full_name);
  
  const { data: operatorProfile } = await supabase.from('profiles').select('*').eq('phone', '+918888888888').single();
  console.log("Operator:", operatorProfile?.id, operatorProfile?.full_name);

  if (!agentProfile || !operatorProfile) return console.log("Missing users");

  const { data: operatorRoles } = await supabase.from('user_roles').select('*').eq('user_id', operatorProfile.id);
  const operatorWarehouse = operatorRoles?.[0]?.warehouse_id;
  console.log("Operator Warehouse:", operatorWarehouse);

  const { data: transfers } = await supabase.from('stock_transfers').select('*').order('created_at', {ascending: false}).limit(5);
  console.log("Recent Transfers:", transfers?.map(t => ({
    id: t.id, type: t.transfer_type, from_w: t.from_warehouse_id, to_u: t.to_user_id, status: t.status
  })));
  
  const { data: opTransfers } = await supabase.from('stock_transfers').select('*')
    .or(`from_user_id.eq.${operatorProfile.id},to_user_id.eq.${operatorProfile.id},from_warehouse_id.eq.${operatorWarehouse},to_warehouse_id.eq.${operatorWarehouse}`);
  console.log("Operator can see count:", opTransfers?.length);

  const { data: agentTransfers } = await supabase.from('stock_transfers').select('*')
    .or(`from_user_id.eq.${agentProfile.id},to_user_id.eq.${agentProfile.id}`);
  console.log("Agent can see count:", agentTransfers?.length);

  const { data: agentNotifs } = await supabase.from('notifications').select('*').eq('user_id', agentProfile.id).order('created_at', {ascending: false}).limit(3);
  console.log("Agent Notifications:", agentNotifs?.map(n => ({title: n.title, msg: n.message})));

  const { data: operatorNotifs } = await supabase.from('notifications').select('*').eq('user_id', operatorProfile.id).order('created_at', {ascending: false}).limit(3);
  console.log("Operator Notifications:", operatorNotifs?.map(n => ({title: n.title, msg: n.message})));
}

run();
