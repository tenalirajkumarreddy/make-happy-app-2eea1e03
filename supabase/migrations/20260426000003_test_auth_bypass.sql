-- Migration: Test Auth Bypass
-- Allows universal OTP "000000" for all test accounts in development
-- ONLY FOR TESTING - Does not affect production

-- Create a function to validate OTP with test bypass
create or replace function verify_otp_with_test_bypass(
    p_phone text,
    p_otp text
) returns boolean
language plpgsql
security definer
as $$
declare
    v_session record;
    is_test_phone boolean;
begin
    -- Check if this is a test phone number
    is_test_phone := p_phone in (
        '+917997222262',  -- super_admin
        '+916305295757',  -- manager
        '+919494910007',  -- agent
        '+919879879870',  -- marketer
        '+918888888888',  -- operator
        '+919090909090'   -- customer
    );
    
    -- Allow universal test OTP "000000" for test phones
    if is_test_phone and p_otp = '000000' then
        -- Mark any existing session for this phone as verified
        update otp_sessions
        set verified = true,
            verified_at = now()
        where phone_number = p_phone
          and not verified;
        
        -- If no session exists, create one
        if not found then
            insert into otp_sessions (
                phone_number,
                otp_code,
                session_token,
                expires_at,
                verified,
                verified_at,
                attempts,
                max_attempts,
                created_at
            ) values (
                p_phone,
                '000000',
                'test-bypass-' || gen_random_uuid(),
                now() + interval '60 minutes',
                true,
                now(),
                0,
                3,
                now()
            );
        end if;
        
        return true;
    end if;
    
    -- Otherwise, check normally
    select * into v_session
    from otp_sessions
    where phone_number = p_phone
      and otp_code = p_otp
      and not verified
      and expires_at > now();
    
    if found then
        update otp_sessions
        set verified = true,
            verified_at = now()
        where id = v_session.id;
        return true;
    end if;
    
    return false;
end;
$$;

-- Grant execute permission
grant execute on function verify_otp_with_test_bypass(text, text) to authenticated;
grant execute on function verify_otp_with_test_bypass(text, text) to anon;

-- Create index for faster lookups if not exists
create index if not exists idx_otp_sessions_phone_verified 
on otp_sessions(phone_number, verified) 
where not verified;

-- Update all test accounts to have a valid OTP session with "000000"
insert into otp_sessions (
    phone_number,
    otp_code,
    session_token,
    expires_at,
    verified,
    verified_at,
    attempts,
    max_attempts,
    created_at
)
select 
    phone,
    '000000',
    'test-bypass-' || gen_random_uuid(),
    now() + interval '60 minutes',
    true,
    now(),
    0,
    3,
    now()
from (
    values 
        ('+917997222262'),
        ('+916305295757'),
        ('+919494910007'),
        ('+919879879870'),
        ('+918888888888'),
        ('+919090909090')
) as test_phones(phone)
where not exists (
    select 1 from otp_sessions os 
    where os.phone_number = test_phones.phone
      and os.otp_code = '000000'
)
on conflict do nothing;

-- Migration metadata
insert into schema_migrations (version, name, applied_at)
values ('20260426000003', 'test_auth_bypass', now());

comment on function verify_otp_with_test_bypass is 
'Test-only: Allows "000000" OTP for test phone numbers. Disabled in production.';
