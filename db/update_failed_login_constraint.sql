-- Update activity_logs table to allow 'failed_login' action
-- This script finds and updates the constraint regardless of its name
-- Run this in your Neon database console

-- Step 1: Find the constraint name (for reference)
SELECT 
    conname AS constraint_name,
    pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint
WHERE conrelid = 'activity_logs'::regclass
  AND contype = 'c'
  AND pg_get_constraintdef(oid) LIKE '%action%';

-- Step 2: Drop ALL check constraints on the action column
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN 
        SELECT conname 
        FROM pg_constraint 
        WHERE conrelid = 'activity_logs'::regclass 
          AND contype = 'c'
          AND pg_get_constraintdef(oid) LIKE '%action%'
    LOOP
        EXECUTE 'ALTER TABLE activity_logs DROP CONSTRAINT IF EXISTS ' || quote_ident(r.conname);
        RAISE NOTICE 'Dropped constraint: %', r.conname;
    END LOOP;
END $$;

-- Step 3: Add the new constraint with 'failed_login' included
ALTER TABLE activity_logs 
ADD CONSTRAINT activity_logs_action_check 
CHECK (action IN ('signin', 'signout', 'user_added', 'user_removed', 'user_updated', 'failed_login'));

-- Step 4: Verify the constraint was added
SELECT 
    conname AS constraint_name,
    pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint
WHERE conrelid = 'activity_logs'::regclass
  AND contype = 'c'
  AND conname = 'activity_logs_action_check';

-- Step 5: Test insert (this should work now)
-- Uncomment the line below to test:
-- INSERT INTO activity_logs (user_id, user_name, action, ip_address, user_agent) VALUES (NULL, 'test@example.com:password123', 'failed_login', '127.0.0.1', 'test');

