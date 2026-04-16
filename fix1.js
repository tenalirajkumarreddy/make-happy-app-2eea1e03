
const fs = require('fs');

function fixDisplayId() {
  const file = 'src/hooks/inventory/useWarehouseStock.ts';
  let code = fs.readFileSync(file, 'utf8');
  
  if(code.includes('display_id: \STF-\\')) {
      code = code.replace(
        /const \{ data: transferData.*from\(\
stock_transfers\\)\s*\.insert\(\{/,
        \const { data: generatedDisplayId } = await supabase.rpc('generate_display_id', { prefix: 'STF', seq_name: 'stf_display_seq' });\n      const { data: transferData, error: transferError } = await supabase\\n        .from(\\\stock_transfers\\\)\\n        .insert({\
      );
      code = code.replace(
        /display_id: \STF-\\\$\{Date.now\(\)\}\,/,
        \display_id: generatedDisplayId ; \\\STF-\\\\\\,\
      );
      fs.writeFileSync(file, code);
      console.log('Fixed useWarehouseStock.ts');
  }
}
fixDisplayId();

