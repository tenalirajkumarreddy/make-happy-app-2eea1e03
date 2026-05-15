const fs = require('fs');
const path = require('path');

const dirPath = path.join(__dirname, 'supabase/functions/attendance-reminder');

fs.mkdirSync(dirPath, { recursive: true });
console.log(`Created directory: ${dirPath}`);

// Create index.ts
const indexPath = path.join(dirPath, 'index.ts');
const indexContent = `import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey)

    console.log('Attendance reminder function invoked')

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Attendance reminder processed'
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )

  } catch (error) {
    console.error('Function error:', error)

    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})
`;

fs.writeFileSync(indexPath, indexContent);
console.log(`Created file: ${indexPath}`);
console.log('Setup complete!');
