-- Users and Authentication Tables
-- Run this in your Neon database console

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('Administrator', 'Executive Director', 'Manager', 'Analyst', 'Viewer')),
    status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);

-- Activity logs table
CREATE TABLE IF NOT EXISTS activity_logs (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id),
    user_name TEXT NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('signin', 'signout', 'user_added', 'user_removed', 'user_updated')),
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    ip_address TEXT,
    user_agent TEXT
);

CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id ON activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_timestamp ON activity_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_action ON activity_logs(action);

-- Insert default admin user (password: admin123 - in production, use proper password hashing)
-- For demo purposes, we'll use a simple hash. In production, use bcrypt or similar.
INSERT INTO users (first_name, last_name, email, password_hash, role, status) VALUES
  ('Michael', 'Robby', 'michael.robby@hcahealthcare.com', 'admin123', 'Administrator', 'Active')
ON CONFLICT (email) DO NOTHING;

-- Insert sample users
INSERT INTO users (first_name, last_name, email, password_hash, role, status) VALUES
  ('Sarah', 'Johnson', 'sarah.johnson@hcahealthcare.com', 'password123', 'Executive Director', 'Active'),
  ('David', 'Chen', 'david.chen@hcahealthcare.com', 'password123', 'Manager', 'Active'),
  ('Emily', 'Williams', 'emily.williams@hcahealthcare.com', 'password123', 'Analyst', 'Active')
ON CONFLICT (email) DO NOTHING;


