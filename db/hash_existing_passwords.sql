-- Migration script to hash existing plain text passwords
-- Run this script ONCE to convert all plain text passwords to bcrypt hashes
-- 
-- IMPORTANT: This script requires Node.js bcrypt. Run it using a Node.js script, not directly in SQL.
-- See hash_existing_passwords.js for the actual migration script.

-- This SQL file documents the migration process.
-- The actual migration should be done via Node.js to use bcrypt library.

-- After running the migration:
-- 1. All new passwords will be automatically hashed
-- 2. Existing passwords will be hashed
-- 3. Login will work with both hashed and plain text (during transition)
-- 4. Once all passwords are hashed, you can remove plain text support

