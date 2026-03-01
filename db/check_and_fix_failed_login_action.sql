-- Check and fix 'failed_login' action type in activity_logs table
-- Run this in your Neon database console

-- First, check current constraint
SELECT 
    conname AS constraint_name,
    pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint
WHERE conrelid = 'activity_logs'::regclass
  AND contype = 'c'
  AND conname LIKE '%action%';

-- Drop the existing CHECK constraint (if it exists)
ALTER TABLE activity_logs 
DROP CONSTRAINT IF EXISTS activity_logs_action_check;

-- Add the new CHECK constraint with 'failed_login' included
ALTER TABLE activity_logs 
ADD CONSTRAINT activity_logs_action_check 
CHECK (action IN ('signin', 'signout', 'user_added', 'user_removed', 'user_updated', 'failed_login'));

-- Verify the constraint was added
SELECT 
    conname AS constraint_name,
    pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint
WHERE conrelid = 'activity_logs'::regclass
  AND contype = 'c'
  AND conname LIKE '%action%';

