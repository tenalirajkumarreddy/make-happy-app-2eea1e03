import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

function loadEnvFromFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const raw = fs.readFileSync(filePath, 'utf8');
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const idx = trimmed.indexOf('=');
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

const root = process.cwd();
loadEnvFromFile(path.join(root, '.env'));
loadEnvFromFile(path.join(root, '.env.local'));

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env.');
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const TEST_USERS = [
  {
    role: 'manager',
    email: 'test-manager@test.aquaprime.app',
    password: 'TestManagerPass!',
    fullName: 'Test Manager',
    phone: '+919900000001',
  },
  {
    role: 'agent',
    email: 'test-agent1@test.aquaprime.app',
    password: 'TestAgent1Password!',
    fullName: 'Test Agent 1',
    phone: '+919900000002',
  },
  {
    role: 'marketer',
    email: 'test-marketer@test.aquaprime.app',
    password: 'TestMarketerPass!',
    fullName: 'Test Marketer',
    phone: '+919900000003',
  },
  {
    role: 'pos',
    email: 'test-pos@test.aquaprime.app',
    password: 'TestPosPass!',
    fullName: 'Test POS',
    phone: '+919900000004',
  },
  {
    role: 'customer',
    email: 'test-customer1@test.aquaprime.app',
    password: 'TestCustomer1Pass!',
    fullName: 'Test Customer 1',
    phone: '+919900000005',
  },
];

async function findUserByEmail(email) {
  let page = 1;
  const perPage = 200;

  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const users = data?.users ?? [];
    const found = users.find((u) => (u.email || '').toLowerCase() === email.toLowerCase());
    if (found) return found;
    if (users.length < perPage) return null;
    page += 1;
  }
}

async function ensureAuthUser(user) {
  const existing = await findUserByEmail(user.email);
  if (existing) {
    const { error: updateError } = await admin.auth.admin.updateUserById(existing.id, {
      password: user.password,
      email_confirm: true,
      user_metadata: { full_name: user.fullName },
    });
    if (updateError) throw updateError;
    return existing.id;
  }

  const { data, error } = await admin.auth.admin.createUser({
    email: user.email,
    password: user.password,
    email_confirm: true,
    user_metadata: { full_name: user.fullName },
  });

  if (error) throw error;
  return data.user.id;
}

async function ensureProfile(userId, user) {
  const payload = {
    user_id: userId,
    full_name: user.fullName,
    email: user.email,
    phone: user.phone,
    is_active: true,
  };

  const { error } = await admin.from('profiles').upsert(payload, { onConflict: 'user_id' });
  if (error) throw error;
}

async function ensureRole(userId, role) {
  const { error } = await admin.from('user_roles').upsert(
    {
      user_id: userId,
      role,
    },
    { onConflict: 'user_id' }
  );
  if (error) throw error;
}

async function ensureStaffDirectory(userId, user) {
  const { data: existing, error: readError } = await admin
    .from('staff_directory')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();
  if (readError) throw readError;

  const payload = {
    user_id: userId,
    full_name: user.fullName,
    email: user.email,
    phone: user.phone,
    role: user.role,
    is_active: true,
  };

  if (existing?.id) {
    const { error: updateError } = await admin.from('staff_directory').update(payload).eq('id', existing.id);
    if (updateError) throw updateError;
  } else {
    const { error: insertError } = await admin.from('staff_directory').insert(payload);
    if (insertError) throw insertError;
  }
}

async function ensureCustomer(userId, user) {
  const { data: existing, error: readError } = await admin
    .from('customers')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();
  if (readError) throw readError;

  const payload = {
    user_id: userId,
    name: user.fullName,
    phone: user.phone,
    email: user.email,
    is_active: true,
  };

  if (existing?.id) {
    const { error: updateError } = await admin.from('customers').update(payload).eq('id', existing.id);
    if (updateError) throw updateError;
  } else {
    const { error: insertError } = await admin.from('customers').insert(payload);
    if (insertError) throw insertError;
  }
}

async function main() {
  console.log('Creating role-based test users...');

  for (const user of TEST_USERS) {
    const userId = await ensureAuthUser(user);
    await ensureProfile(userId, user);
    await ensureRole(userId, user.role);

    if (user.role === 'customer') {
      await ensureCustomer(userId, user);
    } else {
      await ensureStaffDirectory(userId, user);
    }

    console.log(`- ready: ${user.role.padEnd(8)} ${user.email}`);
  }

  console.log('\nCredentials ready:');
  console.log('super_admin: use your existing credentials');
  for (const user of TEST_USERS) {
    console.log(`${user.role.padEnd(8)} ${user.email} / ${user.password}`);
  }
}

main().catch((error) => {
  console.error('Failed to create test users:', error.message || error);
  process.exit(1);
});
