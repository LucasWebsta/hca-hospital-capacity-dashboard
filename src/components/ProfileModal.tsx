import { useState, useEffect } from 'react';

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// Get user info from sessionStorage (from login)
const getUserInfo = () => {
  if (typeof window !== 'undefined') {
    const userStr = sessionStorage.getItem('user');
    if (userStr) {
      const user = JSON.parse(userStr);
      return {
        firstName: user.firstName || 'John',
        lastName: user.lastName || 'Doe',
        role: user.role || 'Executive Director',
        email: user.email || '',
      };
    }
  }
  return {
    firstName: typeof window !== 'undefined' ? (localStorage.getItem('userFirstName') || 'John') : 'John',
    lastName: typeof window !== 'undefined' ? (localStorage.getItem('userLastName') || 'Doe') : 'Doe',
    role: typeof window !== 'undefined' ? (localStorage.getItem('userRole') || 'Executive Director') : 'Executive Director',
    email: '',
  };
};

export function ProfileModal({ isOpen, onClose }: ProfileModalProps) {
  const initialUser = getUserInfo();
  const [firstName, setFirstName] = useState(initialUser.firstName);
  const [lastName, setLastName] = useState(initialUser.lastName);
  const [role, setRole] = useState(initialUser.role);
  const [homeLocation, setHomeLocation] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('homeLocation') || 'all';
    }
    return 'all';
  });
  const [profilePicture, setProfilePicture] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('profilePicture');
    }
    return null;
  });
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      // Refresh user info from sessionStorage when modal opens
      const userInfo = getUserInfo();
      setFirstName(userInfo.firstName);
      setLastName(userInfo.lastName);
      setRole(userInfo.role);
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  const handlePictureChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const result = event.target?.result as string;
        setProfilePicture(result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSave = () => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('userFirstName', firstName);
      localStorage.setItem('userLastName', lastName);
      localStorage.setItem('userRole', role);
      localStorage.setItem('homeLocation', homeLocation);
      if (profilePicture) {
        localStorage.setItem('profilePicture', profilePicture);
      }
    }
    setIsEditing(false);
    // In a real app, you would send this to your backend API
    console.log('Settings saved:', { firstName, lastName, role, homeLocation });
  };

  const handleCancel = () => {
    if (typeof window !== 'undefined') {
      setFirstName(localStorage.getItem('userFirstName') || 'John');
      setLastName(localStorage.getItem('userLastName') || 'Doe');
      setRole(localStorage.getItem('userRole') || 'Executive Director');
      setHomeLocation(localStorage.getItem('homeLocation') || 'all');
      setProfilePicture(localStorage.getItem('profilePicture'));
    }
    setIsEditing(false);
  };

  const getLocationText = () => {
    const locations: { [key: string]: string } = {
      'all': 'All Facilities',
      'facility1': 'Memorial Hospital',
      'facility2': 'Regional Medical Center',
      'facility3': 'Community Hospital',
      'facility4': 'University Medical Center',
      'facility5': 'General Hospital'
    };
    return locations[homeLocation] || 'All Facilities';
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50"
      onClick={onClose}
    >
      <div 
        className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
          <h2 className="text-2xl font-bold text-gray-900">User Profile</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* LEFT SIDE - Profile Information */}
            <div className="lg:col-span-1">
              <div className="bg-gray-50 rounded-xl p-6">
                {/* Profile Picture */}
                <div className="flex justify-center mb-6">
                  <div className="relative">
                    <img 
                      src={profilePicture || `https://ui-avatars.com/api/?name=${firstName}+${lastName}&background=E75925&color=fff&size=150&bold=true`}
                      alt="Profile Picture" 
                      className="w-32 h-32 rounded-full border-4 border-white shadow-lg object-cover"
                    />
                    <button 
                      onClick={() => document.getElementById('pictureInput')?.click()}
                      className="absolute bottom-0 right-0 bg-blue-600 text-white rounded-full p-2 shadow-lg hover:bg-blue-700 transition"
                      title="Change profile picture"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 9a2 2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"></path>
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"></path>
                      </svg>
                    </button>
                    <input 
                      type="file" 
                      id="pictureInput" 
                      accept="image/*" 
                      className="hidden"
                      onChange={handlePictureChange}
                    />
                  </div>
                </div>

                {/* Name and Role */}
                {isEditing ? (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
                      <input
                        type="text"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
                      <input
                        type="text"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                      <input
                        type="text"
                        value={role}
                        onChange={(e) => setRole(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="text-center">
                    <h3 className="text-2xl font-bold text-gray-900 mb-1">{firstName} {lastName}</h3>
                    <p className="text-gray-600 text-lg">{role}</p>
                  </div>
                )}

                {/* Edit Button */}
                <button 
                  onClick={() => setIsEditing(!isEditing)}
                  className="w-full mt-6 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-2 px-4 rounded-lg transition"
                >
                  {isEditing ? 'Cancel Edit' : 'Edit Profile Information'}
                </button>
              </div>
            </div>

            {/* RIGHT SIDE - Settings */}
            <div className="lg:col-span-2">
              <h3 className="text-xl font-bold text-gray-900 mb-6">Settings</h3>

              <div className="space-y-6">
                {/* Home Location Setting */}
                <div className="border-b border-gray-200 pb-6">
                  <label className="block text-sm font-semibold text-gray-900 mb-2">
                    Home Location
                  </label>
                  <p className="text-sm text-gray-600 mb-4">
                    Choose your default facility view. This will be your default dashboard view when you log in.
                  </p>
                  <select 
                    value={homeLocation}
                    onChange={(e) => setHomeLocation(e.target.value)}
                    className="w-full lg:w-96 px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white text-gray-900"
                  >
                    <option value="all">All Facilities</option>
                    <option value="facility1">Memorial Hospital</option>
                    <option value="facility2">Regional Medical Center</option>
                    <option value="facility3">Community Hospital</option>
                    <option value="facility4">University Medical Center</option>
                    <option value="facility5">General Hospital</option>
                  </select>
                  <p className="text-xs text-gray-500 mt-2">
                    Current selection: <span className="font-medium">{getLocationText()}</span>
                  </p>
                </div>

                {/* Notification Settings */}
                <div className="border-b border-gray-200 pb-6">
                  <label className="block text-sm font-semibold text-gray-900 mb-2">
                    Notification Preferences
                  </label>
                  <div className="space-y-3">
                    <label className="flex items-center">
                      <input type="checkbox" defaultChecked className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                      <span className="ml-3 text-sm text-gray-700">Email notifications</span>
                    </label>
                    <label className="flex items-center">
                      <input type="checkbox" defaultChecked className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                      <span className="ml-3 text-sm text-gray-700">Push notifications</span>
                    </label>
                    <label className="flex items-center">
                      <input type="checkbox" className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                      <span className="ml-3 text-sm text-gray-700">SMS alerts</span>
                    </label>
                  </div>
                </div>

                {/* Dashboard Preferences */}
                <div className="border-b border-gray-200 pb-6">
                  <label className="block text-sm font-semibold text-gray-900 mb-2">
                    Dashboard Preferences
                  </label>
                  <div className="space-y-3">
                    <label className="flex items-center">
                      <input type="checkbox" defaultChecked className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                      <span className="ml-3 text-sm text-gray-700">Show occupancy trends by default</span>
                    </label>
                    <label className="flex items-center">
                      <input type="checkbox" defaultChecked className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                      <span className="ml-3 text-sm text-gray-700">Show capacity forecasts</span>
                    </label>
                    <label className="flex items-center">
                      <input type="checkbox" className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                      <span className="ml-3 text-sm text-gray-700">Auto-refresh data every 5 minutes</span>
                    </label>
                  </div>
                </div>

                {/* Theme Settings */}
                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-2">
                    Theme
                  </label>
                  <div className="flex gap-3">
                    <button className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition">
                      Light
                    </button>
                    <button className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg font-medium hover:bg-gray-300 transition">
                      Dark
                    </button>
                    <button className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg font-medium hover:bg-gray-300 transition">
                      System
                    </button>
                  </div>
                </div>
              </div>

              {/* Save/Cancel Buttons */}
              <div className="mt-8 pt-6 border-t border-gray-200 flex gap-3">
                <button 
                  onClick={handleSave}
                  className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition shadow-sm"
                >
                  Save Changes
                </button>
                <button 
                  onClick={handleCancel}
                  className="px-6 py-3 bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold rounded-lg transition"
                >
                  Cancel
                </button>
              </div>

              {/* Logout Button */}
              <div className="mt-6 pt-6 border-t border-gray-200">
                <button
                  onClick={async () => {
                    const userStr = sessionStorage.getItem('user');
                    let userId = null;
                    let userName = 'Unknown';
                    
                    if (userStr) {
                      const user = JSON.parse(userStr);
                      userId = user.id;
                      userName = `${user.firstName} ${user.lastName}`;
                    }
                    
                    try {
                      // Call logout API
                      await fetch('/api/auth/logout', {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({ userId, userName })
                      });
                    } catch (error) {
                      console.error('Logout API error:', error);
                      // Continue with logout even if API call fails
                    }
                    
                    // Clear session storage and redirect to login
                    sessionStorage.clear();
                    window.location.href = '/login.html';
                  }}
                  className="w-full px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition shadow-sm flex items-center justify-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                  Logout
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

