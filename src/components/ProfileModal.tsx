import { useState, useEffect, useRef } from 'react';
import { Camera, X, Save, Edit2 } from 'lucide-react';
import { api } from '../api';

// HCA Brand colors: Blue #092240 | Orange #E75925
const BRAND_BLUE = '#092240';
const BRAND_ORANGE = '#E75925';

/** Format US-style: (555) 123-4567 or 1 (555) 123-4567. Returns original if not 10/11 digits. */
function formatPhoneDisplay(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits[0] === '1') {
    return `1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return raw;
}

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  onFacilityChange?: (id: number | null, name: string) => void;
}

interface FacilityOption {
  id: number;
  name: string;
}

export function ProfileModal({ isOpen, onClose, onFacilityChange }: ProfileModalProps) {
  const sessionUser = (() => {
    try {
      const raw = sessionStorage.getItem('user');
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  })();

  const [isEditing, setIsEditing] = useState(false);
  const [firstName, setFirstName] = useState(sessionUser?.firstName ?? 'User');
  const [lastName, setLastName] = useState(sessionUser?.lastName ?? '');
  const [role] = useState(sessionUser?.role ?? '');
  const [email, setEmail] = useState(sessionUser?.email ?? '');
  const [phoneNumber, setPhoneNumber] = useState(() => sessionUser?.phoneNumber ?? (sessionUser as { phone_number?: string })?.phone_number ?? '');
  const [facilities, setFacilities] = useState<FacilityOption[]>([]);
  const [homeLocation, setHomeLocation] = useState<string>(
    () => localStorage.getItem('homeLocation') ?? 'all'
  );
  const [profilePicture, setProfilePicture] = useState<string | null>(
    () => sessionUser?.photoUrl ?? null
  );
  const [notifications, setNotifications] = useState({
    email: localStorage.getItem('notifEmail') !== 'false',
    push:  localStorage.getItem('notifPush')  !== 'false',
    sms:   localStorage.getItem('notifSms')   === 'true',
  });
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch('/api/facilitiesList')
      .then(r => r.json())
      .then(setFacilities)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      // Re-read session user when opening so we show latest (e.g. after re-login with phone_number)
      try {
        const raw = sessionStorage.getItem('user');
        const u = raw ? JSON.parse(raw) : null;
        if (u) {
          setEmail(u.email ?? '');
          setPhoneNumber(u.phoneNumber ?? u.phone_number ?? '');
        }
      } catch {
        // ignore
      }
    } else {
      document.body.style.overflow = '';
      setIsEditing(false);
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  function handlePictureChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const result = ev.target?.result as string;
      setProfilePicture(result);
    };
    reader.readAsDataURL(file);
  }

  async function handleSave() {
    const userId = sessionUser?.id != null ? Number(sessionUser.id) : null;
    
    // Save profile picture to database if changed
    if (profilePicture !== sessionUser?.photoUrl && userId != null) {
      try {
        const API_BASE = window.location.protocol === 'file:' 
          ? 'http://localhost:7071/api'
          : '/api';
        
        const response = await fetch(`${API_BASE}/users/${userId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ photoUrl: profilePicture || null }),
        });
        
        if (!response.ok) {
          throw new Error('Failed to update profile picture');
        }
        
        const updatedUser = await response.json();
        // Update sessionStorage with new photoUrl
        const currentUser = JSON.parse(sessionStorage.getItem('user') || '{}');
        currentUser.photoUrl = updatedUser.photoUrl;
        sessionStorage.setItem('user', JSON.stringify(currentUser));
      } catch (error) {
        console.error('Error saving profile picture:', error);
        alert('Failed to save profile picture. Please try again.');
        return;
      }
    }
    
    // Update email and phone number if changed
    if (userId != null && !Number.isNaN(userId) && (email.trim() !== (sessionUser?.email ?? '') || phoneNumber.trim() !== (sessionUser?.phoneNumber ?? (sessionUser as { phone_number?: string })?.phone_number ?? ''))) {
      try {
        const updated = await api.updateMyProfile(userId, {
          email: email.trim() || undefined,
          phoneNumber: phoneNumber.trim() || null,
        });
        try {
          const raw = sessionStorage.getItem('user');
          if (raw) {
            const u = JSON.parse(raw);
            if (updated.email !== undefined) u.email = updated.email;
            if (updated.phoneNumber !== undefined) u.phoneNumber = updated.phoneNumber;
            sessionStorage.setItem('user', JSON.stringify(u));
          }
        } catch {
          // ignore
        }
      } catch (err) {
        console.error('Failed to save profile:', err);
        return;
      }
    }
    localStorage.setItem('homeLocation', homeLocation);
    localStorage.setItem('notifEmail', String(notifications.email));
    localStorage.setItem('notifPush',  String(notifications.push));
    localStorage.setItem('notifSms',   String(notifications.sms));
    setIsEditing(false);
    if (onFacilityChange) {
      if (homeLocation === 'all') {
        onFacilityChange(null, 'All Facilities');
      } else {
        const match = facilities.find(f => String(f.id) === homeLocation);
        if (match) onFacilityChange(match.id, match.name);
      }
    }
    // Reload page to refresh profile picture in Header and Sidebar
    window.location.reload();
  }

  function handleCancel() {
    setFirstName(sessionUser?.firstName ?? 'User');
    setLastName(sessionUser?.lastName ?? '');
    setEmail(sessionUser?.email ?? '');
    setPhoneNumber(sessionUser?.phoneNumber ?? (sessionUser as { phone_number?: string })?.phone_number ?? '');
    setHomeLocation(localStorage.getItem('homeLocation') ?? 'all');
    setNotifications({
      email: localStorage.getItem('notifEmail') !== 'false',
      push:  localStorage.getItem('notifPush')  !== 'false',
      sms:   localStorage.getItem('notifSms')   === 'true',
    });
    setIsEditing(false);
  }

  const initials = `${firstName?.[0] ?? ''}${lastName?.[0] ?? ''}`.toUpperCase() || 'HCA';
  const homeName = homeLocation === 'all'
    ? 'All Facilities'
    : facilities.find(f => String(f.id) === homeLocation)?.name ?? 'All Facilities';

  if (!isOpen) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(9,34,64,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: 14,
          width: '100%', maxWidth: 760,
          maxHeight: '90vh', overflowY: 'auto',
          boxShadow: '0 24px 60px rgba(9,34,64,0.25)',
        }}
      >
        {/* Modal Header */}
        <div style={{
          position: 'sticky', top: 0, zIndex: 10,
          background: '#fff',
          borderBottom: `3px solid ${BRAND_ORANGE}`,
          padding: '16px 24px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: BRAND_BLUE, letterSpacing: -0.3 }}>
            User Profile
          </div>
          <button
            onClick={onClose}
            style={{
              width: 30, height: 30, borderRadius: '50%',
              background: '#f1f5f9', border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <X size={15} color="#64748b" />
          </button>
        </div>

        {/* Body */}
        <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 0 }}>

          {/* LEFT — Avatar + identity */}
          <div style={{
            borderRight: '1px solid #f1f5f9',
            padding: '28px 20px',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
          }}>
            {/* Avatar */}
            <div style={{ position: 'relative' }}>
              {profilePicture ? (
                <img
                  src={profilePicture}
                  alt="Profile"
                  referrerPolicy="no-referrer"
                  style={{ width: 90, height: 90, borderRadius: '50%', objectFit: 'cover', border: `3px solid ${BRAND_ORANGE}` }}
                />
              ) : (
                <div style={{
                  width: 90, height: 90, borderRadius: '50%',
                  background: BRAND_BLUE,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 26, fontWeight: 800, color: '#fff',
                  border: `3px solid ${BRAND_ORANGE}`,
                  boxShadow: '0 4px 16px rgba(9,34,64,0.25)',
                }}>{initials}</div>
              )}
              <button
                onClick={() => fileRef.current?.click()}
                title="Change photo"
                style={{
                  position: 'absolute', bottom: 2, right: 2,
                  width: 26, height: 26, borderRadius: '50%',
                  background: BRAND_ORANGE, border: '2px solid #fff',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: '0 2px 6px rgba(231,89,37,0.4)',
                }}
              >
                <Camera size={12} color="#fff" />
              </button>
              <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handlePictureChange} />
            </div>

            {isEditing ? (
              <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 2 }}>First Name</div>
                <input value={firstName} onChange={e => setFirstName(e.target.value)} style={inputStyle} />
                <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', letterSpacing: 1, textTransform: 'uppercase', marginTop: 4, marginBottom: 2 }}>Last Name</div>
                <input value={lastName} onChange={e => setLastName(e.target.value)} style={inputStyle} />
              </div>
            ) : (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>{firstName} {lastName}</div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 3 }}>{role}</div>
              </div>
            )}

            <button
              onClick={() => setIsEditing(e => !e)}
              style={{
                width: '100%', padding: '8px 0',
                background: isEditing ? '#f1f5f9' : BRAND_BLUE,
                color: isEditing ? '#374151' : '#fff',
                border: 'none', borderRadius: 7, cursor: 'pointer',
                fontSize: 12, fontWeight: 600,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}
            >
              <Edit2 size={12} />
              {isEditing ? 'Cancel Edit' : 'Edit Profile'}
            </button>

            {/* Role badge */}
            <div style={{
              width: '100%', padding: '10px 12px',
              background: '#f8fafc', borderRadius: 8, border: '1px solid #edf0f5',
            }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>Role</div>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: BRAND_BLUE }}>{role || '—'}</div>
            </div>

            {/* Email — show as editable in edit mode, read-only otherwise */}
            <div style={{
              width: '100%', padding: '10px 12px',
              background: '#f8fafc', borderRadius: 8, border: '1px solid #edf0f5',
            }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>Email</div>
              {isEditing ? (
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} style={{ ...inputStyle, margin: 0 }} placeholder="email@example.com" />
              ) : (
                <div style={{ fontSize: 9.5, fontWeight: 500, color: '#475569', wordBreak: 'break-all' }}>{email || '—'}</div>
              )}
            </div>

            {/* Phone — show as editable in edit mode, read-only otherwise */}
            <div style={{
              width: '100%', padding: '10px 12px',
              background: '#f8fafc', borderRadius: 8, border: '1px solid #edf0f5',
            }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>Phone</div>
              {isEditing ? (
                <input type="tel" value={phoneNumber} onChange={e => setPhoneNumber(e.target.value)} style={{ ...inputStyle, margin: 0 }} placeholder="(555) 123-4567" />
              ) : (
                <div style={{ fontSize: 12, fontWeight: 500, color: '#475569' }}>{phoneNumber ? formatPhoneDisplay(phoneNumber) : '—'}</div>
              )}
            </div>

            {/* Home hospital badge */}
            <div style={{
              width: '100%', padding: '10px 12px',
              background: '#fff8f5', borderRadius: 8, border: '1px solid rgba(231,89,37,0.2)',
            }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>Home Hospital</div>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: BRAND_ORANGE, lineHeight: 1.3 }}>{homeName}</div>
            </div>
          </div>

          {/* RIGHT — Settings */}
          <div style={{ padding: '28px 28px 24px' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginBottom: 20, letterSpacing: -0.2 }}>Settings</div>

            {/* Home Hospital */}
            <Section label="Home Hospital" description="Your default facility shown on the dashboard when you log in.">
              <select
                value={homeLocation}
                onChange={e => setHomeLocation(e.target.value)}
                style={selectStyle}
              >
                <option value="all">All Facilities</option>
                {facilities.map(f => (
                  <option key={f.id} value={String(f.id)}>{f.name}</option>
                ))}
              </select>
            </Section>

            {/* Notifications */}
            <Section label="Notification Preferences" description="Choose how you receive alerts and updates.">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <Toggle label="Email notifications" checked={notifications.email} onChange={v => setNotifications(n => ({ ...n, email: v }))} />
                <Toggle label="SMS alerts"          checked={notifications.sms}   onChange={v => setNotifications(n => ({ ...n, sms: v }))} />
              </div>
            </Section>

            {/* Save / Cancel */}
            <div style={{ display: 'flex', gap: 10, marginTop: 28, paddingTop: 20, borderTop: '1px solid #f1f5f9' }}>
              <button
                onClick={handleSave}
                style={{
                  padding: '9px 22px',
                  background: BRAND_ORANGE, color: '#fff',
                  border: 'none', borderRadius: 8, cursor: 'pointer',
                  fontSize: 13, fontWeight: 700,
                  display: 'flex', alignItems: 'center', gap: 7,
                  boxShadow: '0 2px 10px rgba(231,89,37,0.35)',
                }}
              >
                <Save size={14} />
                Save Changes
              </button>
              <button
                onClick={handleCancel}
                style={{
                  padding: '9px 22px',
                  background: '#f1f5f9', color: '#374151',
                  border: 'none', borderRadius: 8, cursor: 'pointer',
                  fontSize: 13, fontWeight: 600,
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Section({ label, description, children }: {
  label: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 24, paddingBottom: 24, borderBottom: '1px solid #f1f5f9' }}>
      <div style={{ fontSize: 12.5, fontWeight: 700, color: '#0f172a', marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 11.5, color: '#94a3b8', marginBottom: 12 }}>{description}</div>
      {children}
    </div>
  );
}

function Toggle({ label, checked, onChange }: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
      <div
        onClick={() => onChange(!checked)}
        style={{
          width: 36, height: 20, borderRadius: 10, flexShrink: 0,
          background: checked ? BRAND_BLUE : '#e2e8f0',
          position: 'relative', transition: 'background 0.2s',
        }}
      >
        <div style={{
          position: 'absolute', top: 3,
          left: checked ? 19 : 3,
          width: 14, height: 14, borderRadius: '50%',
          background: '#fff', transition: 'left 0.2s',
          boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
        }} />
      </div>
      <span style={{ fontSize: 12.5, color: '#374151' }}>{label}</span>
    </label>
  );
}

const inputStyle: React.CSSProperties = {
  padding: '7px 10px', borderRadius: 7, fontSize: 12.5,
  border: '1px solid #e2e8f0', outline: 'none', width: '100%', color: '#0f172a',
};

const selectStyle: React.CSSProperties = {
  padding: '8px 12px', borderRadius: 7, fontSize: 12.5,
  border: '1px solid #e2e8f0', outline: 'none',
  width: '100%', maxWidth: 340,
  background: '#fff', color: '#0f172a', cursor: 'pointer',
};
