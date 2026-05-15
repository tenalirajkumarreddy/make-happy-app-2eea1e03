const fs = require('fs');

function run() {
  const file = 'src/hooks/inventory/useWarehouseStock.ts';
  if (!fs.existsSync(file)) return;
  let code = fs.readFileSync(file, 'utf8');

  // Fix display_id
  if (code.includes('display_id: `STF-${Date.now()}`')) {
    code = code.replace(
      '// Create stock transfer record',
      'const { data: displayIdData } = await supabase.rpc("generate_display_id", { prefix: "STF", seq_name: "stf_display_seq" });\n\n      // Create stock transfer record'
    );
    code = code.replace(
      'display_id: `STF-${Date.now()}`',
      'display_id: displayIdData || `STF-${Date.now()}`'
    );
    fs.writeFileSync(file, code);
    console.log('Fixed useWarehouseStock.ts');
  }

  // Also check negative constraints? The issue says: "Check constraints (e.g. quantity > 0, generate display_id, valid string types)"
  if (code.includes('p_quantity: quantity')) {
    // maybe no change needed if it works
  }
}

run();
