import { useState, useEffect } from 'react';
import { User, Bell, Shield, Database, Download, Trash2, Save } from 'lucide-react';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import { useApp } from '../context/AppContext';

const Settings = () => {
  const { user, addNotification } = useApp();
  const [activeTab, setActiveTab] = useState('profile');
  const [settings, setSettings] = useState({
    profile: {
      name: user?.name || '',
      email: user?.email || '',
      company: 'Acme Corporation',
      role: 'Document Manager'
    },
    notifications: {
      emailAlerts: true,
      analysisComplete: true,
      highRiskFound: true,
      weeklyReports: false,
      systemUpdates: true
    },
    privacy: {
      dataRetention: '365',
      shareAnalytics: false,
      allowTracking: false
    },
    storage: {
      autoDelete: false,
      deleteAfterDays: '90',
      compressionEnabled: true
    }
  });

  // Sync profile fields when Supabase user loads
  useEffect(() => {
    if (user?.email) {
      setSettings((prev) => ({
        ...prev,
        profile: {
          ...prev.profile,
          name: prev.profile.name || user.name || '',
          email: user.email || prev.profile.email,
        },
      }));
    }
  }, [user?.email, user?.name]);

  const tabs = [
    { id: 'profile', name: 'Profile', icon: User },
    { id: 'notifications', name: 'Notifications', icon: Bell },
    { id: 'privacy', name: 'Privacy & Security', icon: Shield },
    { id: 'storage', name: 'Storage', icon: Database }
  ];

  const handleSettingChange = (section, key, value) => {
    setSettings(prev => ({
      ...prev,
      [section]: {
        ...prev[section],
        [key]: value
      }
    }));
  };

  const handleSave = () => {
    // Simulate API call to save settings
    addNotification({
      type: 'success',
      message: 'Settings saved successfully'
    });
  };

  const handleExportData = () => {
    addNotification({
      type: 'info',
      message: 'Data export started. You will receive an email when ready.'
    });
  };

  const handleDeleteAccount = () => {
    if (window.confirm('Are you sure you want to delete your account? This action cannot be undone.')) {
      addNotification({
        type: 'error',
        message: 'Account deletion initiated. Please check your email for confirmation.'
      });
    }
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'profile':
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Profile Information</h3>
              {user?.email && (
                <p className="text-sm text-gray-600 mb-4">Signed in as <span className="font-medium text-gray-900">{user.email}</span></p>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Input
                  label="Full Name"
                  value={settings.profile.name}
                  onChange={(e) => handleSettingChange('profile', 'name', e.target.value)}
                />
                <Input
                  label="Email Address"
                  type="email"
                  value={settings.profile.email}
                  onChange={(e) => handleSettingChange('profile', 'email', e.target.value)}
                />
                <Input
                  label="Company"
                  value={settings.profile.company}
                  onChange={(e) => handleSettingChange('profile', 'company', e.target.value)}
                />
                <Input
                  label="Role"
                  value={settings.profile.role}
                  onChange={(e) => handleSettingChange('profile', 'role', e.target.value)}
                />
              </div>
            </div>
            
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Change Password</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Input
                  label="Current Password"
                  type="password"
                  placeholder="Enter current password"
                />
                <Input
                  label="New Password"
                  type="password"
                  placeholder="Enter new password"
                />
              </div>
            </div>
          </div>
        );

      case 'notifications':
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Email Notifications</h3>
              <div className="space-y-4">
                {Object.entries(settings.notifications).map(([key, value]) => (
                  <div key={key} className="flex items-center justify-between">
                    <div>
                      <h4 className="font-medium text-gray-900">
                        {key === 'emailAlerts' && 'Email Alerts'}
                        {key === 'analysisComplete' && 'Analysis Complete'}
                        {key === 'highRiskFound' && 'High Risk Documents Found'}
                        {key === 'weeklyReports' && 'Weekly Summary Reports'}
                        {key === 'systemUpdates' && 'System Updates'}
                      </h4>
                      <p className="text-sm text-gray-600">
                        {key === 'emailAlerts' && 'Receive email notifications for important events'}
                        {key === 'analysisComplete' && 'Get notified when document analysis is complete'}
                        {key === 'highRiskFound' && 'Alert when high-risk content is detected'}
                        {key === 'weeklyReports' && 'Receive weekly summaries of your documents'}
                        {key === 'systemUpdates' && 'Notifications about system updates and maintenance'}
                      </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={value}
                        onChange={(e) => handleSettingChange('notifications', key, e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-500"></div>
                    </label>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );

      case 'privacy':
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Data Privacy</h3>
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Data Retention Period
                  </label>
                  <select
                    value={settings.privacy.dataRetention}
                    onChange={(e) => handleSettingChange('privacy', 'dataRetention', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="30">30 days</option>
                    <option value="90">90 days</option>
                    <option value="180">180 days</option>
                    <option value="365">1 year</option>
                    <option value="forever">Forever</option>
                  </select>
                  <p className="text-sm text-gray-600 mt-1">
                    How long to keep your documents and analysis data
                  </p>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium text-gray-900">Share Analytics Data</h4>
                    <p className="text-sm text-gray-600">
                      Help improve our service by sharing anonymized usage data
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.privacy.shareAnalytics}
                      onChange={(e) => handleSettingChange('privacy', 'shareAnalytics', e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-500"></div>
                  </label>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium text-gray-900">Allow Tracking</h4>
                    <p className="text-sm text-gray-600">
                      Allow tracking for personalized experience and analytics
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.privacy.allowTracking}
                      onChange={(e) => handleSettingChange('privacy', 'allowTracking', e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-500"></div>
                  </label>
                </div>
              </div>
            </div>

            <div className="pt-6 border-t border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Data Management</h3>
              <div className="flex gap-4">
                <Button
                  variant="outline"
                  onClick={handleExportData}
                  icon={<Download size={16} />}
                >
                  Export My Data
                </Button>
                <Button
                  variant="danger"
                  onClick={handleDeleteAccount}
                  icon={<Trash2 size={16} />}
                >
                  Delete Account
                </Button>
              </div>
            </div>
          </div>
        );

      case 'storage':
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Storage Management</h3>
              
              <div className="mb-6 p-4 bg-gray-50 rounded-lg">
                <h4 className="font-medium text-gray-900 mb-2">Current Usage</h4>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-600">1.2 GB used of 10 GB</span>
                  <span className="text-sm text-gray-600">12% used</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div className="bg-primary-500 h-2 rounded-full" style={{ width: '12%' }}></div>
                </div>
              </div>

              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium text-gray-900">Auto-delete old documents</h4>
                    <p className="text-sm text-gray-600">
                      Automatically delete documents after a specified period
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.storage.autoDelete}
                      onChange={(e) => handleSettingChange('storage', 'autoDelete', e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-500"></div>
                  </label>
                </div>

                {settings.storage.autoDelete && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Delete documents after
                    </label>
                    <select
                      value={settings.storage.deleteAfterDays}
                      onChange={(e) => handleSettingChange('storage', 'deleteAfterDays', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                    >
                      <option value="30">30 days</option>
                      <option value="60">60 days</option>
                      <option value="90">90 days</option>
                      <option value="180">180 days</option>
                      <option value="365">1 year</option>
                    </select>
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium text-gray-900">Enable compression</h4>
                    <p className="text-sm text-gray-600">
                      Compress documents to save storage space
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.storage.compressionEnabled}
                      onChange={(e) => handleSettingChange('storage', 'compressionEnabled', e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-500"></div>
                  </label>
                </div>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-600 mt-1">Manage your account and application preferences</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Sidebar */}
        <div className="lg:col-span-1">
          <Card className="p-0">
            <div className="space-y-1 p-2">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                      activeTab === tab.id
                        ? 'bg-primary-100 text-primary-700'
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                    }`}
                  >
                    <Icon size={18} />
                    {tab.name}
                  </button>
                );
              })}
            </div>
          </Card>
        </div>

        {/* Main Content */}
        <div className="lg:col-span-3">
          <Card className="p-6">
            {renderTabContent()}
            
            {/* Save Button */}
            <div className="flex justify-end pt-6 border-t border-gray-200 mt-6">
              <Button onClick={handleSave} icon={<Save size={16} />}>
                Save Changes
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Settings;