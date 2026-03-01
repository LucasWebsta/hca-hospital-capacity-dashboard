-- Add 'failed_login' action type to activity_logs table
-- Run this in your Neon database console

-- First, drop the existing CHECK constraint
ALTER TABLE activity_logs 
DROP CONSTRAINT IF EXISTS activity_logs_action_check;

-- Add the new CHECK constraint with 'failed_login' included
ALTER TABLE activity_logs 
ADD CONSTRAINT activity_logs_action_check 
CHECK (action IN ('signin', 'signout', 'user_added', 'user_removed', 'user_updated', 'failed_login'));

