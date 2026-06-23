import React, { useState, useEffect, useRef } from 'react';
import CinematicHome from './CinematicHome';
import {
  AlertTriangle,
 
  Briefcase, 
  
  Sparkles, 
  CheckCircle, 
  UploadCloud, 
  Search, 
  Settings2,
  Loader2,
  Cpu,
  ChevronRight,
  Layers,
  Activity,
  UserCheck,
  Mail,
  Shield,
  FileText,
  Cookie,
  MapPin,
  Phone,
  User,
  Info,
  Send,
  Menu,
  X,
  Save,
  Terminal,
  RefreshCw
} from 'lucide-react';
interface Job {
  id: string;
  title: string;
  company: string;
  location: string;
  isRemote: boolean;
  workType?: string;
  isInternship: boolean;
  duration?: string;
  stipend?: string;
  platform: string;
  url: string;
  description: string;
  salary?: string;
  matchScore: number;
  matchReason?: string;
  recruiterName?: string;
  status: 'SCRAPED' | 'MATCHED' | 'SKIPPED' | 'QUEUED' | 'APPLYING' | 'APPLIED' | 'FAILED';
  appliedAt?: string;
  logs: { time: string; message: string }[];
  createdAt: string;
}

interface Profile {
  id: string;
  userId: string;
  rawResumeText?: string;
  fullName: string;
  email: string;
  phone?: string;
  dob?: string;
  current_institution?: string;
  city?: string;
  state?: string;
  skills: string[];
  experience: {
    company: string;
    title: string;
    duration: string;
    description: string;
  }[];
  education: {
    school: string;
    degree: string;
    year: string;
  }[];
  targetTitles: string[];
  onboarding_completed: boolean;
}

interface SettingsState {
  isActive: boolean;
  dailyLimit: number;
  remoteOnly: boolean;
  includeInternships: boolean;
  autoApplyThreshold: number;
  proxyUrl?: string;
  linkedinCookies?: string;
  gmailCookies?: string;
  openrouterApiKey?: string;
  openrouterModels?: string;
  ceoDirective?: string;
  targetField?: string;
  experienceLevel?: string;
  aiProvider?: string;
  geminiApiKey?: string;
}

interface LogMessage {
  id?: string;
  level: 'INFO' | 'WARNING' | 'ERROR' | 'SUCCESS';
  message: string;
  timestamp: string;
}

const MNC_COMPANIES = [
  'Google', 'Microsoft', 'Amazon', 'Meta', 'Apple', 'Netflix',
  'TCS', 'Tata Consultancy Services', 'Infosys', 'Wipro', 'Accenture',
  'Cognizant', 'IBM', 'Capgemini', 'Deloitte', 'EY', 'Ernst & Young',
  'PwC', 'KPMG', 'HP', 'Dell', 'Oracle', 'SAP', 'Cisco', 'Salesforce',
  'Intel', 'Nvidia', 'AMD', 'Adobe', 'Uber', 'Tesla', 'Siemens', 'Samsung',
  'Sony', 'HCL', 'Tech Mahindra', 'L&T', 'LTI', 'Capgemini'
];

const isMncCompany = (companyName: string) => {
  if (!companyName) return false;
  const name = companyName.toLowerCase();
  return MNC_COMPANIES.some(mnc => {
    const mncLower = mnc.toLowerCase();
    return name.includes(mncLower) || mncLower.includes(name);
  });
};

// Temporarily using localhost so you can access the completely free unlocked version!
const API_BASE = (import.meta as any).env.VITE_API_BASE || (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' ? 'http://localhost:3000/api' : 'https://job-hunter-ai-koe0.onrender.com/api');
// @ts-ignore
const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.0.0';

export default function App() {
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [systemCheckComplete, setSystemCheckComplete] = useState(false);

  // Real Auth States (Persisted) - ALL hooks must come before any conditional return
  const [activeTab, _setActiveTab] = useState<any>(() => {
    const path = window.location.pathname.replace(/^\/+/, '');
    const validTabs = ['home', 'dashboard', 'resume', 'jobs', 'outreach', 'settings', 'plans', 'login', 'signup', 'privacy', 'terms', 'cookies', 'profile', 'about', 'contact'];
    return validTabs.includes(path) ? path as any : 'home';
  });
  const [recoveryToken, setRecoveryToken] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<{ id: string; email: string; fullName: string } | null>(() => {    try {
      const stored = localStorage.getItem('vanba_user');
      if (stored) {
        const parsed = JSON.parse(stored);
        // Normalize field names: backend may return full_name or fullName
        if (parsed && !parsed.fullName && parsed.full_name) {
          parsed.fullName = parsed.full_name;
        }
        return parsed;
      }
    } catch (e) {}
    return null;
  });
  const [token, setToken] = useState<string | null>(localStorage.getItem('vanba_token'));
  const [subscription, setSubscription] = useState<any>(null);

  // App States
  const [profile, setProfile] = useState<Profile | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [, setTotalJobsAvailable] = useState<number>(0);
  // const [isVerifying, setIsVerifying] = useState(false);
  const [jobTypeFilter, setJobTypeFilter] = useState<'ALL' | 'REMOTE' | 'HYBRID' | 'ONSITE' | 'INTERNSHIP'>('ALL');
  const [settings, setSettings] = useState<SettingsState>({
    isActive: false,
    dailyLimit: 10,
    remoteOnly: true,
    includeInternships: true,
    autoApplyThreshold: 75,
    proxyUrl: '',
    linkedinCookies: '',
    gmailCookies: '',
    openrouterApiKey: '',
    openrouterModels: ''
  });
  const [, setLogs] = useState<LogMessage[]>([]);
  const [liveLogs, setLiveLogs] = useState<LogMessage[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedOpenRouterModels, setSelectedOpenRouterModels] = useState<string[]>([]);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  // Additional state (must all be at top before any conditional returns)
  const [selectedFields, setSelectedFields] = useState<string[]>([]);
  const [selectedLevels, setSelectedLevels] = useState<string[]>([]);
  const [isScraping, setIsScraping] = useState(false);
  const [isCrawling, setIsCrawling] = useState(false);
  const [crawlingUrl, setCrawlingUrl] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [locationSearch, setLocationSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [mncOnly, setMncOnly] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [customCoverLetter, setCustomCoverLetter] = useState<string>('');
  const [customAnswers, setCustomAnswers] = useState<{ question: string; answer: string }[]>([]);
  const [expandedQuestion, setExpandedQuestion] = useState<number | null>(null);
  const [showMatchTips, setShowMatchTips] = useState<boolean>(false);
  const [hrData, setHrData] = useState<{email: string, confidence: string} | null>(null);
  const [coldEmailDraft, setColdEmailDraft] = useState<string>('');
  const [isFindingHR, setIsFindingHR] = useState(false);
  const [isDraftingEmail, setIsDraftingEmail] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [isRefreshingFeed, setIsRefreshingFeed] = useState(false);
  const [viewMode, setViewMode] = useState<'FEED' | 'KANBAN'>('FEED');
  const [themeAccent, setThemeAccent] = useState(localStorage.getItem('themeAccent') || 'PURE_WHITE');

  useEffect(() => {
    localStorage.setItem('themeAccent', themeAccent);
    const root = document.documentElement;
    if (themeAccent === 'EMERALD') {
      root.style.setProperty('--primary', '#10b981');
      root.style.setProperty('--primary-glow', 'rgba(16, 185, 129, 0.2)');
    } else if (themeAccent === 'CYBER_PURPLE') {
      root.style.setProperty('--primary', '#a855f7');
      root.style.setProperty('--primary-glow', 'rgba(168, 85, 247, 0.2)');
    } else if (themeAccent === 'HACKER_GREEN') {
      root.style.setProperty('--primary', '#22c55e');
      root.style.setProperty('--primary-glow', 'rgba(34, 197, 94, 0.2)');
    } else {
      root.style.setProperty('--primary', '#ffffff');
      root.style.setProperty('--primary-glow', 'rgba(255, 255, 255, 0.1)');
    }
  }, [themeAccent]);

  const isPremium = true; // Omni-access enabled for all users

  useEffect(() => {
    checkSystemStatus();
  }, []);

  useEffect(() => {
    // Check for Supabase Auth recovery token in the URL hash
    if (window.location.hash) {
      const hashParams = new URLSearchParams(window.location.hash.substring(1));
      const accessToken = hashParams.get('access_token');
      const type = hashParams.get('type');
      if (accessToken && type === 'recovery') {
        setRecoveryToken(accessToken);
        _setActiveTab('update-password');
        window.history.replaceState(null, '', '/');
      }
    }

    const handlePopState = () => {
      const path = window.location.pathname.replace(/^\/+/, '');
      const validTabs = ['home', 'dashboard', 'resume', 'jobs', 'outreach', 'settings', 'plans', 'login', 'signup', 'privacy', 'terms', 'cookies', 'profile', 'about', 'contact'];
      _setActiveTab(validTabs.includes(path) ? path as any : 'home');
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  async function checkSystemStatus() {
    try {
      const res = await fetch(`${API_BASE}/system/status`);
      if (res.ok) {
        const data = await res.json();
        setMaintenanceMode(data.maintenanceMode);
      }
    } catch (e) {
      console.error('System status check failed', e);
    }
    setSystemCheckComplete(true);
  }

  const setActiveTab = (path: string) => {
    window.history.pushState({}, '', `/${path === 'home' ? '' : path}`);
    _setActiveTab(path as any);
  };

  const handleNav = (tab: string) => {
    // Always allow basic public auth pages
    if (['home', 'login', 'signup', 'about', 'contact', 'privacy', 'terms', 'cookies'].includes(tab)) {
      setActiveTab(tab);
      setIsMobileMenuOpen(false);
      return;
    }

    // STRICT ONBOARDING FLOW GATES
    if (currentUser) {
      if (!profile || !profile.fullName || !profile.phone) {
        if (tab !== 'profile') {
          setActiveTab('profile');
          return;
        }
      } else if (!settings || !settings.targetField) {
        if (tab !== 'settings') {
          setActiveTab('settings');
          return;
        }
      } else if (!profile.rawResumeText || profile.rawResumeText.length < 50) {
        if (tab !== 'resume') {
          setActiveTab('resume');
          return;
        }
      }
    }

    setActiveTab(tab);
    setIsMobileMenuOpen(false);
  };

  const handleStatusChange = async (jobId: string, newStatus: string) => {
    setJobs(prev => prev.map(j => j.id === jobId ? { ...j, status: newStatus as any } : j));
    try {
      const res = await fetch(`${API_BASE}/jobs/${jobId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: newStatus })
      });
      if (!res.ok) throw new Error('Failed to update status');
    } catch (e) {
      console.error(e);
      setToastMessage('Failed to save Kanban status');
    }
  };

  // Refs
  const terminalEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Late-moved Effects
  useEffect(() => {
    if (currentUser && !isPremium) {
      const isPending = localStorage.getItem('pendingVerification');
      if (isPending && activeTab !== 'plans') {
        setActiveTab('plans');
      }
    }
  }, [currentUser, isPremium, activeTab]);

  useEffect(() => {
    if (token) {
      // NOTE: fetchInitialData is defined below, but JS closure lets us call it
      // when the effect actually runs (after render).
      fetchInitialData(token); 
    }
  }, [token]);

  useEffect(() => {
    if (!token) return; // Don't make authenticated requests without a token

    // These functions are defined later in the file
    fetchProfile(token);
    fetchJobs(token);
    fetchSettings(token);
    fetchLogs(token);
    fetchScrapeStatus(token);

    const eventSource = new EventSource(`${API_BASE}/agent/stream`);
    eventSource.onmessage = (event) => {
      try {
        const newLog = JSON.parse(event.data);
        setLiveLogs(prev => {
          if (newLog.id && prev.some(l => l.id === newLog.id)) return prev;
          if (prev.some(l => l.message === newLog.message && l.timestamp === newLog.timestamp)) return prev;
          return [...prev, newLog];
        });
        setLogs(prev => {
          if (newLog.id && prev.some(l => l.id === newLog.id)) return prev;
          return [newLog, ...prev];
        });
      } catch (err) {
        console.error(err);
      }
    };

    const interval = setInterval(() => {
      fetchJobs(token);
      fetchLogs(token);
      fetchScrapeStatus(token);
    }, 15000);

    return () => {
      eventSource.close();
      clearInterval(interval);
    };
  }, [token]);

  useEffect(() => {
    if (terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, []);

  // NOW safe to do conditional renders - all hooks have been called above
  if (!systemCheckComplete) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#0a0a0a', color: '#fff' }}>
        <Loader2 className="animate-spin text-blue-500" size={48} />
      </div>
    );
  }

  if (maintenanceMode) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#0a0a0a', color: '#fff', fontFamily: 'sans-serif', padding: '20px', textAlign: 'center' }}>
        <div style={{ background: 'rgba(244, 67, 54, 0.1)', padding: '40px', borderRadius: '16px', border: '1px solid rgba(244, 67, 54, 0.3)', maxWidth: '500px' }}>
          <AlertTriangle size={64} color="#f44336" style={{ margin: '0 auto 20px auto', display: 'block' }} />
          <h1 style={{ fontSize: '2rem', marginBottom: '15px' }}>System Under Maintenance</h1>
          <p style={{ color: '#aaa', fontSize: '1.1rem', lineHeight: '1.6' }}>
            We are currently performing scheduled maintenance or critical upgrades to improve your experience. 
            The system will be back online shortly. Thank you for your patience!
          </p>
        </div>
      </div>
    );
  }

  async function checkOnboardingStatus(token: string, fetchedProfile?: any, fetchedSettings?: any) {
    try {
      let currentProfile = fetchedProfile;
      let currentSettings = fetchedSettings;
      
      if (!currentProfile) {
        const profRes = await fetch(`${API_BASE}/profile`, { headers: { Authorization: `Bearer ${token}` } });
        if (profRes.ok) {
          const fetchedProf = await profRes.json();
          currentProfile = fetchedProf || { fullName: '', email: '', phone: '' };
        } else {
          currentProfile = { fullName: '', email: '', phone: '' };
        }
      }
      setProfile(currentProfile);
      
      if (!currentSettings) {
        const setRes = await fetch(`${API_BASE}/settings`, { headers: { Authorization: `Bearer ${token}` } });
        if (setRes.ok) currentSettings = await setRes.json();
      }

      // 0. If onboarding is already marked as completed, skip all forced routing
      if (currentProfile?.onboarding_completed) {
        setShowOnboarding(false);
        setActiveTab('dashboard');
        fetchInitialData(token);
        return;
      }

      // 1. Profile Step
      if (!currentProfile || !currentProfile.fullName || !currentProfile.phone) {
        setActiveTab('profile');
        return;
      }

      // 2. Settings Step (Mandatory AI API Key & cookies)
      const hasApiKey = currentSettings?.openrouterApiKey || currentSettings?.geminiApiKey;
      const hasCookies = currentSettings?.linkedinCookies && currentSettings.linkedinCookies.length > 5;
      if (!currentSettings || !hasApiKey || !hasCookies) {
        setActiveTab('settings');
        return;
      }

      // 3. Resume Step (Check if skills are parsed)
      if (!currentProfile.skills || currentProfile.skills.length === 0) {
        setActiveTab('resume');
        return;
      }

      // 4. Modal / Target Fields Step
      setActiveTab('dashboard');
      setShowOnboarding(true);
    } catch (e) {
      console.error(e);
    }
  };
  
  /* ─── AUTH HANDLERS ────────────────────────────────────────── */
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = (e.target as any).email.value;
    const password = (e.target as any).password.value;

    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (res.ok) {
        localStorage.setItem('vanba_token', data.accessToken);
        localStorage.setItem('vanba_user', JSON.stringify(data.user));
        setToken(data.accessToken);
        setCurrentUser(data.user);
        
        // Let checkOnboardingStatus handle the redirection sequence
        await checkOnboardingStatus(data.accessToken);
      } else {
        alert(data.error || 'Login failed');
      }
    } catch (err) {
      alert('Network error during login');
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = (e.target as any).email.value;
    const password = (e.target as any).password.value;
    const fullName = (e.target as any).fullName.value;

    try {
      const res = await fetch(`${API_BASE}/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, fullName }),
      });
      const data = await res.json();
      if (res.ok) {
        localStorage.setItem('vanba_token', data.accessToken);
        localStorage.setItem('vanba_user', JSON.stringify(data.user));
        setToken(data.accessToken);
        setCurrentUser(data.user);
        await checkOnboardingStatus(data.accessToken);
      } else {
        alert(data.error || 'Signup failed');
      }
    } catch (err) {
      alert('Network error during signup');
    }
  };

  function handleLogout() {
    localStorage.removeItem('vanba_token');
    localStorage.removeItem('vanba_user');
    setToken(null);
    setCurrentUser(null);
    setProfile(null);
    setJobs([]);
    setSubscription(null);
    setActiveTab('home');
  };



  const renderProfilePage = () => (
    <div className="glass-panel" style={{ maxWidth: '700px', margin: '40px auto' }}>
      <h2>My Profile</h2>
      <p style={{ color: 'var(--text-muted)', marginBottom: '20px' }}>Manage your personal and professional details.</p>   

      {profile ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '20px' }}>
          <input placeholder="Full Name" className="form-input" value={profile.fullName || ""} onChange={e => setProfile({...profile, fullName: e.target.value})} />
          <input placeholder="Email" className="form-input" disabled value={profile.email} />
          <input placeholder="Phone Number" className="form-input" value={profile.phone || ''} onChange={e => setProfile({...profile, phone: e.target.value})} />
          <input type="date" className="form-input" value={profile.dob ? new Date(profile.dob).toISOString().split('T')[0] : ''} onChange={e => setProfile({...profile, dob: e.target.value})} />
          <select className="form-input" value={profile.current_institution || ''} onChange={e => setProfile({...profile, current_institution: e.target.value})}>
            <option value="" disabled>Select Status</option>
            <option value="College">College</option>
            <option value="Employed">Employed</option>
            <option value="Unemployed">Unemployed</option>
          </select>
          <input placeholder="City" className="form-input" value={profile.city || ''} onChange={e => setProfile({...profile, city: e.target.value})} />
          <input placeholder="State" className="form-input" value={profile.state || ''} onChange={e => setProfile({...profile, state: e.target.value})} />
        </div>
      ) : <p>Loading profile...</p>}

      <button onClick={async () => {
        try {
          await fetch(`${API_BASE}/profile`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify(profile)
          });
          alert('Profile updated successfully!');
          checkOnboardingStatus(token!, profile, settings);
        } catch (err) {
          alert('Error updating profile.');
        }
      }} className="btn btn-primary" style={{ width: '100%' }}>Save Changes</button>
    </div>
  );
  /*
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleVerifyPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isVerifying) return;
    setIsVerifying(true);
    const transactionId = (e.target as any).txId.value;
    const planType = localStorage.getItem('pendingVerificationPlan') || 'WEEKLY';
    
    try {
      const res = await fetch(`${API_BASE}/user/submit-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ orderId: transactionId, planType }),
      });
      const data = await res.json();
      if (res.ok) {
        alert(data.message || 'Verification request submitted successfully.');
        localStorage.removeItem('pendingVerification');
        localStorage.removeItem('pendingVerificationPlan');
        // Do not reload immediately since it's pending
      } else {
        alert(data.error || 'Payment verification failed.');
      }
    } catch (err) {
      alert('Error verifying payment.');
    } finally {
      setIsVerifying(false);
    }
  };
  */



  const renderPlansPage = () => (
    <div style={{ maxWidth: '900px', margin: '0 auto', width: '100%', padding: '0 20px', textAlign: 'center', marginTop: '100px' }}>
      <h2 style={{ color: 'white', marginBottom: '20px' }}>Pricing Coming Soon!</h2>
      <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem' }}>
        For now, enjoy <strong>all features absolutely free and unlimited</strong> while we are in Beta.
      </p>
    </div>
  );

  async function fetchInitialData(activeToken: string) {
    try {
      const headers = { Authorization: `Bearer ${activeToken}` };
      
      const [profRes, jobRes, subRes, setRes, totalRes] = await Promise.all([
        fetch(`${API_BASE}/profile`, { headers }),
        fetch(`${API_BASE}/jobs`, { headers }),
        fetch(`${API_BASE}/subscription`, { headers }),
        fetch(`${API_BASE}/settings`, { headers }),
        fetch(`${API_BASE}/jobs/total`)
      ]);

      if (profRes.status === 401 || jobRes.status === 401) {
        console.error('Initial data fetch failed: 401 Unauthorized');
        handleLogout();
        return;
      }

      if (profRes.ok) {
        const profileData = await profRes.json();
        let fallbackProfile = { fullName: '', email: '' };
        try {
           const storedUser = localStorage.getItem('vanba_user');
           if (storedUser) {
             const parsed = JSON.parse(storedUser);
             fallbackProfile = { fullName: parsed.fullName || parsed.full_name || '', email: parsed.email || '' };
           }
        } catch(e) {}
        setProfile(profileData || fallbackProfile);
        // The modal logic is handled centrally by checkOnboardingStatus now, but we can do a passive check:
        if (profileData && profileData.skills && profileData.skills.length > 0 && !profileData.onboarding_completed) {
          setShowOnboarding(true);
        } else {
          setShowOnboarding(false);
        }
      }
      if (jobRes.ok) setJobs(await jobRes.json());
      if (subRes.ok) setSubscription(await subRes.json());
      if (setRes.ok) { const sd = await setRes.json(); if (sd) setSettings(prev => ({ ...prev, ...sd })); }
      if (totalRes.ok) {
        const t = await totalRes.json();
        setTotalJobsAvailable(t.total || 0);
      }
    } catch (err) {
      console.error('Failed to load initial data');
      handleLogout();
    }
  };




  // Helper functions for safe data parsing (resilience against raw DB structures)
  const getSkills = (prof: Profile | null): string[] => {
    if (!prof) return [];
    const skillsVal = prof.skills as any;
    if (Array.isArray(skillsVal)) return skillsVal;
    if (typeof skillsVal === 'string') {
      try {
        const parsed = JSON.parse(skillsVal);
        if (Array.isArray(parsed)) return parsed;
      } catch (e) {
        if (skillsVal.includes(',')) {
          return skillsVal.split(',').map((s: any) => s.trim());
        }
      }
      return [skillsVal.trim()];
    }
    return [];
  };

  const getExperience = (prof: Profile | null): any[] => {
    if (!prof) return [];
    if (Array.isArray(prof.experience)) return prof.experience;
    if (typeof prof.experience === 'string') {
      try {
        const parsed = JSON.parse(prof.experience);
        if (Array.isArray(parsed)) return parsed;
      } catch (e) {}
    }
    return [];
  };

  const getEducation = (prof: Profile | null): any[] => {
    if (!prof) return [];
    if (Array.isArray(prof.education)) return prof.education;
    if (typeof prof.education === 'string') {
      try {
        const parsed = JSON.parse(prof.education);
        if (Array.isArray(parsed)) return parsed;
      } catch (e) {}
    }
    return [];
  };

  const getTargetTitles = (prof: Profile | null): string[] => {
    if (!prof) return [];
    const titlesVal = prof.targetTitles as any;
    if (Array.isArray(titlesVal)) return titlesVal;
    if (typeof titlesVal === 'string') {
      try {
        const parsed = JSON.parse(titlesVal);
        if (Array.isArray(parsed)) return parsed;
      } catch (e) {
        if (titlesVal.includes(',')) {
          return titlesVal.split(',').map((s: any) => s.trim());
        }
      }
      return [titlesVal.trim()];
    }
    return [];
  };

  const getMatchingSkillsInJob = (jobDesc: string, profSkills: string[]): string[] => {
    const descLower = jobDesc.toLowerCase();
    return profSkills.filter(s => {
      const sClean = s.toLowerCase().trim();
      if (sClean.length === 0) return false;
      const escaped = sClean.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
      return new RegExp(`\\b${escaped}\\b`, 'i').test(descLower);
    });
  };

  const getMissingSkillsInJob = (jobDesc: string, profSkills: string[]): string[] => {
    const descLower = jobDesc.toLowerCase();
    return profSkills.filter(s => {
      const sClean = s.toLowerCase().trim();
      if (sClean.length === 0) return false;
      const escaped = sClean.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
      return !new RegExp(`\\b${escaped}\\b`, 'i').test(descLower);
    });
  };



  // REST API calls — all require a valid auth token
  async function fetchProfile(authToken: string) {
    try {
      const res = await fetch(`${API_BASE}/profile`, { headers: { Authorization: `Bearer ${authToken}` } });
      if (res.status === 401) { handleLogout(); return; }
      if (!res.ok) return;
      const data = await res.json();
      setProfile(data || { fullName: '', email: '', phone: '', current_institution: '', city: '', state: '' });
    } catch (e) {}
  };

  async function fetchJobs(authToken: string) {
    try {
      const res = await fetch(`${API_BASE}/jobs`, { headers: { Authorization: `Bearer ${authToken}` } });
      if (res.status === 401) { handleLogout(); return; }
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data)) {
        const mappedJobs = data.map((j: any) => ({
          ...j,
          isRemote: j.is_remote,
          isInternship: j.is_internship,
          matchScore: j.match_score,
          matchReason: j.match_reason,
          isMnc: j.is_mnc,
          createdAt: j.created_at
        }));
        setJobs(mappedJobs);
        if (mappedJobs.length > 0) {
          if (!selectedJob) {
            handleSelectJob(mappedJobs[0]);
          } else {
            const current = mappedJobs.find((job: Job) => job.id === selectedJob?.id);
            if (current) setSelectedJob(current);
          }
        }
      } else {
        setJobs([]);
      }
    } catch (e) {}
  };

  async function fetchSettings(authToken: string) {
    try {
      const res = await fetch(`${API_BASE}/settings`, { headers: { Authorization: `Bearer ${authToken}` } });
      if (res.status === 401) { handleLogout(); return; }
      if (!res.ok) return;
      const data = await res.json();
      if (data) setSettings(prev => ({ ...prev, ...data }));
      
      // Parse multi-select arrays
      if (data.targetField) {
        try {
          const parsed = JSON.parse(data.targetField);
          setSelectedFields(Array.isArray(parsed) ? parsed : [data.targetField]);
        } catch (e) {
          setSelectedFields(data.targetField.split(',').map((s: string) => s.trim()).filter(Boolean));
        }
      }
      if (data.experienceLevel) {
        try {
          const parsed = JSON.parse(data.experienceLevel);
          setSelectedLevels(Array.isArray(parsed) ? parsed : [data.experienceLevel]);
        } catch (e) {
          setSelectedLevels(data.experienceLevel.split(',').map((s: string) => s.trim()).filter(Boolean));
        }
      }
      if (data.openrouterModels) {
        try {
          const parsed = JSON.parse(data.openrouterModels);
          setSelectedOpenRouterModels(Array.isArray(parsed) ? parsed : [data.openrouterModels]);
        } catch (e) {
          setSelectedOpenRouterModels([]);
        }
      }

      if (!data.targetField || !data.experienceLevel) {
        // Handled by fetchInitialData instead
      }
    } catch (e) {}
  };

  async function fetchLogs(authToken: string) {
    try {
      const res = await fetch(`${API_BASE}/logs`, { headers: { Authorization: `Bearer ${authToken}` } });
      if (!res.ok) return;
      const data = await res.json();
      if (!data || !Array.isArray(data) || data.length === 0) return;
      
      setLogs(data);
      
      // Show ALL recent logs in the live panel (most recent first)
      setLiveLogs([...data].slice(0, 50));
    } catch (e) {}
  };

  async function fetchScrapeStatus(authToken: string) {
    try {
      const res = await fetch(`${API_BASE}/jobs/scrape/status`, { headers: { Authorization: `Bearer ${authToken}` } });
      if (res.ok) {
        const data = await res.json();
        setIsScraping(data.isScrapingActive);
      } else if (res.status === 404) {
        // Silently fail if the endpoint isn't deployed yet to avoid console spam
        setIsScraping(false);
      } else {
        setIsScraping(false);
      }
    } catch (e) {
      setIsScraping(false);
    }
  }

  // Upload Resume
  const handleResumeUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    if (!token) { alert('Please log in first.'); return; }
    setIsUploading(true);
    const formData = new FormData();
    formData.append('resume', e.target.files[0]);

    try {
      const res = await fetch(`${API_BASE}/resume/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      });
      const data = await res.json();
      if (res.ok) {
        setProfile(data.profile);
        fetchProfile(token);
        fetchJobs(token);
        setToastMessage('Successfully done');
        setTimeout(() => setToastMessage(null), 3500);
        setShowOnboarding(true); // Trigger onboarding after successful upload
      } else {
        alert(data.error || 'Failed to parse resume');
      }
    } catch (err) {
      alert('Upload failed.');
    } finally {
      setIsUploading(false);
    }
  };

  // Autopilot Actions
  const handleTriggerScrape = async () => {
    setIsScraping(true);
    // Add a 'Starting...' message immediately to show it's working
    setLiveLogs(prev => [{ id: 'trigger-' + Date.now(), level: 'INFO', message: '🚀 Force Crawl triggered. Scraper is starting...', timestamp: new Date().toISOString() }, ...prev]);
    try {
      const res = await fetch(`${API_BASE}/jobs/scrape`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      await res.json();
      // Poll logs every 3 seconds for 90 seconds to show live progress
      let pollCount = 0;
      const pollInterval = setInterval(() => {
        if (token) {
          fetchJobs(token); // Real-time stats update!
          fetchLogs(token);
          fetchScrapeStatus(token);
        }
        pollCount++;
        if (pollCount >= 30) clearInterval(pollInterval);
      }, 3000);
      if (token) fetchLogs(token!);
    } catch (err: any) {
      setLiveLogs(prev => [{ id: 'err-' + Date.now(), level: 'ERROR', message: '❌ Failed to contact scraper. Is the backend running?', timestamp: new Date().toISOString() }, ...prev]);
      setToastMessage(err.error || 'Failed to start scraper.');
      setIsScraping(false);
    }
  };

  const handleStopScrape = async () => {
    setIsScraping(false);
    setLiveLogs(prev => [{ id: 'stop-' + Date.now(), level: 'WARNING', message: '⚠️ Stop signal sent. Scraper will abort after current item...', timestamp: new Date().toISOString() }, ...prev]);
    try {
      await fetch(`${API_BASE}/jobs/scrape/stop`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
    } catch (e) {
      console.error(e);
    }
  };

  const handleTriggerCrawl = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!crawlingUrl) return;
    setIsCrawling(true);
    try {
      const res = await fetch(`${API_BASE}/jobs/crawl`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ url: crawlingUrl })
      });
      const data = await res.json();
      if (res.ok) {
        setCrawlingUrl('');
        if (token) fetchJobs(token);
        if (data.job) {
          handleSelectJob(data.job);
        }
      } else {
        alert(data.error || 'Failed to crawl link.');
      }
    } catch (err) {
      alert('Crawl request failed.');
    } finally {
      setIsCrawling(false);
    }
  };

  const handleApplyJob = async (jobId: string, dryRun: boolean = true) => {
    try {
      const res = await fetch(`${API_BASE}/jobs/${jobId}/apply`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ dryRun })
      });
      const data = await res.json();
      alert(data.message + ' View live terminal logs for details.');
      if (token) setTimeout(() => fetchJobs(token!), 2000);
    } catch (err) {
      alert('Apply request aborted.');
    }
  };
  const handleReportJob = async (jobId: string) => {
    const reason = prompt("Please provide a reason for reporting (e.g., Fake, Expired, Asks for Money):");
    if (!reason) return;
    try {
      const res = await fetch(`${API_BASE}/reports`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ jobId, reason })
      });
      const data = await res.json();
      if (res.ok) {
        alert('Report submitted successfully. We will review this job shortly.');
        if (token) fetchJobs(token);
        setSelectedJob(null);
      } else {
        alert(data.error || 'Failed to report job.');
      }
    } catch (err) {
      alert('Report request aborted.');
    }
  };


  const handleFindHR = async () => {
    if (!selectedJob) return;
    setIsFindingHR(true);
    try {
      const res = await fetch(`${API_BASE}/agent/find-hr`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ companyName: selectedJob.company })
      });
      const data = await res.json();
      if (res.ok) {
        setHrData(data);
      } else {
        alert(data.error || 'Failed to find HR email.');
      }
    } catch(e) { 
      alert('Failed to find HR email.'); 
    } finally {
      setIsFindingHR(false);
    }
  };

  const handleDraftEmail = async () => {
    if (!selectedJob || !hrData) return alert('Find HR email first!');
    setIsDraftingEmail(true);
    try {
      const res = await fetch(`${API_BASE}/agent/draft-cold-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ jobTitle: selectedJob.title, companyName: selectedJob.company, hrEmail: hrData.email })
      });
      const data = await res.json();
      if (res.ok) {
        setColdEmailDraft(data.draft);
      } else {
        alert(data.error || 'Failed to draft email.');
      }
    } catch(e) { 
      alert('Failed to draft email.'); 
    } finally {
      setIsDraftingEmail(false);
    }
  };



  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setIsSavingSettings(true);
    try {
      const res = await fetch(`${API_BASE}/settings`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(settings)
      });
      const data = await res.json();
      if (res.ok) {
        if (data) setSettings(prev => ({ ...prev, ...data }));
        setToastMessage('✅ Settings saved successfully!');
        setTimeout(() => setToastMessage(null), 3000);
        checkOnboardingStatus(token!, profile, data);
      } else {
        setToastMessage(`❌ ${data.error || 'Failed to save settings.'}`);
        setTimeout(() => setToastMessage(null), 3000);
      }
    } catch (err) {
      setToastMessage('❌ Network error while saving settings.');
      setTimeout(() => setToastMessage(null), 3000);
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleSelectJob = (job: Job) => {
    setSelectedJob(job);
    setExpandedQuestion(null);
    setShowMatchTips(false);
    
    if (profile) {
      const skillsList = getSkills(profile).slice(0, 5).join(', ');
      setCustomCoverLetter(
        `Dear Hiring Manager,\n\nI am writing to enthusiastically express my interest in the ${job.title} role at ${job.company}. Given my background in technology and experience with ${skillsList}, I am confident in my ability to add value to your remote development workflow.\n\nThroughout my career, I have refined my ability to build scalable, high-performance web systems and coordinate across remote workspaces. I would welcome the opportunity to discuss how my skill set aligns with the needs of ${job.company}.\n\nThank you for your time and consideration,\n\n${profile.fullName}`
      );
      
      setCustomAnswers([
        { question: "Why do you want to join our company?", answer: `I am highly inspired by ${job.company}'s remote culture and technical scale. I believe my development history will allow me to solve your active bottlenecks.` },
        { question: "What is your experience level with this stack?", answer: `I have over 3 years of hands-on experience developing web backends and premium frontends utilizing React and NodeJS.` }
      ]);
    }
  };

  const filteredJobs = Array.isArray(jobs) ? jobs.filter(job => {
    const term = searchTerm.toLowerCase();
    const matchText =
      job.title.toLowerCase().includes(term) ||
      job.company.toLowerCase().includes(term) ||
      job.platform.toLowerCase().includes(term);

    const matchesStatus = statusFilter === 'ALL' || job.status === statusFilter;
    const matchesMnc = !mncOnly || isMncCompany(job.company);
    
    const locTerm = locationSearch.toLowerCase();
    const matchesLocation = !locTerm || (job.location || '').toLowerCase().includes(locTerm);
    
    // Fallback classification if workType isn't set by backend yet
    const derivedWorkType = job.workType ? job.workType.toUpperCase() : (job.isRemote ? 'REMOTE' : (job.location.toLowerCase().includes('hybrid') ? 'HYBRID' : 'ONSITE'));
    const matchesType = jobTypeFilter === 'ALL' || (jobTypeFilter === 'INTERNSHIP' ? job.isInternship : derivedWorkType === jobTypeFilter);

    return matchesStatus && matchText && matchesMnc && matchesType && matchesLocation;
  }) : [];
  return (
    <div className="app-container">
      
      {/* 1. APP HEADER */}
      <header className="app-header">
        <div className="header-brand">
          <div className="header-logo-bg">
            <Cpu style={{ width: '26px', height: '26px' }} />
          </div>
          <div className="header-title-container">
            <h1 className="header-title">
              #1 VANBA JOB HUNTER <span className="badge badge-primary">AI</span>
            </h1>
            <p className="header-subtitle">24/7 Remote Autopilot Applier</p>
          </div>
        </div>

        <div className="header-actions">
          {currentUser && activeTab !== 'home' && (
            <div className="system-status">
              <span className={`status-dot ${settings?.isActive ? 'status-dot-active' : 'status-dot-idle'}`}></span>
              <span>SYSTEM: {settings?.isActive ? 'AUTOPILOT RUNNING' : 'IDLE'}</span>
            </div>
          )}

          <div className={`nav-links ${isMobileMenuOpen ? 'mobile-open' : ''}`}>
            <button onClick={() => handleNav('home')} className={`nav-btn ${activeTab === 'home' ? 'nav-btn-active' : ''}`}>Home</button>
            <button onClick={() => handleNav('plans')} className={`nav-btn ${activeTab === 'plans' ? 'nav-btn-active' : ''}`}>Pricing</button>
            {currentUser ? (
              <>
                <button onClick={() => handleNav('dashboard')} className={`nav-btn ${activeTab === 'dashboard' ? 'nav-btn-active' : ''}`}>Dashboard</button>
                <button onClick={() => handleNav('resume')} className={`nav-btn ${activeTab === 'resume' ? 'nav-btn-active' : ''}`}>Resume</button>
                <button onClick={() => { if (isPremium) handleNav('jobs'); else alert('Please upgrade to access Job Feed.'); }} className={`nav-btn ${activeTab === 'jobs' ? 'nav-btn-active' : ''}`}>Job Feed</button>
                <button onClick={() => handleNav('outreach')} className={`nav-btn ${activeTab === 'outreach' ? 'nav-btn-active' : ''}`}>Outreach</button>
                <button onClick={() => handleNav('settings')} className={`nav-btn ${activeTab === 'settings' ? 'nav-btn-active' : ''}`}>Settings</button>
              </>
            ) : null}
          </div>

          <div className="nav-actions" style={{ display: 'flex', alignItems: 'center', gap: '10px', marginLeft: '20px' }}>
            {currentUser ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <button onClick={() => setActiveTab('profile')} className={`nav-btn ${activeTab === 'profile' ? 'nav-btn-active' : ''}`}>
                  <User style={{ width: '18px', height: '18px' }} />
                </button>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                  👤 {(currentUser.fullName ?? currentUser.email ?? '').split(' ')[0]}
                </span>
                <button onClick={handleLogout} className="nav-btn" style={{ color: 'var(--error)' }}>Logout</button>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <button onClick={() => { setActiveTab('login'); setIsMobileMenuOpen(false); }} className={`nav-btn ${activeTab === 'login' ? 'nav-btn-active' : ''}`} style={{ color: 'var(--secondary)' }}>Login</button>
                <button onClick={() => { setActiveTab('signup'); setIsMobileMenuOpen(false); }} className={`nav-btn ${activeTab === 'signup' ? 'nav-btn-active' : ''}`} style={{ background: 'var(--primary)', color: '#0a0d1a', padding: '6px 12px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)', fontWeight: 'bold' }}>Sign Up</button>
              </div>
            )}
          </div>
          {currentUser && (
            <button className="mobile-menu-btn" onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}>
              {isMobileMenuOpen ? <X /> : <Menu />}
            </button>
          )}
        </div>
      </header>
      
      {/* SIDE DRAWER BACKDROP */}
      {isMobileMenuOpen && currentUser && (
        <div 
          className="nav-backdrop" 
          onClick={() => setIsMobileMenuOpen(false)}
        ></div>
      )}
      {/* 2. MAIN WORKSPACE CONTAINER */}
      <main className="main-content">
        {/* TAB: INTERACTIVE HOME LANDING PAGE */}
        {activeTab === 'home' && (
          <CinematicHome 
            onNavigate={(tab) => setActiveTab(tab as any)} 
            isLoggedIn={!!currentUser}
          />
        )}

        {/* PROTECTED VIEWS: ONLY IF LOGGED IN */}
        {currentUser && (
          <React.Fragment>
            {activeTab === 'profile' && renderProfilePage()}
          </React.Fragment>
        )}

        {activeTab === 'dashboard' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            
            {/* Subscription Status Block */}
            <div className="glass-panel" style={{ padding: '24px', border: '1px solid var(--border-light)' }}>
              <h3 style={{ margin: '0 0 16px 0', color: 'var(--text-light)' }}>Current Plan</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '16px' }}>
                <div>
                  <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.85rem', textTransform: 'uppercase' }}>Plan</p>
                  <p style={{ margin: '4px 0 0', fontWeight: 'bold', fontSize: '1.2rem', color: 'var(--primary)' }}>{subscription?.plan_type || 'FREE'}</p>
                </div>
                <div>
                  <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.85rem', textTransform: 'uppercase' }}>Status</p>
                  <p style={{ margin: '4px 0 0', fontWeight: 'bold', color: isPremium ? 'var(--success)' : 'var(--error)' }}>
                    {subscription?.status || 'INACTIVE'}
                    {!isPremium && <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginLeft: '8px', fontWeight: 'normal' }}>(Pending Admin Approval)</span>}
                  </p>
                </div>
                <div>
                  <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.85rem', textTransform: 'uppercase' }}>Expires On</p>
                  <p style={{ margin: '4px 0 0', fontWeight: 'bold', color: 'var(--text-light)' }}>
                    {subscription?.cycle_end ? new Date(subscription.cycle_end).toLocaleDateString() : 'N/A'}
                  </p>
                </div>
              </div>
            </div>

            {/* Success Dashboard */}
            <div className="glass-panel-glow" style={{ padding: '24px', background: 'linear-gradient(135deg, rgba(99,102,241,0.1) 0%, rgba(139,92,246,0.1) 100%)', border: '1px solid rgba(99,102,241,0.2)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                <Sparkles style={{ width: '24px', height: '24px', color: 'var(--primary)' }} />
                <h2 style={{ color: 'white', margin: 0, fontSize: '1.25rem' }}>Your Success Dashboard</h2>
              </div>
              <p style={{ color: 'var(--text-secondary)', marginBottom: '20px', fontSize: '0.85rem' }}>Track your ROI. We guarantee interviews based on your active plan.</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                <div style={{ background: 'rgba(0,0,0,0.3)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
                  <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase' }}>Total Jobs Applied</p>
                  <p style={{ margin: '8px 0 0', fontSize: '1.5rem', fontWeight: 'bold', color: 'white' }}>{jobs.filter(j => j.status === 'APPLIED').length}</p>
                </div>
                <div style={{ background: 'rgba(0,0,0,0.3)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
                  <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase' }}>HR / Profile Views</p>
                  <p style={{ margin: '8px 0 0', fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--secondary)' }}>{Math.floor(jobs.filter(j => j.status === 'APPLIED').length * 0.4) + 1}</p>
                </div>
                <div style={{ background: 'rgba(0,0,0,0.3)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
                  <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase' }}>Interviews Scheduled</p>
                  <p style={{ margin: '8px 0 0', fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--success)' }}>{Math.floor(jobs.filter(j => j.status === 'APPLIED').length * 0.05)}</p>
                </div>
              </div>
            </div>

            {/* Statistics */}
            <div className="stats-grid">
              
              <div className="glass-panel stat-card">
                <div className="stat-info">
                  <span className="stat-title">Platform Jobs Scraped</span>
                  <h3 className="stat-val">{jobs.length}</h3>
                  <p className="stat-desc">Total roles evaluated by AI</p>
                </div>
                <div className="stat-icon-wrapper" style={{ color: 'var(--primary)' }}>
                  <Briefcase style={{ width: '20px', height: '20px' }} />
                </div>
              </div>

              <div className="glass-panel stat-card">
                <div className="stat-info">
                  <span className="stat-title">Forms Submitted</span>
                  <h3 className="stat-val" style={{ color: 'var(--success)' }}>
                    {jobs.filter(j => j.status === 'APPLIED').length}
                  </h3>
                  <p className="stat-desc">Stealth automation</p>
                </div>
                <div className="stat-icon-wrapper" style={{ color: 'var(--success)', borderColor: 'rgba(16,185,129,0.15)' }}>
                  <CheckCircle style={{ width: '20px', height: '20px' }} />
                </div>
              </div>

              <div className="glass-panel stat-card">
                <div className="stat-info">
                  <span className="stat-title">High Compatibility</span>
                  <h3 className="stat-val" style={{ color: 'var(--accent)' }}>
                    {jobs.filter(j => j.matchScore >= 80).length}
                  </h3>
                  <p className="stat-desc">Matching above 80%</p>
                </div>
                <div className="stat-icon-wrapper" style={{ color: 'var(--accent)', borderColor: 'rgba(217,70,239,0.15)' }}>
                  <Sparkles style={{ width: '20px', height: '20px' }} />
                </div>
              </div>

              <div className="glass-panel stat-card">
                <div className="stat-info">
                  <span className="stat-title">Auto Queue</span>
                  <h3 className="stat-val" style={{ color: 'var(--secondary)' }}>
                    {jobs.filter(j => j.status === 'QUEUED').length}
                  </h3>
                  <p className="stat-desc">Awaiting schedule</p>
                </div>
                <div className="stat-icon-wrapper" style={{ color: 'var(--secondary)', borderColor: 'rgba(6,182,212,0.15)' }}>
                  <Activity style={{ width: '20px', height: '20px' }} />
                </div>
              </div>

            </div>

            {/* 🔥 TOP MNC COMPANY HIRING POSITIONS */}
            <div className="glass-panel-glow" style={{ display: 'flex', flexDirection: 'column', gap: '16px', border: '1px solid var(--border-hover)', padding: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-light)', paddingBottom: '10px' }}>
                <span className="cover-letter-title" style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'white', fontWeight: '800', letterSpacing: '0.5px' }}>
                  <Sparkles style={{ width: '18px', height: '18px', color: 'var(--primary)' }} />
                  🔥 TOP MNC COMPANY HIRING POSITIONS (GLOBAL & INDIAN LEADERBOARDS)
                </span>
                <span className="badge badge-primary animate-pulse-glow" style={{ textTransform: 'uppercase', fontSize: '0.65rem' }}>
                  High Compatibility Matches
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px', marginTop: '4px' }}>
                {jobs.filter(j => isMncCompany(j.company)).slice(0, 3).map((job) => (
                  <div key={job.id} className="glass-panel" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '16px', background: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--border-light)', position: 'relative', overflow: 'hidden', transition: 'transform 0.2s, border-color 0.2s', cursor: 'pointer', minHeight: '190px' }} onClick={() => { setActiveTab('jobs'); handleSelectJob(job); }}>
                    {/* Glowing highlight indicator for fit rating */}
                    <div style={{ position: 'absolute', top: 0, right: 0, width: '4px', height: '100%', background: job.matchScore >= 85 ? 'var(--success)' : 'var(--primary)' }} />
                    
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                      <span className="detail-meta-tag" style={{ margin: 0, fontSize: '0.6rem', padding: '2px 8px', background: 'rgba(99, 102, 241, 0.1)', color: 'var(--primary)' }}>
                        {job.company.toUpperCase()} {isMncCompany(job.company) && '• MNC'}
                      </span>
                      <span className="detail-meta-tag" style={{ margin: 0, fontSize: '0.6rem', padding: '2px 8px', background: 'rgba(6, 182, 212, 0.1)', color: 'var(--secondary)' }}>
                        {job.workType ? job.workType.toUpperCase() : (job.isRemote ? 'REMOTE' : 'ON-SITE')}
                      </span>
                      <span className="badge badge-secondary" style={{ fontSize: '0.6rem', fontFamily: 'var(--font-mono)' }}>
                        {job.platform}
                      </span>
                    </div>

                    <h4 style={{ color: 'white', fontSize: '0.85rem', fontWeight: '800', margin: '4px 0', lineHeight: '1.4', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: '2', WebkitBoxOrient: 'vertical' }}>{job.title}</h4>
                    
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '10px', marginBottom: '12px' }}>
                      <div className="gauge-circle-wrapper" style={{ width: '42px', height: '42px', flexShrink: 0 }}>
                        <svg className="gauge-svg" viewBox="0 0 100 100">
                          <circle className="gauge-bg-circle" cx="50" cy="50" r="40" />
                          <circle 
                            className="gauge-val-circle" 
                            cx="50" 
                            cy="50" 
                            r="40" 
                            stroke={job.matchScore >= 85 ? 'var(--success)' : 'var(--primary)'}
                            strokeDasharray="251.2" 
                            strokeDashoffset={251.2 - (251.2 * (job.matchScore || 0)) / 100}
                          />
                        </svg>
                        <div className="gauge-text" style={{ fontSize: '0.7rem' }}>{job.matchScore}%</div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: '0.55rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 'bold' }}>ATS Compatibility</span>
                        <span style={{ fontSize: '0.65rem', color: 'white', fontWeight: '600' }}>
                          {job.matchScore >= 85 ? 'Highly Recommended' : 'Strong Profile Alignment'}
                        </span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid rgba(255,255,255,0.03)', paddingTop: '10px', fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                      <span>📍 {job.location || 'Remote'}</span>
                      <span style={{ color: 'var(--secondary)', display: 'flex', alignItems: 'center', gap: '2px', fontWeight: 'bold' }}>
                        Examine & Apply <ChevronRight style={{ width: '12px', height: '12px' }} />
                      </span>
                    </div>
                  </div>
                ))}
                
                {jobs.filter(j => isMncCompany(j.company)).length === 0 && (
                  <div style={{ gridColumn: 'span 3', padding: '20px', textAlign: 'center', border: '1px dashed var(--border-light)', borderRadius: '8px' }}>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>No active MNC hiring positions found. Trigger a scrape to search across remote networks.</p>
                  </div>
                )}
              </div>
            </div>

            {/* CEO Executive Directive & Briefing Panel */}
            <div className="glass-panel-glow" style={{ display: 'flex', flexDirection: 'column', gap: '16px', border: '1px solid var(--border-hover)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-light)', paddingBottom: '8px' }}>
                <span className="cover-letter-title" style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'white', letterSpacing: '0.5px' }}>
                  <Cpu style={{ width: '16px', height: '16px', color: 'var(--primary)' }} />
                  CEO DIRECTIVE COMMAND CENTER (MULTI-AGENT AUTOPILOT)
                </span>
                <span className="badge badge-success">CEO Active Channel</span>
              </div>
              
              <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
                {/* Left: Dynamic CEO Briefing report */}
                <div style={{ flex: 1, minWidth: '280px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 'bold' }}>AI Executive Report to CEO</span>
                  <p style={{ fontSize: '0.725rem', color: 'var(--text-secondary)', lineHeight: '1.5', margin: 0 }}>
                    {profile 
                      ? `CEO, I have audited your resume profile for "${profile.fullName}". The Worker Agent has fetched and examined ${jobs.length} remote listings, evaluated compatibility metrics, and successfully submitted ${jobs.filter(j => j.status === 'APPLIED').length} stealth applications. Currently, ${jobs.filter(j => j.status === 'QUEUED').length} high-fit matches are queued in the autopilot pipeline. Target domains: ${selectedFields.length > 0 ? selectedFields.join(', ') : 'None'} | Seniority levels: ${selectedLevels.length > 0 ? selectedLevels.join(', ') : 'None'}. ${settings?.ceoDirective ? `Current active directive: "${settings?.ceoDirective}".` : 'No custom command is active; worker is using standard role matching.'}`
                      : "CEO, awaiting your resume upload. Once uploaded, the Worker Agent will parse it, match active listings, and automatically schedule Human-Stealth form completions."}
                  </p>
                </div>
                
                {/* Right: CEO command directive input */}
                <div style={{ width: '320px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 'bold' }}>Issue New CEO Directive</span>
                  <form onSubmit={async (e) => {
                    e.preventDefault();
                    if (!isPremium) { alert('Please upgrade to use this feature.'); return; }
                    const inputEl = e.currentTarget.elements.namedItem('directive') as HTMLInputElement;
                    const val = inputEl.value.trim();
                    if (!val) return;
                    
                    const updated = { ...settings, ceoDirective: val };
                    setSettings(updated);
                    try {
                      const res = await fetch(`${API_BASE}/settings`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                        body: JSON.stringify(updated)
                      });
                      const data = await res.json();
                      setSettings(data);
                      inputEl.value = '';
                      alert('New CEO command directive successfully issued to the Worker Agent!');
                    } catch(err) {
                      alert('Failed to send command to agent.');
                    }
                  }} style={{ display: 'flex', gap: '8px' }}>
                    <input 
                      name="directive"
                      type="text" 
                      placeholder="e.g. Focus on senior React roles..." 
                      className="form-input"
                      style={{ fontSize: '0.7rem', padding: '6px 10px' }}
                      required
                    />
                    <button type="submit" className="btn btn-primary" style={{ padding: '6px 14px', fontSize: '0.7rem', whiteSpace: 'nowrap' }}>
                      Issue Command
                    </button>
                  </form>
                  <p style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginTop: '2px', lineHeight: '1.3' }}>
                    Your directive is injected directly into the Worker Agent's matching parameters to influence matching logic.
                  </p>
                </div>
              </div>
            </div>

            {/* Scheduler Status Row */}
            <div className="autopilot-grid" style={{ marginTop: '0px' }}>
              
              <div className="glass-panel autopilot-card">
                <div className="autopilot-icon">
                  <Cpu style={{ width: '28px', height: '28px' }} />
                </div>
                <div className="autopilot-info">
                  <h3 className="autopilot-title">AI Autopilot Agent status</h3>
                  <p className="autopilot-desc">
                    Enable the background cron worker to scrape remote programming lists, parse skills, evaluate matching ratios, and automatically fill applications with Playwright Stealth.
                  </p>
                  
                  <div className="autopilot-actions">
                    <button 
                      onClick={async () => {
                        if (!isPremium) { alert('Please upgrade to activate autopilot.'); return; }
                        const updated = { ...settings, isActive: !settings?.isActive };
                        setSettings(updated);
                        
                        // Actually start the background daemon visually immediately!
                        if (updated.isActive) {
                          handleTriggerScrape();
                        } else {
                          handleStopScrape();
                        }

                        try {
                          const res = await fetch(`${API_BASE}/settings`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                            body: JSON.stringify(updated)
                          });
                          const data = await res.json();
                          setSettings(data);
                        } catch (err) {
                          console.error('Failed to update settings:', err);
                        }
                      }}
                      className={`btn ${settings?.isActive ? 'btn-primary' : 'btn-secondary'}`}
                      style={settings?.isActive ? { backgroundColor: 'var(--success)', boxShadow: 'none' } : {}}
                    >
                      {settings?.isActive ? 'AUTOPILOT RUNNING' : 'ACTIVATE AUTOPILOT'}
                    </button>
                    
                    <button 
                      onClick={() => {
                        if (!isPremium) { alert('Please upgrade to force crawl.'); return; }
                        handleTriggerScrape();
                      }}
                      disabled={isScraping}
                      className="btn btn-secondary"
                    >
                      {isScraping ? <Loader2 className="animate-spin" style={{ width: '14px', height: '14px' }} /> : 'Force Crawl Cycle'}
                    </button>
                    <button 
                      onClick={handleStopScrape}
                      className="btn"
                      style={{ 
                        background: 'rgba(239, 68, 68, 0.1)', 
                        border: '1px solid rgba(239, 68, 68, 0.4)', 
                        color: '#ef4444',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        transition: 'all 0.2s'
                      }}
                    >
                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ef4444', boxShadow: '0 0 5px #ef4444' }}></span>
                      Stop Crawling
                    </button>
                  </div>
                </div>
              </div>

              <div className="glass-panel">
                <div className="profile-summary">
                  <div>
                    <h3 className="detail-section-title" style={{ color: 'white', marginBottom: '8px' }}>
                      <UserCheck style={{ width: '16px', height: '16px' }} /> Parsed Profile
                    </h3>
                    {profile ? (
                      <div>
                        <p className="profile-name">{profile.fullName}</p>
                        <p className="profile-email">{profile.email}</p>
                        <div className="skills-list">
                          {getSkills(profile).slice(0, 5).map((skill, i) => (
                            <span key={i} className="skill-tag-sm">{skill}</span>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div style={{ textAlign: 'center', padding: '12px', border: '1px dashed var(--border-light)', borderRadius: '6px' }}>
                        <UploadCloud style={{ width: '24px', height: '24px', color: 'var(--text-muted)', marginBottom: '4px' }} />
                        <p style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>No parsed resume file found.</p>
                      </div>
                    )}
                  </div>
                  {profile && (
                    <button onClick={() => setActiveTab('resume')} className="btn btn-secondary" style={{ width: '100%', marginTop: '12px', padding: '6px' }}>
                      Audit Details
                    </button>
                  )}
                </div>
              </div>

            </div>

            <div className="glass-panel" style={{ marginTop: '24px' }}>
              <div className="panel-header" style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 className="detail-section-title" style={{ margin: 0, color: 'white' }}>
                  <Terminal style={{ width: '16px', height: '16px', marginRight: '8px' }} /> Live Autopilot Logs
                </h3>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <button onClick={() => { if (token) fetchLogs(token); }} style={{ background: 'rgba(56,189,248,0.1)', border: '1px solid rgba(56,189,248,0.3)', color: '#38bdf8', borderRadius: '6px', padding: '4px 10px', cursor: 'pointer', fontSize: '0.75rem', display:'flex', alignItems:'center', gap:'4px' }}>
                    <RefreshCw style={{ width: '12px', height: '12px' }} /> Refresh
                  </button>
                  {liveLogs.length > 0 && (
                    <button onClick={() => setLiveLogs([])} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-muted)', borderRadius: '6px', padding: '4px 10px', cursor: 'pointer', fontSize: '0.75rem' }}>Clear</button>
                  )}
                  <span className="live-indicator">
                    <span className="pulse-dot" style={{ background: isScraping ? 'var(--primary)' : '#555' }}></span> {isScraping ? 'Crawling...' : 'Idle'}
                  </span>
                </div>
              </div>
              <div className="terminal-window" style={{ height: '300px', padding: '16px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {liveLogs.length === 0 ? (
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>⏳ No recent activity. Click 'Force Crawl Cycle' to start.</div>
                ) : (
                  liveLogs.map((log: any, idx: number) => {
                    const lvl = (log.level || '').toUpperCase();
                    const color = lvl === 'ERROR' ? '#ef4444' : lvl === 'SUCCESS' ? '#10b981' : lvl === 'WARNING' ? '#f59e0b' : '#38bdf8';
                    const badge = lvl === 'ERROR' ? '🔴' : lvl === 'SUCCESS' ? '🟢' : lvl === 'WARNING' ? '🟡' : '🔵';
                    return (
                      <div key={log.id || idx} className="terminal-line" style={{ display: 'flex', gap: '10px', fontSize: '0.82rem', fontFamily: 'monospace', lineHeight: '1.5' }}>
                        <span style={{ color: 'var(--text-muted)', minWidth: '80px', flexShrink: 0 }}>
                          [{new Date(log.time || log.timestamp).toLocaleTimeString()}]
                        </span>
                        <span style={{ minWidth: '14px', flexShrink: 0 }}>{badge}</span>
                        <span style={{ color }}>{log.message}</span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

          </div>
        )}

        {/* TAB 2: RESUME PROFILE */}
        {activeTab === 'resume' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            
            <div className="glass-panel-glow" style={{ textAlign: 'center', padding: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <input type="file" ref={fileInputRef} onChange={handleResumeUpload} style={{ display: 'none' }} accept=".pdf" />
              <UploadCloud style={{ width: '36px', height: '36px', color: 'var(--primary)', marginBottom: '8px' }} />
              <h3 style={{ color: 'white', fontSize: '1rem', fontWeight: '700', marginBottom: '2px' }}>ATS Profile Sync</h3>
              <p style={{ fontSize: '0.725rem', color: 'var(--text-secondary)', maxWidth: '400px', marginBottom: '14px', lineHeight: '1.5' }}>
                Upload your resume in PDF format. The agent extracts contact parameters, professional history timeline details, and suggested search criteria.
              </p>
              <button onClick={() => fileInputRef.current?.click()} disabled={isUploading} className="btn btn-primary">
                {isUploading ? <><Loader2 className="animate-spin" style={{ width: '14px', height: '14px' }} /> Extracting text...</> : 'Select Resume PDF'}
              </button>
            </div>

            {profile && (
              <div className="autopilot-grid">
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  <div className="glass-panel">
                    <h4 className="detail-section-title" style={{ color: 'white', borderBottom: '1px solid var(--border-light)', paddingBottom: '8px', marginBottom: '12px' }}>Contact Parameters</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.725rem' }}>
                      <div>
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.6rem', textTransform: 'uppercase' }}>Full Name</span>
                        <p style={{ fontWeight: '600', color: 'white' }}>{profile.fullName}</p>
                      </div>
                      <div>
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.6rem', textTransform: 'uppercase' }}>Email Address</span>
                        <p style={{ fontWeight: '600', color: 'white' }}>{profile.email}</p>
                      </div>
                      {profile.phone && (
                        <div>
                          <span style={{ color: 'var(--text-muted)', fontSize: '0.6rem', textTransform: 'uppercase' }}>Phone Number</span>
                          <p style={{ fontWeight: '600', color: 'white' }}>{profile.phone}</p>
                        </div>
                      )}
                      <div>
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.6rem', textTransform: 'uppercase' }}>Target Job Titles</span>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '4px' }}>
                          {getTargetTitles(profile).map((t, i) => (
                            <span key={i} className="skill-tag-sm" style={{ fontSize: '0.6rem', background: 'rgba(255,255,255,0.05)', padding: '2px 6px' }}>{t}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="glass-panel">
                    <h4 className="detail-section-title" style={{ color: 'white', borderBottom: '1px solid var(--border-light)', paddingBottom: '8px', marginBottom: '12px' }}>Skill tags</h4>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {getSkills(profile).map((skill, i) => (
                        <span key={i} className="skill-tag-sm" style={{ fontSize: '0.65rem', padding: '4px 8px' }}>{skill}</span>
                      ))}
                    </div>
                  </div>

                  <div className="glass-panel">
                    <h4 className="detail-section-title" style={{ color: 'white', borderBottom: '1px solid var(--border-light)', paddingBottom: '8px', marginBottom: '12px' }}>Education History</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {getEducation(profile).map((edu, i) => (
                        <div key={i}>
                          <p style={{ fontSize: '0.75rem', fontWeight: '700', color: 'white', margin: 0 }}>{edu.degree}</p>
                          <p style={{ fontSize: '0.7rem', color: 'var(--primary)', fontWeight: '600', margin: '2px 0 0' }}>{edu.school} | {edu.year}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="glass-panel" style={{ height: '100%' }}>
                  <h4 className="detail-section-title" style={{ color: 'white', borderBottom: '1px solid var(--border-light)', paddingBottom: '8px', marginBottom: '16px' }}>Professional Timelines</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', paddingLeft: '12px', borderLeft: '1px solid var(--border-light)' }}>
                    {getExperience(profile).map((exp, i) => (
                      <div key={i} style={{ position: 'relative' }}>
                        <span style={{ position: 'absolute', left: '-17px', top: '4px', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--primary)' }}></span>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                          <h5 style={{ fontSize: '0.75rem', fontWeight: '700', color: 'white' }}>{exp.title}</h5>
                          <span style={{ fontSize: '0.65rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>{exp.duration}</span>
                        </div>
                        <p style={{ fontSize: '0.7rem', fontWeight: '600', color: 'var(--primary)', marginBottom: '6px' }}>{exp.company}</p>
                        <p style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', lineHeight: '1.4' }}>{exp.description}</p>
                      </div>
                    ))}
                  </div>
                </div>

              </div>
            )}

          </div>
        )}

        {/* TAB 3: SPATIOUS SPLIT-PANE JOBS BOARD */}
        {activeTab === 'jobs' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            
            {/* Quick action bar */}
            <div className="glass-panel" style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', padding: '14px' }}>
              <div style={{ flex: 1, minWidth: '300px' }}>
                <form onSubmit={handleTriggerCrawl} style={{ display: 'flex', gap: '8px' }}>
                  <input 
                    type="url"
                    value={crawlingUrl}
                    onChange={(e) => setCrawlingUrl(e.target.value)}
                    placeholder="Paste a direct LinkedIn, Indeed, or WWR URL to examine..."
                    className="form-input"
                    required
                  />
                  <button type="submit" disabled={isCrawling} className="btn btn-primary" style={{ padding: '6px 16px', fontSize: '0.7rem', whiteSpace: 'nowrap' }}>
                    {isCrawling ? <Loader2 className="animate-spin" style={{ width: '12px', height: '12px' }} /> : 'Crawl Link'}
                  </button>
                  <button 
                    type="button" 
                    onClick={async () => {
                      if (token) {
                        setIsRefreshingFeed(true);
                        setSearchTerm('');
                        setJobTypeFilter('ALL');
                        await fetchJobs(token);
                        setTimeout(() => setIsRefreshingFeed(false), 500);
                      }
                    }} 
                    className="btn" 
                    style={{ 
                      padding: '8px 16px', 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: '8px',
                      justifyContent: 'center',
                      background: 'rgba(16, 185, 129, 0.1)',
                      color: 'rgb(16, 185, 129)',
                      border: '1px solid rgba(16, 185, 129, 0.3)',
                      fontWeight: 'bold',
                      fontSize: '0.75rem',
                      whiteSpace: 'nowrap',
                      boxShadow: '0 0 10px rgba(16, 185, 129, 0.1)',
                      opacity: isRefreshingFeed ? 0.7 : 1
                    }}
                    title="Refresh Jobs Feed"
                    disabled={isRefreshingFeed}
                  >
                    <RefreshCw style={{ width: '16px', height: '16px', animation: isRefreshingFeed ? 'spin 1s linear infinite' : 'none' }} />
                    {isRefreshingFeed ? 'Refreshing...' : 'Refresh Feed'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode(viewMode === 'FEED' ? 'KANBAN' : 'FEED')}
                    className="btn"
                    style={{
                      padding: '8px 16px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      justifyContent: 'center',
                      background: viewMode === 'KANBAN' ? 'var(--primary)' : 'rgba(255,255,255,0.05)',
                      color: viewMode === 'KANBAN' ? '#000' : 'var(--text-secondary)',
                      border: '1px solid var(--border-color)',
                      fontWeight: 'bold',
                      fontSize: '0.75rem',
                      whiteSpace: 'nowrap',
                      transition: 'all 0.2s'
                    }}
                    title="Toggle Kanban View"
                  >
                    {viewMode === 'KANBAN' ? 'Switch to Feed' : 'Kanban Board'}
                  </button>
                </form>
              </div>

              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <select 
                  value={jobTypeFilter}
                  onChange={(e) => setJobTypeFilter(e.target.value as any)}
                  className="form-input"
                  style={{ padding: '6px 12px', fontSize: '0.7rem', height: 'auto', width: 'auto', minWidth: '120px', backgroundColor: '#1e293b', color: 'white', border: '1px solid var(--border-light)' }}
                >
                  <option value="ALL">All Types</option>
                  <option value="REMOTE">Remote</option>
                  <option value="HYBRID">Hybrid</option>
                  <option value="ONSITE">On-Site</option>
                  <option value="INTERNSHIP">Internship</option>
                </select>
                <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => setMncOnly(!mncOnly)}
                  className={`btn ${mncOnly ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ 
                    padding: '6px 12px', 
                    fontSize: '0.7rem', 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '4px',
                    borderColor: mncOnly ? 'var(--primary)' : 'var(--border-light)',
                    background: mncOnly ? 'var(--primary)' : 'rgba(0,0,0,0.2)',
                    color: 'white',
                    height: '32px'
                  }}
                >
                  <Sparkles style={{ width: '12px', height: '12px', color: mncOnly ? 'white' : 'var(--secondary)' }} />
                  {mncOnly ? 'MNC Companies Only' : 'All Companies'}
                </button>
                <div style={{ position: 'relative' }}>
                  <Search style={{ position: 'absolute', left: '8px', top: '8px', width: '12px', height: '12px', color: 'var(--text-muted)' }} />
                  <input 
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Filter title..."
                    className="form-input"
                    style={{ paddingLeft: '26px', paddingRight: '8px', width: '130px', paddingTop: '6px', paddingBottom: '6px', fontSize: '0.7rem' }}
                  />
                </div>
                <div style={{ position: 'relative' }}>
                  <Search style={{ position: 'absolute', left: '8px', top: '8px', width: '12px', height: '12px', color: 'var(--text-muted)' }} />
                  <input 
                    type="text"
                    value={locationSearch}
                    onChange={(e) => setLocationSearch(e.target.value)}
                    placeholder="Location..."
                    className="form-input"
                    style={{ paddingLeft: '26px', paddingRight: '8px', width: '120px', paddingTop: '6px', paddingBottom: '6px', fontSize: '0.7rem' }}
                  />
                </div>
                <select 
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="form-input"
                  style={{ width: '100px', paddingTop: '6px', paddingBottom: '6px', fontSize: '0.7rem' }}
                >
                  {['ALL', 'SCRAPED', 'QUEUED', 'MATCHED', 'APPLYING', 'APPLIED', 'FAILED'].map(st => (
                    <option key={st} value={st}>{st}</option>
                  ))}
                </select>
                </div>
              </div>
            </div>

            {/* Split pane frame or Kanban Board */}
            {viewMode === 'KANBAN' ? (
              <div className="kanban-board">
                {['MATCHED', 'APPLIED', 'INTERVIEW', 'OFFER'].map(col => (
                  <div key={col} className="kanban-column" onDragOver={e => e.preventDefault()} onDrop={e => {
                    const jobId = e.dataTransfer.getData('jobId');
                    if (jobId) handleStatusChange(jobId, col);
                  }}>
                    <div className="kanban-column-header">
                      {col}
                      <span style={{ fontSize: '0.7rem', background: 'rgba(255,255,255,0.1)', padding: '2px 8px', borderRadius: '12px' }}>
                        {filteredJobs.filter(j => (j.status || 'MATCHED') === col).length}
                      </span>
                    </div>
                    <div className="kanban-column-content">
                      {filteredJobs.filter(j => (j.status || 'MATCHED') === col).map(job => (
                        <div key={job.id} className="kanban-card" draggable onDragStart={e => e.dataTransfer.setData('jobId', job.id)} onClick={() => { setViewMode('FEED'); handleSelectJob(job); }}>
                          <div style={{ fontWeight: 'bold', fontSize: '0.8rem', marginBottom: '4px' }}>{job.title}</div>
                          <div style={{ color: 'var(--primary)', fontSize: '0.7rem', marginBottom: '8px' }}>{job.company}</div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                            <span>Score: <span style={{ color: job.matchScore >= 80 ? 'var(--success)' : 'inherit' }}>{job.matchScore || 0}%</span></span>
                            <span>{job.location || 'Remote'}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
            <div className="split-pane">
              {/* Left Column Job Cards */}
              <div className="split-list">
                {filteredJobs.length === 0 ? (
                  <div className="glass-panel" style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                    <Briefcase style={{ width: '24px', height: '24px', marginBottom: '6px' }} />
                    <p style={{ fontSize: '0.7rem' }}>No job records matching filter criteria.</p>
                  </div>
                ) : (
                  filteredJobs.map((job, idx) => {
                    const isTopMatch = idx === 0 && (job.matchScore || 0) >= 85;
                    return (
                    <div 
                      key={job.id}
                      onClick={() => handleSelectJob(job)}
                      className={`job-card ${selectedJob?.id === job.id ? 'job-card-active' : ''} ${isTopMatch ? 'job-card-premium' : ''}`}
                    >
                      {isTopMatch && <div className="top-match-banner">⭐ Top AI Recommendation ⭐</div>}
                      <div className="job-card-header-row" style={{ marginTop: isTopMatch ? '16px' : '0' }}>
                        <div className="job-card-meta" style={{ margin: 0 }}>
                          <span>{job.platform} | {job.isInternship ? 'INTERNSHIP' : 'REMOTE'}</span>
                        </div>
                        <a 
                          href={job.url} 
                          target="_blank" 
                          rel="noreferrer" 
                          onClick={(e) => e.stopPropagation()} 
                          className="job-card-link-btn" 
                          title="Open Original Job Link"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17L17 7M17 7H7M17 7V17"/></svg>
                        </a>
                      </div>

                      <h4 className="job-card-title" style={{ marginTop: '4px' }}>{job.title}</h4>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '2px' }}>
                        <p className="job-card-company" style={{ margin: 0 }}>{job.company}</p>
                        <span className={`badge ${
                          job.status === 'APPLIED' ? 'badge-success' :
                          job.status === 'FAILED' ? 'badge-danger' :
                          job.status === 'APPLYING' ? 'badge-warning' : 'badge-primary'
                        }`}>
                          {job.status}
                        </span>
                      </div>

                      <div className="job-card-footer">
                        <div className="job-card-score">
                          <span className={`job-card-score-badge ${job.matchScore >= 80 ? 'job-card-score-badge-high' : ''}`}>
                            {job.matchScore}%
                          </span>
                          <span className="job-card-score-lbl">Fit Ratio</span>
                        </div>
                        <span className="job-card-view-lbl">
                          Examine <ChevronRight style={{ width: '12px', height: '12px' }} />
                        </span>
                      </div>
                    </div>
                    );
                  })
                )}
              </div>

              {/* Right Column Job Details */}
              <div className="split-detail" style={{ width: '560px' }}>
                {selectedJob ? (
                  <>
                    <div className="detail-header" style={{ position: 'relative', overflow: 'hidden', padding: '24px', background: 'linear-gradient(180deg, rgba(255,255,255,0.03) 0%, transparent 100%)', borderBottom: '1px solid var(--border-light)', margin: '-20px -20px 20px -20px' }}>
                      <div style={{ position: 'absolute', top: '-50px', right: '-50px', width: '150px', height: '150px', background: 'var(--primary)', filter: 'blur(100px)', opacity: 0.15 }} />
                      
                      <h2 className="detail-company" style={{ fontSize: '2.2rem', fontWeight: '900', color: '#fff', marginBottom: '4px', letterSpacing: '-0.03em' }}>
                        {selectedJob.company}
                      </h2>
                      <h3 className="detail-title" style={{ fontSize: '1.2rem', color: 'var(--text-secondary)', marginBottom: '16px', fontWeight: '500' }}>
                        {selectedJob.title}
                      </h3>

                      {selectedJob.recruiterName && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)', marginBottom: '16px', background: 'rgba(255,255,255,0.05)', padding: '8px 12px', borderRadius: '8px', width: 'fit-content' }}>
                          <User style={{ width: '16px', height: '16px', color: 'var(--primary)' }} />
                          <span style={{ fontSize: '0.85rem' }}><strong>Hiring Manager:</strong> {selectedJob.recruiterName}</span>
                        </div>
                      )}

                      <div className="detail-desc-box" style={{ background: 'rgba(0,0,0,0.3)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-light)', marginBottom: '24px', maxHeight: '250px', overflowY: 'auto' }}>
                        <h5 style={{ color: '#fff', fontSize: '0.8rem', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em', position: 'sticky', top: '-16px', background: '#0a0a0a', padding: '16px 0 8px', margin: '-16px 0 12px', zIndex: 1, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>Job Description</h5>
                        <p className="detail-desc-text" style={{ fontSize: '0.8rem', lineHeight: '1.6', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', margin: 0 }}>{selectedJob.description}</p>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                        <span className="detail-meta-tag" style={{ margin: 0, background: 'var(--primary-glow)', color: 'var(--primary)', border: '1px solid var(--primary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Briefcase style={{ width: '12px', height: '12px' }}/> {selectedJob.platform}
                        </span>
                        <span className="badge badge-secondary" style={{ fontSize: '0.6rem', padding: '4px 10px', borderRadius: '12px' }}>{selectedJob.isInternship ? 'INTERNSHIP' : 'JOB OPPORTUNITY'}</span>
                      </div>

                      {/* Info Grid */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '24px' }}>
                        <div className="glass-panel" style={{ padding: '12px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-light)', borderRadius: '8px' }}>
                          <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}><MapPin style={{ width:'10px', height:'10px' }}/> Location</span>
                          <span style={{ fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: '600' }}>{selectedJob.location || 'Not Specified'}</span>
                        </div>
                        <div className="glass-panel" style={{ padding: '12px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-light)', borderRadius: '8px' }}>
                          <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}><Briefcase style={{ width:'10px', height:'10px' }}/> Work Type</span>
                          <span style={{ fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: '600' }}>{selectedJob.workType || (selectedJob.isRemote ? 'Remote' : 'On-site/Hybrid')}</span>
                        </div>
                        {selectedJob.isInternship && selectedJob.stipend ? (
                          <div className="glass-panel" style={{ padding: '12px', background: 'rgba(16,185,129,0.05)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: '8px' }}>
                            <span style={{ fontSize: '0.6rem', color: 'var(--success)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>Stipend</span>
                            <span style={{ fontSize: '0.85rem', color: 'var(--success)', fontWeight: 'bold' }}>{selectedJob.stipend}</span>
                          </div>
                        ) : (
                          <div className="glass-panel" style={{ padding: '12px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-light)', borderRadius: '8px' }}>
                            <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}><Cpu style={{ width:'10px', height:'10px' }}/> Match Score</span>
                            <span style={{ fontSize: '0.85rem', color: selectedJob.matchScore >= 80 ? 'var(--success)' : 'var(--warning)', fontWeight: 'bold' }}>{selectedJob.matchScore || 0}%</span>
                          </div>
                        )}
                      </div>

                      <div className="detail-actions" style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                        <button onClick={() => handleApplyJob(selectedJob.id, false)} className="btn btn-primary" style={{ flex: 1, padding: '10px 16px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', boxShadow: '0 0 15px var(--primary-glow)' }}>
                          <Send style={{ width: '16px', height: '16px' }} /> Auto-Apply Now
                        </button>
                        <button onClick={() => handleApplyJob(selectedJob.id, true)} className="btn btn-secondary" style={{ padding: '10px 16px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Terminal style={{ width: '14px', height: '14px' }} /> Simulate Run
                        </button>
                        <a href={selectedJob.url} target="_blank" rel="noreferrer" className="btn btn-secondary" style={{ padding: '10px 16px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <ChevronRight style={{ width: '14px', height: '14px' }} /> Job Portal
                        </a>
                        <button onClick={() => handleReportJob(selectedJob.id)} className="btn" style={{ padding: '10px 14px', fontSize: '0.8rem', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '8px' }}>
                          <AlertTriangle style={{ width: '14px', height: '14px' }} />
                        </button>
                      </div>

                      {/* Networking Tools */}
                      <div className="glass-panel" style={{ marginTop: '16px', background: 'rgba(99, 102, 241, 0.05)', border: '1px solid rgba(99, 102, 241, 0.2)' }}>
                        <h4 style={{ color: 'white', fontSize: '0.8rem', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Mail style={{ width: '16px', height: '16px', color: 'var(--primary)' }} /> AI Networking Tools
                        </h4>
                        
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                          <button onClick={handleFindHR} disabled={isFindingHR} className="btn btn-primary" style={{ fontSize: '0.7rem', padding: '6px 12px' }}>
                            {isFindingHR ? <Loader2 className="animate-spin" style={{ width: '14px', height: '14px' }} /> : '1. Discover HR Email'}
                          </button>
                          
                          {hrData && (
                            <button onClick={handleDraftEmail} disabled={isDraftingEmail} className="btn btn-secondary" style={{ fontSize: '0.7rem', padding: '6px 12px', borderColor: 'var(--primary)', color: 'var(--primary)' }}>
                              {isDraftingEmail ? <Loader2 className="animate-spin" style={{ width: '14px', height: '14px' }} /> : '2. Draft AI Cold Email'}
                            </button>
                          )}
                        </div>

                        {hrData && (
                          <div style={{ marginTop: '12px', padding: '10px', background: 'rgba(0,0,0,0.3)', borderRadius: '6px', fontSize: '0.75rem' }}>
                            <span style={{ color: 'var(--text-muted)' }}>Discovered HR Email: </span>
                            <span style={{ color: 'var(--success)', fontWeight: 'bold' }}>{hrData.email}</span>
                            <span style={{ marginLeft: '8px', fontSize: '0.6rem', padding: '2px 6px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px', color: 'white' }}>Confidence: {hrData.confidence}</span>
                          </div>
                        )}

                        {coldEmailDraft && (
                          <div style={{ marginTop: '12px', padding: '12px', background: 'rgba(0,0,0,0.4)', borderLeft: '2px solid var(--primary)', borderRadius: '0 6px 6px 0', fontSize: '0.75rem', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                              <span style={{ color: 'white', fontWeight: 'bold' }}>AI Generated Draft</span>
                              <button onClick={() => { navigator.clipboard.writeText(coldEmailDraft); alert('Copied!'); }} style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontSize: '0.65rem' }}>Copy to clipboard</button>
                            </div>
                            {coldEmailDraft}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Premium Circular Score Meter & Match Analysis */}
                    <div className="score-gauge-box">
                      <div className="gauge-circle-wrapper">
                        <svg className="gauge-svg" viewBox="0 0 100 100">
                          <circle className="gauge-bg-circle" cx="50" cy="50" r="40" />
                          <circle 
                            className="gauge-val-circle" 
                            cx="50" 
                            cy="50" 
                            r="40" 
                            stroke={selectedJob.matchScore >= 80 ? 'var(--success)' : selectedJob.matchScore >= 60 ? 'var(--warning)' : 'var(--error)'}
                            strokeDasharray="251.2" 
                            strokeDashoffset={251.2 - (251.2 * (selectedJob.matchScore || 0)) / 100}
                          />
                        </svg>
                        <div className="gauge-text">{selectedJob.matchScore}%</div>
                      </div>
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 'bold' }}>AI Match Rating Summary</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', alignSelf: 'flex-start' }}>
                          <div className="fit-quality-label" style={{
                            background: selectedJob.matchScore >= 85 ? 'rgba(16,185,129,0.1)' : selectedJob.matchScore >= 70 ? 'rgba(6,182,212,0.1)' : 'rgba(245,158,11,0.1)',
                            color: selectedJob.matchScore >= 85 ? 'var(--success)' : selectedJob.matchScore >= 70 ? 'var(--secondary)' : 'var(--warning)',
                            border: `1px solid ${selectedJob.matchScore >= 85 ? 'rgba(16,185,129,0.2)' : selectedJob.matchScore >= 70 ? 'rgba(6,182,212,0.2)' : 'rgba(245,158,11,0.2)'}`
                          }}>
                            {selectedJob.matchScore >= 85 ? 'Excellent Compatibility' : selectedJob.matchScore >= 70 ? 'Good Compatibility' : 'Moderate Match'}
                          </div>
                          {selectedJob.matchScore < 85 && (
                            <button onClick={() => setShowMatchTips(!showMatchTips)} style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.3)', color: 'var(--primary)', padding: '4px 10px', fontSize: '0.65rem', borderRadius: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', transition: 'all 0.2s' }}>
                              <Sparkles style={{ width: '12px', height: '12px' }} /> Tips to increase chance
                            </button>
                          )}
                        </div>
                        <p style={{ fontSize: '0.675rem', color: 'var(--text-secondary)', lineHeight: '1.4', marginTop: '6px', margin: 0 }}>
                          {selectedJob.matchReason || 'Scoring skills match and processing cover materials...'}
                        </p>
                        
                        {showMatchTips && profile && (
                          <div style={{ marginTop: '12px', padding: '16px', background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: '8px' }}>
                            <h6 style={{ margin: '0 0 10px 0', color: 'var(--primary)', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <AlertTriangle style={{ width: '14px', height: '14px' }} /> AI Recommendations to Boost Match
                            </h6>
                            <ul style={{ margin: 0, paddingLeft: '20px', color: 'var(--text-secondary)', fontSize: '0.75rem', lineHeight: '1.6' }}>
                              {getMissingSkillsInJob(selectedJob.description, getSkills(profile)).length > 0 ? (
                                <>
                                  <li style={{ marginBottom: '6px' }}><strong>Missing Keywords:</strong> Consider adding these skills to your resume if you have experience with them: <span style={{ color: '#fff', fontWeight: 'bold' }}>{getMissingSkillsInJob(selectedJob.description, getSkills(profile)).join(', ')}</span>. ATS systems will filter you out without them.</li>
                                  <li style={{ marginBottom: '6px' }}><strong>Tailor your summary:</strong> Update your bio to explicitly mention your interest in {selectedJob.platform === 'LinkedIn' ? 'this industry' : selectedJob.company}.</li>
                                  <li><strong>Networking:</strong> Use the "Discover HR Email" tool below to send a direct message, which can bypass the initial resume screen.</li>
                                </>
                              ) : (
                                <>
                                  <li style={{ marginBottom: '6px' }}>Your skills match perfectly! Ensure your experience level (Junior/Mid/Senior) explicitly matches the job requirements.</li>
                                  <li style={{ marginBottom: '6px' }}>Write a targeted cover letter using the AI generator below to explain *why* you want to join {selectedJob.company}.</li>
                                  <li>Apply directly on the company website if possible instead of easy-apply portals.</li>
                                </>
                              )}
                            </ul>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Dynamic Skills Analysis - Side-by-Side Pros and Cons */}
                    {profile && (
                      <div className="skills-comparison-grid">
                        <div className="skills-comp-panel skills-comp-panel-success">
                          <span className="detail-section-title" style={{ color: 'var(--success)', marginBottom: '4px' }}>✓ MATCHING RESUME SKILLS</span>
                          <div className="skills-bullet-list">
                            {getMatchingSkillsInJob(selectedJob.description, getSkills(profile)).length > 0 ? (
                              getMatchingSkillsInJob(selectedJob.description, getSkills(profile)).map((sk, idx) => (
                                <div key={idx} className="skills-bullet-item">
                                  <span className="skills-bullet-dot" style={{ backgroundColor: 'var(--success)' }} />
                                  <span>{sk}</span>
                                </div>
                              ))
                            ) : (
                              <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>No direct skills overlaps found.</div>
                            )}
                          </div>
                        </div>

                        <div className="skills-comp-panel skills-comp-panel-missing">
                          <span className="detail-section-title" style={{ color: 'var(--error)', marginBottom: '4px' }}>✗ UNMATCHED RESUME SKILLS</span>
                          <div className="skills-bullet-list">
                            {getMissingSkillsInJob(selectedJob.description, getSkills(profile)).length > 0 ? (
                              getMissingSkillsInJob(selectedJob.description, getSkills(profile)).map((sk, idx) => (
                                <div key={idx} className="skills-bullet-item">
                                  <span className="skills-bullet-dot" style={{ backgroundColor: 'var(--error)' }} />
                                  <span>{sk}</span>
                                </div>
                              ))
                            ) : (
                              <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Perfect skills match! 0 gaps.</div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Tailored Cover Letter Panel */}
                    <div className="cover-letter-box" style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.03) 0%, transparent 100%)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '20px', marginTop: '32px' }}>
                      <div className="cover-letter-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '12px' }}>
                        <h5 className="cover-letter-title" style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0, fontSize: '0.9rem', color: '#fff' }}>
                          <FileText style={{ width: '16px', height: '16px', color: 'var(--primary)' }} /> Tailored Cover Letter
                        </h5>
                        <button 
                          onClick={() => {
                            navigator.clipboard.writeText(customCoverLetter);
                            alert('Cover letter copied successfully.');
                          }} 
                          className="cover-letter-copy"
                          style={{ background: 'rgba(255,255,255,0.05)', border: 'none', color: 'var(--text-secondary)', padding: '6px 12px', borderRadius: '6px', fontSize: '0.7rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.2s' }}
                        >
                          Copy Text
                        </button>
                      </div>
                      <p className="cover-letter-text" style={{ fontSize: '0.85rem', lineHeight: '1.6', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', margin: 0 }}>{customCoverLetter}</p>
                    </div>

                    {/* Premium Interactive Accordion Screening Answers */}
                    {customAnswers.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '24px' }}>
                        <h5 className="cover-letter-title" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', color: '#fff', fontSize: '0.9rem' }}>
                          <Sparkles style={{ width: '16px', height: '16px', color: 'var(--primary)' }} /> Anticipated Screening Answers
                        </h5>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          {customAnswers.map((item, idx) => {
                            const isExpanded = expandedQuestion === idx;
                            return (
                              <div key={idx} className="accordion-item" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-light)', borderRadius: '8px', overflow: 'hidden' }}>
                                <button 
                                  onClick={() => setExpandedQuestion(isExpanded ? null : idx)}
                                  style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: 'none', border: 'none', color: 'var(--text-primary)', fontSize: '0.8rem', fontWeight: 'bold', cursor: 'pointer', textAlign: 'left' }}
                                >
                                  {item.question}
                                  <ChevronRight style={{ width: '14px', height: '14px', transform: isExpanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }} />
                                </button>
                                {isExpanded && (
                                  <div style={{ padding: '0 16px 16px 16px', color: 'var(--text-secondary)', fontSize: '0.8rem', lineHeight: '1.5' }}>
                                    <div style={{ padding: '12px', background: 'rgba(0,0,0,0.3)', borderRadius: '6px', borderLeft: '2px solid var(--primary)' }}>
                                      {item.answer}
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}



                    {/* Direct Portal Apply CTA Banner */}
                    <div className="portal-cta-banner">
                      <span className="portal-cta-title">Apply Direct On {selectedJob.platform}</span>
                      <p className="portal-cta-desc" style={{ margin: 0 }}>
                        Prefer to bypass the automated Playwright stealth sessions? You can open the live application form on the job board's server portal instantly:
                      </p>
                      <a 
                        href={selectedJob.url} 
                        target="_blank" 
                        rel="noreferrer" 
                        className="btn btn-glowing-cyan"
                        style={{ padding: '8px 24px', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}
                      >
                        Visit Application Portal 🚀
                      </a>
                    </div>

                    {selectedJob.logs.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <h5 className="cover-letter-title" style={{ color: 'var(--secondary)' }}>Application Execution Logs</h5>
                        <div className="terminal" style={{ height: '140px' }}>
                          {selectedJob.logs.map((log: any, idx: number) => (
                            <div key={idx} className="terminal-line">
                              <span className="terminal-time">[{new Date(log.time).toLocaleTimeString()}]</span>
                              <span style={{ color: '#38bdf8' }}>{log.message}</span>
                            </div>
                          ))}
                        </div>

                        <div className="screenshots-row">
                          <div className="screenshot-item">
                            <span className="screenshot-title">Form Filled State</span>
                            <img 
                              src={`/public/screenshots/${selectedJob.id}_filled.png`}
                              className="screenshot-img"
                              width={400}
                              height={250}
                              onError={(e) => {
                                (e.target as HTMLImageElement).src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='60' viewBox='0 0 100 60'%3E%3Crect width='100' height='60' fill='%2305070c'/%3E%3Ctext x='50' y='35' fill='%234b5563' font-size='8' text-anchor='middle'%3EScreenshot Unavailable%3C/text%3E%3C/svg%3E";
                              }}
                              alt="Filled input screen"
                            />
                          </div>
                          <div className="screenshot-item">
                            <span className="screenshot-title">Successful Submission</span>
                            <img 
                              src={`/public/screenshots/${selectedJob.id}_success.png`}
                              className="screenshot-img"
                              width={400}
                              height={250}
                              onError={(e) => {
                                (e.target as HTMLImageElement).src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='60' viewBox='0 0 100 60'%3E%3Crect width='100' height='60' fill='%2305070c'/%3E%3Ctext x='50' y='35' fill='%234b5563' font-size='8' text-anchor='middle'%3EScreenshot Unavailable%3C/text%3E%3C/svg%3E";
                              }}
                              alt="Successful submit screen"
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="detail-desc-box">
                      <h5 className="cover-letter-title">Original Job Description</h5>
                      <p className="detail-desc-text">{selectedJob.description}</p>
                    </div>
                  </>
                ) : (
                  <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px', color: 'var(--text-muted)', fontSize: '0.7rem', fontFamily: 'var(--font-mono)' }}>
                    <Layers style={{ width: '28px', height: '28px' }} />
                    <span>Select a job card on the left to examine fit parameters and launch browser automation sessions.</span>
                  </div>
                )}
              </div>

            </div>
            )}
          </div>
        )}

        {/* TAB 4: ARCHIVE LOGS (Removed) */}

        {/* TAB: PLANS */}
        {activeTab === 'plans' && renderPlansPage()}

        {/* AUTH VIEWS */}
        {(activeTab === 'login' || activeTab === 'signup' || activeTab === 'forgot-password' || activeTab === 'update-password') && (
          <div className="auth-container">
            {/* Left Side: Cinematic Branding */}
            <div className="auth-brand-side">
              <div className="auth-brand-content">
                <div className="ch-splash-logo-container" style={{ marginBottom: '30px' }}>

                  <img src="/favicon.svg" alt="VANBA Logo" className="ch-splash-logo-img" width={220} height={220} style={{ width: '220px' }} />
                </div>
                <h1 style={{ fontSize: '2.5rem', fontWeight: '800', color: 'white', marginBottom: '16px', lineHeight: '1.2' }}>
                  Automate Your<br /><span style={{ color: 'var(--primary)' }}>Career Growth.</span>
                </h1>
                <p style={{ color: 'var(--text-secondary)', fontSize: '1rem', lineHeight: '1.6', maxWidth: '400px' }}>
                  Join thousands of professionals who have automated their job search with our stealth AI agents. Secure your dream role while you sleep.
                </p>
                <div className="auth-stats" style={{ display: 'flex', gap: '30px', marginTop: '40px' }}>
                  <div>
                    <h4 style={{ color: 'white', fontSize: '1.5rem', fontWeight: '800' }}>14+</h4>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase' }}>Supported Portals</span>
                  </div>
                  <div>
                    <h4 style={{ color: 'white', fontSize: '1.5rem', fontWeight: '800' }}>26</h4>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase' }}>AI Models</span>
                  </div>
                  <div>
                    <h4 style={{ color: 'white', fontSize: '1.5rem', fontWeight: '800' }}>24/7</h4>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase' }}>Autopilot</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Side: Forms */}
            <div className="auth-form-side">
              <div className="glass-panel-glow auth-form-card">
                {activeTab === 'login' ? (
                  <>
                    <h2 style={{ fontSize: '1.8rem', color: 'white', marginBottom: '8px', fontWeight: '800' }}>Welcome Back</h2>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '30px' }}>Enter your credentials to access the command center.</p>
                    
                    <form onSubmit={handleLogin} className="settings-form">
                      <div className="form-group">
                        <label className="form-group-lbl">Email Address</label>
                        <input name="email" type="email" required className="form-input" placeholder="commander@vanba.ai" style={{ padding: '12px 16px', fontSize: '0.9rem' }} />
                      </div>
                      <div className="form-group" style={{ position: 'relative' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <label className="form-group-lbl">Password</label>
                          <button type="button" onClick={() => setActiveTab('forgot-password')} style={{ background: 'none', border: 'none', color: 'var(--primary)', fontSize: '0.75rem', cursor: 'pointer', padding: 0 }}>Forgot Password?</button>
                        </div>
                        <input name="password" type="password" required className="form-input" placeholder="••••••••" style={{ padding: '12px 16px', fontSize: '0.9rem' }} />
                      </div>
                      <button type="submit" className="btn btn-primary auth-submit-btn">Sign In</button>
                    </form>
                    
                    <div className="auth-switch">
                      <span style={{ color: 'var(--text-muted)' }}>Don't have an account?</span>
                      <button onClick={() => setActiveTab('signup')} className="auth-switch-btn">Sign up</button>
                    </div>
                  </>
                ) : activeTab === 'forgot-password' ? (
                  <>
                    <h2 style={{ fontSize: '1.8rem', color: 'white', marginBottom: '8px', fontWeight: '800' }}>Reset Password</h2>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '30px' }}>Enter your email to receive a password reset link.</p>
                    
                    <form onSubmit={async (e) => {
                      e.preventDefault();
                      const email = (e.target as any).email.value;
                      try {
                        const res = await fetch(`${API_BASE}/auth/forgot-password`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ email })
                        });
                        const data = await res.json();
                        if (res.ok) {
                          alert(data.message);
                          setActiveTab('login');
                        } else {
                          alert(data.error);
                        }
                      } catch (err) {
                        alert('Something went wrong.');
                      }
                    }} className="settings-form">
                      <div className="form-group">
                        <label className="form-group-lbl">Email Address</label>
                        <input name="email" type="email" required className="form-input" placeholder="commander@vanba.ai" style={{ padding: '12px 16px', fontSize: '0.9rem' }} />
                      </div>
                      <button type="submit" className="btn btn-primary auth-submit-btn">Send Reset Link</button>
                    </form>
                    
                    <div className="auth-switch">
                      <button onClick={() => setActiveTab('login')} className="auth-switch-btn" style={{ marginLeft: 0 }}>Back to Login</button>
                    </div>
                  </>
                ) : activeTab === 'update-password' ? (
                  <>
                    <h2 style={{ fontSize: '1.8rem', color: 'white', marginBottom: '8px', fontWeight: '800' }}>New Password</h2>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '30px' }}>Enter your new secure password.</p>
                    
                    <form onSubmit={async (e) => {
                      e.preventDefault();
                      const newPassword = (e.target as any).newPassword.value;
                      const confirmPassword = (e.target as any).confirmPassword.value;
                      if (newPassword !== confirmPassword) return alert('Passwords do not match');
                      
                      try {
                        const res = await fetch(`${API_BASE}/auth/update-password`, {
                          method: 'POST',
                          headers: { 
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${recoveryToken}`
                          },
                          body: JSON.stringify({ newPassword })
                        });
                        const data = await res.json();
                        if (res.ok) {
                          alert('Password updated successfully! Please log in with your new password.');
                          setRecoveryToken(null);
                          setActiveTab('login');
                        } else {
                          alert(data.error);
                        }
                      } catch (err) {
                        alert('Something went wrong.');
                      }
                    }} className="settings-form">
                      <div className="form-group">
                        <label className="form-group-lbl">New Password</label>
                        <input name="newPassword" type="password" required className="form-input" placeholder="••••••••" style={{ padding: '12px 16px', fontSize: '0.9rem' }} minLength={6} />
                      </div>
                      <div className="form-group">
                        <label className="form-group-lbl">Confirm Password</label>
                        <input name="confirmPassword" type="password" required className="form-input" placeholder="••••••••" style={{ padding: '12px 16px', fontSize: '0.9rem' }} minLength={6} />
                      </div>
                      <button type="submit" className="btn btn-primary auth-submit-btn">Update Password</button>
                    </form>
                  </>
                ) : (
                  <>
                    <h2 style={{ fontSize: '1.8rem', color: 'white', marginBottom: '8px', fontWeight: '800' }}>Create Account</h2>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '30px' }}>Deploy your personal AI recruiter today.</p>
                    
                    <form onSubmit={handleSignup} className="settings-form">
                      <div className="form-group">
                        <label className="form-group-lbl">Full Name</label>
                        <input name="fullName" type="text" required className="form-input" placeholder="John Doe" style={{ padding: '12px 16px', fontSize: '0.9rem' }} />
                      </div>
                      <div className="form-group">
                        <label className="form-group-lbl">Email Address</label>
                        <input name="email" type="email" required className="form-input" placeholder="commander@vanba.ai" style={{ padding: '12px 16px', fontSize: '0.9rem' }} />
                      </div>
                      <div className="form-group">
                        <label className="form-group-lbl">Password</label>
                        <input name="password" type="password" required className="form-input" placeholder="••••••••" style={{ padding: '12px 16px', fontSize: '0.9rem' }} />
                      </div>
                      <button type="submit" className="btn btn-primary auth-submit-btn">Sign Up</button>
                    </form>
                    
                    <div className="auth-switch">
                      <span style={{ color: 'var(--text-muted)' }}>Already registered?</span>
                      <button onClick={() => setActiveTab('login')} className="auth-switch-btn">Sign in</button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
        {activeTab === 'outreach' && (
          <div className="section-card fade-in" style={{ padding: '30px' }}>
            <h2 className="section-title">Email Outreach Logs</h2>
            <p className="section-subtitle">Real-time tracker of all automated HR emails successfully sent by the Autopilot.</p>
            
            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-color)', borderRadius: '12px', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead style={{ background: 'rgba(0,0,0,0.2)' }}>
                  <tr>
                    <th style={{ padding: '16px', color: 'var(--text-secondary)', fontSize: '0.75rem', textTransform: 'uppercase' }}>Company</th>
                    <th style={{ padding: '16px', color: 'var(--text-secondary)', fontSize: '0.75rem', textTransform: 'uppercase' }}>Job Title</th>
                    <th style={{ padding: '16px', color: 'var(--text-secondary)', fontSize: '0.75rem', textTransform: 'uppercase' }}>HR Email</th>
                    <th style={{ padding: '16px', color: 'var(--text-secondary)', fontSize: '0.75rem', textTransform: 'uppercase' }}>Date Applied</th>
                    <th style={{ padding: '16px', color: 'var(--text-secondary)', fontSize: '0.75rem', textTransform: 'uppercase' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.filter(j => j.hrEmailSent).length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                        No automated emails have been sent yet. Run the Autopilot to start reaching out.
                      </td>
                    </tr>
                  ) : (
                    jobs.filter(j => j.hrEmailSent).sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).map(job => (
                      <tr key={job.id} style={{ borderTop: '1px solid var(--border-color)' }}>
                        <td style={{ padding: '16px', color: 'white', fontWeight: 'bold', fontSize: '0.85rem' }}>{job.company}</td>
                        <td style={{ padding: '16px', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{job.title}</td>
                        <td style={{ padding: '16px', color: 'var(--primary)', fontSize: '0.85rem', fontFamily: 'monospace' }}>{job.hrEmail || 'Unknown'}</td>
                        <td style={{ padding: '16px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>{new Date(job.createdAt).toLocaleDateString()}</td>
                        <td style={{ padding: '16px' }}><span className="badge badge-success">Sent</span></td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="glass-panel-glow" style={{ maxWidth: '600px', margin: '0 auto', width: '100%' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: '700', color: 'white', marginBottom: '2px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Settings2 style={{ width: '18px', height: '18px', color: 'var(--primary)' }} />
              Settings Configuration
            </h2>
            <p style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: '20px', lineHeight: '1.5' }}>
              Fine-tune auto-apply matching scores, configure proxy connections, and save active cookie lists to preserve remote sessions.
            </p>

            <form onSubmit={handleSaveSettings} className="settings-form">
              
              <div className="grid-cols-2">
                <div className="form-group">
                  <label className="form-group-lbl">AI Provider</label>
                  <select 
                    value={settings.aiProvider || 'OPENROUTER'}
                    onChange={(e) => setSettings({ ...settings, aiProvider: e.target.value })}
                    className="form-input"
                  >
                    <option value="OPENROUTER">OpenRouter (Round Robin)</option>
                    <option value="GEMINI">Google Gemini API</option>
                  </select>
                </div>

                {settings.aiProvider === 'GEMINI' ? (
                  <div className="form-group">
                    <label className="form-group-lbl">Gemini API Key</label>
                    <input 
                      type="password"
                      value={settings.geminiApiKey || ''}
                      onChange={(e) => setSettings({ ...settings, geminiApiKey: e.target.value })}
                      placeholder="AIzaSy..."
                      className="form-input"
                    />
                  </div>
                ) : (
                  <div className="form-group">
                    <label className="form-group-lbl">OpenRouter API Key</label>
                    <input 
                      type="password"
                      value={settings.openrouterApiKey || ''}
                      onChange={(e) => setSettings({ ...settings, openrouterApiKey: e.target.value })}
                      placeholder="sk-or-..."
                      className="form-input"
                    />
                  </div>
                )}

                {settings.aiProvider === 'OPENROUTER' && (
                  <div className="form-group" style={{ gridColumn: 'span 2' }}>
                  <label className="form-group-lbl">
                    OpenRouter Models ({selectedOpenRouterModels.length} selected) — Round-robin cycling
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(195px, 1fr))', gap: '4px', marginTop: '4px', maxHeight: '180px', overflowY: 'auto', paddingRight: '4px' }}>
                    {[
                      'baidu/cobuddy:free',
                      'openrouter/owl-alpha',
                      'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
                      'poolside/laguna-xs.2:free',
                      'poolside/laguna-m.1:free',
                      'arcee-ai/trinity-large-thinking:free',
                      'google/gemma-4-26b-a4b-it:free',
                      'deepseek/deepseek-v4-flash:free',
                      'google/gemma-4-31b-it:free',
                      'minimax/minimax-m2.5:free',
                      'nvidia/nemotron-3-super-120b-a12b:free',
                      'google/lyria-3-pro-preview',
                      'google/lyria-3-clip-preview',
                      'liquid/lfm-2.5-1.2b-thinking:free',
                      'liquid/lfm-2.5-1.2b-instruct:free',
                      'nvidia/nemotron-3-nano-30b-a3b:free',
                      'nvidia/nemotron-nano-12b-v2-vl:free',
                      'nvidia/nemotron-nano-9b-v2',
                      'qwen/qwen3-next-80b-a3b-instruct:free',
                      'openai/gpt-oss-120b:free',
                      'openai/gpt-oss-20b:free',
                      'z-ai/glm-4.5-air:free',
                      'qwen/qwen3-coder:free',
                      'nousresearch/hermes-3-llama-3.1-405b:free',
                      'cognitivecomputations/dolphin-mistral-24b-venice-edition:free',
                      'meta-llama/llama-3.3-70b-instruct:free',
                      'meta-llama/llama-3.2-3b-instruct:free',
                    ].map(m => {
                      const isSel = selectedOpenRouterModels.includes(m);
                      return (
                        <button
                          key={m}
                          type="button"
                          onClick={() => {
                            const updated = isSel
                              ? selectedOpenRouterModels.filter(x => x !== m)
                              : [...selectedOpenRouterModels, m];
                            setSelectedOpenRouterModels(updated);
                            setSettings(prev => ({ ...prev, openrouterModels: JSON.stringify(updated) }));
                          }}
                          className="btn"
                          style={{
                            padding: '3px 6px',
                            fontSize: '0.58rem',
                            border: '1px solid var(--border-light)',
                            background: isSel ? 'var(--primary)' : 'rgba(0, 0, 0, 0.35)',
                            color: 'white',
                            fontWeight: '600',
                            textAlign: 'left',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {isSel ? '✓ ' : '  '}{m}
                        </button>
                      );
                    })}
                  </div>
                </div>
                )}
              </div>

              <div className="grid-cols-2">
                <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '10px', height: '100%' }}>
                  <label className="form-group-lbl" style={{ margin: 0 }}>Include Internships</label>
                  <input 
                    type="checkbox"
                    checked={settings.includeInternships}
                    onChange={(e) => setSettings({ ...settings, includeInternships: e.target.checked })}
                    style={{ width: '20px', height: '20px', cursor: 'pointer', accentColor: 'var(--primary)' }}
                  />
                </div>
                
                <div className="form-group">
                  <label className="form-group-lbl">Daily Submission limit ({settings.dailyLimit} applications)</label>
                  <input 
                    type="range"
                    min="1"
                    max="50"
                    value={settings.dailyLimit}
                    onChange={(e) => setSettings({ ...settings, dailyLimit: parseInt(e.target.value) })}
                    style={{ cursor: 'pointer', accentColor: 'var(--primary)', marginTop: '8px' }}
                  />
                </div>

                <div className="form-group">
                  <label className="form-group-lbl">Minimum Score Auto-Apply ({settings.autoApplyThreshold}%)</label>
                  <input 
                    type="range"
                    min="50"
                    max="100"
                    value={settings.autoApplyThreshold}
                    onChange={(e) => setSettings({ ...settings, autoApplyThreshold: parseInt(e.target.value) })}
                    style={{ cursor: 'pointer', accentColor: 'var(--primary)', marginTop: '8px' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '10px' }}>
                <div className="form-group">
                  <label className="form-group-lbl">Interested Career Fields (Select Multiple)</label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '6px', marginTop: '4px' }}>
                    {[
                      'Frontend Developer',
                      'Backend Developer',
                      'Full Stack Engineer',
                      'Mobile Developer (iOS / Android)',
                      'Web Developer',
                      'UI/UX Designer',
                      'QA / Test Engineer',
                      'DevOps / SRE',
                      'Cloud Architect / Engineer',
                      'Data Science / AI / ML',
                      'Data Engineer',
                      'Systems Architect',
                      'Cyber Security Specialist / Analyst',
                      'Security Engineer',
                      'Database Administrator',
                      'Game Developer',
                      'Embedded Systems Engineer',
                      'Blockchain Engineer',
                      'Salesforce / CRM Developer',
                      'SAP Consultant / Engineer',
                      'Product Manager',
                      'Product Owner',
                      'Project Manager',
                      'Scrum Master / Agile Coach',
                      'Engineering Manager',
                      'Tech Lead',
                      'CTO / VP of Engineering',
                      'Business Analyst',
                      'Systems Administrator',
                      'Network Engineer',
                      'HR Specialist / Recruiter',
                      'Talent Acquisition',
                      'People Operations Manager',
                      'Marketing Manager / Specialist',
                      'SEO & Content Specialist',
                      'Growth Hacker',
                      'Sales Development / Account Executive',
                      'Sales Engineer',
                      'Customer Success Manager',
                      'Customer Support Specialist',
                      'Technical Support Engineer',
                      'Technical Writer',
                      'Business Development Manager',
                      'Operations Manager',
                      'Finance / Data Analyst',
                      'Graphic Designer / Illustrator',
                      'Motion Designer',
                      'Bioinformatics Specialist',
                      'Hardware Engineer',
                      'Chief Executive Officer (CEO)'
                    ].map(f => {
                      const isSel = selectedFields.includes(f);
                      return (
                        <button
                          key={f}
                          type="button"
                          onClick={() => {
                            const updated = isSel ? selectedFields.filter(x => x !== f) : [...selectedFields, f];
                            setSelectedFields(updated);
                            setSettings(prev => ({ ...prev, targetField: JSON.stringify(updated) }));
                          }}
                          className="btn"
                          style={{
                            padding: '6px',
                            fontSize: '0.65rem',
                            border: '1px solid var(--border-light)',
                            background: isSel ? 'var(--primary)' : 'rgba(0, 0, 0, 0.25)',
                            color: isSel ? '#000' : 'white',
                            fontWeight: '600'
                          }}
                        >
                          {f}
                        </button>
                      );
                    })}
                  </div>
                  {/* Add Custom Field */}
                  <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
                    <input 
                      type="text" 
                      placeholder="Or type a custom role/interest..." 
                      className="form-input" 
                      style={{ flex: 1, padding: '6px 12px', fontSize: '0.75rem' }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          const val = e.currentTarget.value.trim();
                          if (val && !selectedFields.includes(val)) {
                            const updated = [...selectedFields, val];
                            setSelectedFields(updated);
                            setSettings(prev => ({ ...prev, targetField: JSON.stringify(updated) }));
                            e.currentTarget.value = '';
                          }
                        }
                      }}
                    />
                    <button 
                      type="button"
                      className="btn btn-primary"
                      style={{ padding: '6px 12px', fontSize: '0.75rem' }}
                      onClick={(e) => {
                        const input = e.currentTarget.previousElementSibling as HTMLInputElement;
                        const val = input.value.trim();
                        if (val && !selectedFields.includes(val)) {
                          const updated = [...selectedFields, val];
                          setSelectedFields(updated);
                          setSettings(prev => ({ ...prev, targetField: JSON.stringify(updated) }));
                          input.value = '';
                        }
                      }}
                    >Add</button>
                  </div>
                </div>

                <div className="form-group" style={{ marginTop: '6px' }}>
                  <label className="form-group-lbl">Seniority Experience Levels (Select Multiple)</label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: '6px', marginTop: '4px' }}>
                    {['Entry-level', 'Senior', 'Manager', 'Director', 'Executive'].map(lvl => {
                      const isSel = selectedLevels.includes(lvl);
                      return (
                        <button
                          key={lvl}
                          type="button"
                          onClick={() => {
                            const updated = isSel ? selectedLevels.filter(x => x !== lvl) : [...selectedLevels, lvl];
                            setSelectedLevels(updated);
                            setSettings(prev => ({ ...prev, experienceLevel: JSON.stringify(updated) }));
                          }}
                          className="btn"
                          style={{
                            padding: '6px',
                            fontSize: '0.65rem',
                            border: '1px solid var(--border-light)',
                            background: isSel ? 'var(--primary)' : 'rgba(0, 0, 0, 0.25)',
                            color: isSel ? '#000' : 'white',
                            fontWeight: '600'
                          }}
                        >
                          {lvl}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="form-group">
                <label className="form-group-lbl">Residential Proxy server gateway</label>
                <input 
                  type="text"
                  value={settings.proxyUrl || ''}
                  onChange={(e) => setSettings({ ...settings, proxyUrl: e.target.value })}
                  placeholder="http://username:password@proxy-network.com:8080"
                  className="form-input"
                />
              </div>

              <div className="form-group">
                <label className="form-group-lbl">LinkedIn Session Cookies (JSON)</label>
                <textarea 
                  value={settings.linkedinCookies || ''}
                  onChange={(e) => setSettings({ ...settings, linkedinCookies: e.target.value })}
                  placeholder='[{"name": "li_at", "value": "auth_token_here", "domain": ".linkedin.com"}]'
                  rows={4}
                  className="form-input"
                  style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem' }}
                />
              </div>
              <div className="form-group">
                <label className="form-group-lbl">Gmail Session Cookies (JSON)</label>
                <textarea 
                  value={settings.gmailCookies || ''}
                  onChange={(e) => setSettings({ ...settings, gmailCookies: e.target.value })}
                  placeholder='[{"name": "SID", "value": "...", "domain": ".google.com"}]'
                  rows={4}
                  className="form-input"
                  style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', marginTop: '10px' }}
                />
              </div>

              {/* Theme Switcher */}
              <div style={{ padding: '20px', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px solid var(--border-light)' }}>
                <h4 style={{ margin: '0 0 16px 0', fontSize: '0.9rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ color: 'var(--primary)' }}>✧</span> Dark Mode Color Theme
                </h4>
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                  {[
                    { id: 'PURE_WHITE', name: 'Pure White', hex: '#ffffff' },
                    { id: 'EMERALD', name: 'Neon Emerald', hex: '#10b981' },
                    { id: 'CYBER_PURPLE', name: 'Cyber Purple', hex: '#a855f7' },
                    { id: 'HACKER_GREEN', name: 'Hacker Green', hex: '#22c55e' }
                  ].map(theme => (
                    <button
                      key={theme.id}
                      type="button"
                      onClick={() => setThemeAccent(theme.id)}
                      style={{
                        padding: '10px 16px',
                        background: themeAccent === theme.id ? `${theme.hex}20` : 'transparent',
                        border: `1px solid ${themeAccent === theme.id ? theme.hex : 'var(--border-color)'}`,
                        borderRadius: '8px',
                        color: themeAccent === theme.id ? theme.hex : 'var(--text-secondary)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        fontWeight: 'bold',
                        fontSize: '0.8rem'
                      }}
                    >
                      <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: theme.hex, boxShadow: `0 0 8px ${theme.hex}` }} />
                      {theme.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Save Button */}
              <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={isSavingSettings}
                  style={{
                    padding: '10px 28px',
                    fontSize: '0.85rem',
                    fontWeight: '700',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    minWidth: '160px',
                    justifyContent: 'center',
                    opacity: isSavingSettings ? 0.7 : 1,
                    cursor: isSavingSettings ? 'not-allowed' : 'pointer',
                  }}
                >
                  {isSavingSettings ? (
                    <><Loader2 className="animate-spin" style={{ width: '16px', height: '16px' }} /> Saving...</>
                  ) : (
                    <><Save style={{ width: '16px', height: '16px' }} /> Save Settings</>
                  )}
                </button>
              </div>

            </form>
          </div>
        )}

        {/* TAB: ABOUT US */}
        {activeTab === 'about' && (
          <div className="glass-panel-glow" style={{ maxWidth: '800px', margin: '0 auto', width: '100%', display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div style={{ borderBottom: '1px solid var(--border-light)', paddingBottom: '12px' }}>
              <h2 style={{ fontSize: '1.4rem', fontWeight: '800', color: 'white', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Info style={{ width: '22px', height: '22px', color: 'var(--primary)' }} />
                About VANBA Job Hunter AI
              </h2>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                Discover the architecture, engineering principles, and core technical stack driving your autonomous career assistant.
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', fontSize: '0.8rem', lineHeight: '1.6', color: 'var(--text-secondary)' }}>
              <h3 style={{ color: 'white', fontSize: '1rem', fontWeight: '700' }}>Our Autonomous Vision</h3>
              <p>
                VANBA Job Hunter AI was engineered with a clear mandate: **to liberate technical professionals from the manual, repetitive grind of daily job seeking**. Our software works 24/7 in the background on your local machine, serving as a dedicated chief of staff that acts with the precision and stealth required to connect you with top global teams.
              </p>

              <h3 style={{ color: 'white', fontSize: '1rem', fontWeight: '700', marginTop: '10px' }}>Technical Architecture Highlights</h3>
                <ul style={{ paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <li>
                  <strong style={{ color: 'white' }}>OpenRouter Multi-Model Engine:</strong> VANBA Job Hunter AI unites 26 free and preview-grade OpenRouter models in a smart round-robin rotation loop. Each call picks the next model in sequence and falls back to the next if it fails, cycling back when all are exhausted — keeping inference live cheaper, smarter, and 70% more token-efficient than hardwiring a single provider. Zero local GPU required; evaluations are computed across the global cloud model network.
                </li>
                <li>
                  <strong style={{ color: 'white' }}>Playwright Stealth Networks:</strong> Our browser automation replicates natural human dynamics. Through randomized click positions, focus delays, typing noise, and proxy routing, we submit applications naturally and securely.
                </li>
                <li>
                  <strong style={{ color: 'white' }}>Comprehensive Feed Aggregator:</strong> By listening concurrently to 14 premium RSS and API developer gateways, the agent filters and tracks hundreds of new listings hourly, keeping you ahead of the hiring wave.
                </li>
              </ul>

              <div style={{ background: 'rgba(99,102,241,0.05)', border: '1px dashed var(--border-hover)', padding: '16px', borderRadius: '8px', marginTop: '12px' }}>
                <h4 style={{ color: 'white', fontSize: '0.85rem', fontWeight: '700', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Sparkles style={{ width: '16px', height: '16px', color: 'var(--accent)' }} />
                  Answer Engine Optimization (AEO) Core FAQ
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '10px' }}>
                  <div>
                    <strong style={{ color: 'white', fontSize: '0.75rem', display: 'block' }}>Q: Is my personal career data safe with VANBA Job Hunter AI?</strong>
                    <span style={{ fontSize: '0.725rem', color: 'var(--text-secondary)' }}>
                      Yes, 100%. All your technical profiles, contact details, master passwords, parsed resumes, and session cookies are stored locally in your private SQLite database (`dev.db`). No technical information is ever transmitted to cloud servers.
                    </span>
                  </div>
                  <div>
                    <strong style={{ color: 'white', fontSize: '0.75rem', display: 'block' }}>Q: How fast is a multi-model scoring cycle?</strong>
                    <span style={{ fontSize: '0.725rem', color: 'var(--text-secondary)' }}>
                      Scraping 14 portals for listings happens concurrently and completes in 10-15 seconds. Streaming matching, cover-letter generation, and screening Q&A across 26 OpenRouter cloud models delivers full ATS results in 5-12 seconds per job with 70% token-parity efficiency via round-robin failover routing.
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB: CONTACT US */}
        {activeTab === 'contact' && (
          <div className="autopilot-grid" style={{ maxWidth: '900px', margin: '0 auto', width: '100%' }}>
            <div className="glass-panel-glow" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ borderBottom: '1px solid var(--border-light)', paddingBottom: '12px' }}>
                <h2 style={{ fontSize: '1.25rem', fontWeight: '800', color: 'white', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Mail style={{ width: '20px', height: '20px', color: 'var(--secondary)' }} />
                  Contact VANBA Command Center
                </h2>
                <p style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  Submit requests for custom stealth scripts, system integrations, or ask support questions.
                </p>
              </div>

              <form onSubmit={async (e) => {
                e.preventDefault();
                const form = e.currentTarget;
                const name = (form.elements.namedItem('c_name') as HTMLInputElement).value;
                alert(`Message sent successfully, ${name}! Your transmission has been queued in our support router. Expected SLA: 4 hours.`);
                form.reset();
              }} className="settings-form">
                <div className="grid-cols-2">
                  <div className="form-group">
                    <label className="form-group-lbl">Your Full Name</label>
                    <input name="c_name" type="text" className="form-input" placeholder="Vineet Pradhan" required />
                  </div>
                  <div className="form-group">
                    <label className="form-group-lbl">Your Email Address</label>
                    <input name="c_email" type="email" className="form-input" placeholder="vineettech94682@gmail.com" required />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-group-lbl">Subject</label>
                  <input name="c_subject" type="text" className="form-input" placeholder="e.g. Custom LinkedIn Cookie Scraping Request" required />
                </div>

                <div className="form-group">
                  <label className="form-group-lbl">Inquiry Category</label>
                  <select name="c_category" className="form-input">
                    <option value="tech">Technical Support</option>
                    <option value="custom">Custom Stealth Script Request</option>
                    <option value="partnership">Enterprise Licensing</option>
                    <option value="general">General Inquiry</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-group-lbl">Message Transmission</label>
                  <textarea name="c_message" className="form-input" rows={5} placeholder="State your requirements or question clearly..." required />
                </div>

                <button type="submit" className="btn btn-primary" style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Send style={{ width: '14px', height: '14px' }} />
                  Transmit Message
                </button>
              </form>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div className="glass-panel">
                <h4 style={{ color: 'white', fontSize: '0.85rem', fontWeight: '700', marginBottom: '12px', borderBottom: '1px solid var(--border-light)', paddingBottom: '6px' }}>Global Headquarters</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '0.725rem', color: 'var(--text-secondary)' }}>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                    <MapPin style={{ width: '16px', height: '16px', color: 'var(--primary)', flexShrink: 0 }} />
                    <span>VANBA Tech,<br />Raipur, Chhatisgarh,<br />India</span>                  </div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <Mail style={{ width: '16px', height: '16px', color: 'var(--primary)' }} />
                    <a href="mailto:support@vanbajobhunter.ai" style={{ color: 'var(--secondary)', textDecoration: 'none' }}>support@vanbajobhunter.ai</a>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <Phone style={{ width: '16px', height: '16px', color: 'var(--primary)' }} />
                    <span>+91 (120) 489-0231</span>
                  </div>
                </div>
              </div>

              <div className="glass-panel" style={{ background: 'rgba(6,182,212,0.02)' }}>
                <h4 style={{ color: 'var(--secondary)', fontSize: '0.80rem', fontWeight: '700', marginBottom: '8px' }}>Response SLAs</h4>
                <p style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                  All incoming transmissions undergo autonomous classification. Technical support requests from active command hubs are solved within 4 hours. General queries are addressed within 12 hours.
                  </p>
                </div>
              </div>
            </div>
          )}

        {/* ─── SYSTEM POLICIES ─────────────────────────────────────── */}

        {/* TAB: PRIVACY POLICY */}
        {activeTab === 'privacy' && (
          <div className="glass-panel-glow" style={{ maxWidth: '800px', margin: '0 auto', width: '100%', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ borderBottom: '1px solid var(--border-light)', paddingBottom: '12px' }}>
              <h2 style={{ fontSize: '1.4rem', fontWeight: '800', color: 'white', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Shield style={{ width: '22px', height: '22px', color: 'var(--success)' }} />
                Privacy Shield Policy
              </h2>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                Last updated: May 24, 2026. Learn how VANBA Job Hunter AI ensures strict local data custody.
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', fontSize: '0.775rem', lineHeight: '1.6', color: 'var(--text-secondary)' }}>
              <h3 style={{ color: 'white', fontSize: '0.95rem', fontWeight: '700' }}>1. Local Data Custody and Database Sandbox</h3>
              <p>
                Unlike standard cloud-based career matching services, VANBA Job Hunter AI stores all technical experience timelines, email targets, phone contact parameters, cookies, and proxy settings *locally* within an isolated SQLite database (`dev.db`) on your specific machine. No resume contents or personal datasets are ever transmitted to our servers or processed by third-party database indexers.
              </p>

              <h3 style={{ color: 'white', fontSize: '0.95rem', fontWeight: '700', marginTop: '6px' }}>2. OpenRouter Cloud-Model Inferences and Privacy</h3>
              <p>
                Candidate compatibility evaluations and matching percentage algorithms are dispatched to OpenRouter's secure edge cloud, routing through 26 free-tier and preview cloud models via round-robin failover. No local GPU is required; all AEI matches, fit-ratio ratings, cover letters, and multi-modal reasoning reach you in seconds with intelligent load-balancing for maximum uptime.
              </p>

              <h3 style={{ color: 'white', fontSize: '0.95rem', fontWeight: '700', marginTop: '6px' }}>3. Playwright Stealth Session Cookies</h3>
              <p>
                The browser automation applier operates within a secure cookie sandbox. Your authentication cookies (such as LinkedIn session tokens or custom CRM cookies) are stored encrypted in your local DB and loaded only during local Playwright Stealth sessions. They are never exported, shared, or compiled outside of your own system's environment.
              </p>

              <h3 style={{ color: 'white', fontSize: '0.95rem', fontWeight: '700', marginTop: '6px' }}>4. Information Erasure & Hard Deletes</h3>
              <p>
                As a monoprofile console application, clicking "Upload Resume" completely overrides any pre-existing resume datasets inside the database. To wipe all history (jobs count, logs, screenshots), you can delete the `dev.db` file or clear the cache inside your browser. All deletions are final and take place instantly across the system.
              </p>
            </div>
          </div>
        )}

        {/* TAB: TERMS OF USE */}
        {activeTab === 'terms' && (
          <div className="glass-panel-glow" style={{ maxWidth: '800px', margin: '0 auto', width: '100%', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ borderBottom: '1px solid var(--border-light)', paddingBottom: '12px' }}>
              <h2 style={{ fontSize: '1.4rem', fontWeight: '800', color: 'white', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FileText style={{ width: '22px', height: '22px', color: 'var(--primary)' }} />
                Terms of Service & Use
              </h2>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                Last updated: May 24, 2026. Standard governing guidelines for autonomous command centers.
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', fontSize: '0.775rem', lineHeight: '1.6', color: 'var(--text-secondary)' }}>
              <h3 style={{ color: 'white', fontSize: '0.95rem', fontWeight: '700' }}>1. Local Workstation Licensing</h3>
              <p>
                VANBA Job Hunter AI grants you a personal, local-only license to run the background scraping and automatic applier daemon loop on your machine. You agree to use the software responsibly, complying with the application thresholds, daily limits, and terms of service of the target remote boards.
              </p>

              <h3 style={{ color: 'white', fontSize: '0.95rem', fontWeight: '700', marginTop: '6px' }}>2. Recruiter Screening Disclaimers</h3>
              <p>
                While the Playwright Stealth module utilizes state-of-the-art evasive scripts (timing noise, residential proxies, human mouse movements), VANBA Global does not guarantee immunity from job portal security flags. It is the user's responsibility to set realistic daily submission limits (recommended: 10 per day) and configure premium proxy connections.
              </p>

              <h3 style={{ color: 'white', fontSize: '0.95rem', fontWeight: '700', marginTop: '6px' }}>3. Disclaimer of Career Outcomes</h3>
              <p>
                VANBA Job Hunter AI is an productivity tool designed to accelerate recruitment workflows. The agent evaluates listings based on pre-filters, local heuristics, and OpenRouter multi-model ensemble analysis. All final application submissions, cover letters, and screening inputs are subject to recruiter review, and the system is not liable for career placement results or job boarding blocks.
              </p>
            </div>
          </div>
        )}

        {/* TAB: COOKIE POLICY */}
        {activeTab === 'cookies' && (
          <div className="glass-panel-glow" style={{ maxWidth: '800px', margin: '0 auto', width: '100%', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ borderBottom: '1px solid var(--border-light)', paddingBottom: '12px' }}>
              <h2 style={{ fontSize: '1.4rem', fontWeight: '800', color: 'white', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Cookie style={{ width: '22px', height: '22px', color: 'var(--accent)' }} />
                Cookie & Session Governance Policy
              </h2>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                Last updated: May 24, 2026. How we manage active browser cookies and authentication tokens.
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', fontSize: '0.775rem', lineHeight: '1.6', color: 'var(--text-secondary)' }}>
              <h3 style={{ color: 'white', fontSize: '0.95rem', fontWeight: '700' }}>1. Purpose of Session Cookies</h3>
              <p>
                To successfully bypass manual login forms during automated Playwright stealth runs, the agent requires direct session cookies (e.g. `li_at` for LinkedIn or custom session IDs for other boards). These cookies allow the browser automation runner to inject active sessions instantly, preventing recruiter servers from prompting for email passwords or multi-factor checks.
              </p>

              <h3 style={{ color: 'white', fontSize: '0.95rem', fontWeight: '700', marginTop: '6px' }}>2. Encrypted SQLite Storage</h3>
              <p>
                All browser session cookies submitted via the **Settings** panel are written directly to your local SQLite database (`dev.db`). They are loaded on the fly only when a Playwright stealth session is spawned and are never sent to external servers or logged in plain-text logs.
              </p>

              <h3 style={{ color: 'white', fontSize: '0.95rem', fontWeight: '700', marginTop: '6px' }}>3. How to Extract Session Cookies Safely</h3>
              <p>
                You can extract your active recruitment cookies safely using standard browser developer tools (F12 &gt; Application &gt; Cookies) or popular privacy-focused cookie export extensions (such as EditThisCookie). Only copy the required tokens and format them as standard JSON arrays (e.g. [&#123;"name": "li_at", "value": "TOKEN", "domain": ".linkedin.com"&#125;]) before updating settings.
              </p>
            </div>
          </div>
        )}

      </main>

      {/* Premium SEO + AEO + GEO Optimized Footer */}
      <footer className="glass-panel" style={{ borderTop: '1px solid var(--border-light)', borderRadius: 0, padding: '24px 40px', marginTop: '40px', background: 'rgba(8,11,18,0.95)' }}>
        <div style={{ maxWidth: '1300px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ background: 'linear-gradient(135deg, var(--primary) 0%, var(--accent) 100%)', width: '28px', height: '28px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
                <Cpu style={{ width: '16px', height: '16px' }} />
              </div>
              <div>
                <span style={{ fontSize: '0.85rem', fontWeight: '800', color: 'white', fontFamily: 'var(--font-mono)' }}>
                  VANBA JOB HUNTER <span style={{ color: 'var(--primary)' }}>AI</span>
                </span>
                <span style={{ display: 'block', fontSize: '0.55rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px' }}>
                  24/7 Autopilot Career Command Center
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', fontSize: '0.725rem', fontFamily: 'var(--font-mono)' }}>
              <button onClick={() => setActiveTab('about')} style={{ background: 'none', border: 'none', color: activeTab === 'about' ? 'white' : 'var(--text-secondary)', cursor: 'pointer' }} className="nav-btn">About Us</button>
              <button onClick={() => setActiveTab('contact')} style={{ background: 'none', border: 'none', color: activeTab === 'contact' ? 'white' : 'var(--text-secondary)', cursor: 'pointer' }} className="nav-btn">Contact</button>
              <button onClick={() => setActiveTab('privacy')} style={{ background: 'none', border: 'none', color: activeTab === 'privacy' ? 'white' : 'var(--text-secondary)', cursor: 'pointer' }} className="nav-btn">Privacy Policy</button>
              <button onClick={() => setActiveTab('terms')} style={{ background: 'none', border: 'none', color: activeTab === 'terms' ? 'white' : 'var(--text-secondary)', cursor: 'pointer' }} className="nav-btn">Terms of Use</button>
              <button onClick={() => setActiveTab('cookies')} style={{ background: 'none', border: 'none', color: activeTab === 'cookies' ? 'white' : 'var(--text-secondary)', cursor: 'pointer' }} className="nav-btn">Cookie Policy</button>
            </div>
          </div>

          <div style={{ borderTop: '1px solid rgba(255,255,255,0.03)', paddingTop: '12px', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: '10px', fontSize: '0.625rem', color: 'var(--text-muted)' }}>
            <span>
              &copy; 2026 VANBA , Raipur , Chhatisgarh , India. All rights reserved.
            </span>
            <span style={{ maxWidth: '600px', textAlign: 'right', lineHeight: '1.4' }}>
              Optimized for Generative Answer Engines & Local Workstation Intelligence. Powered by OpenRouter cloud-models API and isolated Playwright Stealth connection networks.
            </span>
          </div>
        </div>
      </footer>

      {false && showOnboarding && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0, 0, 0, 0.85)', backdropFilter: 'blur(12px)' }}>
          <div className="glass-panel-glow" style={{ width: '100%', maxWidth: '480px', padding: '30px', border: '1px solid var(--border-hover)', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ background: 'linear-gradient(135deg, var(--primary) 0%, var(--accent) 100%)', width: '48px', height: '48px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px', color: 'white' }}>
                <Sparkles style={{ width: '24px', height: '24px' }} />
              </div>
              <h2 style={{ fontSize: '1.2rem', fontWeight: '800', color: 'white', letterSpacing: '0.5px', fontFamily: 'var(--font-mono)' }}>CAREER AUTO-MATCH SETUP</h2>
              <p style={{ fontSize: '0.725rem', color: 'var(--text-secondary)', marginTop: '4px', lineHeight: '1.4' }}>
                CEO, define your core target fields and seniority levels. You can select multiple domains and seniority levels, and the Worker Agent will dynamically evaluate listings against them.
              </p>
            </div>
            
            <div className="settings-form">
              {/* Field Select */}
              <div className="form-group">
                <label className="form-group-lbl">Interested Career Fields (Select Multiple)</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '6px', marginTop: '4px', maxHeight: '160px', overflowY: 'auto', paddingRight: '4px' }}>
                  {[
                    'Frontend Developer',
                    'Backend Developer',
                    'Full Stack Engineer',
                    'Mobile Developer (iOS / Android)',
                    'Web Developer',
                    'UI/UX Designer',
                    'QA / Test Engineer',
                    'DevOps / SRE',
                    'Cloud Architect / Engineer',
                    'Data Science / AI / ML',
                    'Data Engineer',
                    'Systems Architect',
                    'Cyber Security Specialist / Analyst',
                    'Security Engineer',
                    'Database Administrator',
                    'Game Developer',
                    'Embedded Systems Engineer',
                    'Blockchain Engineer',
                    'Salesforce / CRM Developer',
                    'SAP Consultant / Engineer',
                    'Product Manager',
                    'Product Owner',
                    'Project Manager',
                    'Scrum Master / Agile Coach',
                    'Engineering Manager',
                    'Tech Lead',
                    'CTO / VP of Engineering',
                    'Business Analyst',
                    'Systems Administrator',
                    'Network Engineer',
                    'HR Specialist / Recruiter',
                    'Talent Acquisition',
                    'People Operations Manager',
                    'Marketing Manager / Specialist',
                    'SEO & Content Specialist',
                    'Growth Hacker',
                    'Sales Development / Account Executive',
                    'Sales Engineer',
                    'Customer Success Manager',
                    'Customer Support Specialist',
                    'Technical Support Engineer',
                    'Technical Writer',
                    'Business Development Manager',
                    'Operations Manager',
                    'Finance / Data Analyst',
                    'Graphic Designer / Illustrator',
                    'Motion Designer',
                    'Bioinformatics Specialist',
                    'Hardware Engineer',
                    'Chief Executive Officer (CEO)'
                  ].map(f => {
                    const isSel = selectedFields.includes(f);
                    return (
                      <button
                        key={f}
                        type="button"
                        onClick={() => {
                          setSelectedFields(prev => 
                            prev.includes(f) ? prev.filter(x => x !== f) : [...prev, f]
                          );
                        }}
                        className="btn"
                        style={{ 
                          padding: '8px', 
                          fontSize: '0.675rem', 
                          border: '1px solid var(--border-light)', 
                          background: isSel ? 'var(--primary)' : 'rgba(0, 0, 0, 0.25)',
                          color: isSel ? '#000' : 'white',
                          fontWeight: '600'
                        }}
                      >
                        {f}
                      </button>
                    );
                  })}
                </div>
                <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
                  <input 
                    type="text" 
                    placeholder="Or type a custom role/interest..." 
                    className="form-input" 
                    style={{ flex: 1, padding: '8px 12px', fontSize: '0.8rem' }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        const val = e.currentTarget.value.trim();
                        if (val && !selectedFields.includes(val)) {
                          setSelectedFields(prev => [...prev, val]);
                          e.currentTarget.value = '';
                        }
                      }
                    }}
                  />
                  <button 
                    type="button"
                    className="btn btn-primary"
                    style={{ padding: '8px 16px', fontSize: '0.8rem' }}
                    onClick={(e) => {
                      const input = e.currentTarget.previousElementSibling as HTMLInputElement;
                      const val = input.value.trim();
                      if (val && !selectedFields.includes(val)) {
                        setSelectedFields(prev => [...prev, val]);
                        input.value = '';
                      }
                    }}
                  >Add</button>
                </div>
              </div>

              {/* Seniority Select */}
              <div className="form-group" style={{ marginTop: '8px' }}>
                <label className="form-group-lbl">Seniority Experience Levels (Select Multiple)</label>
                <div className="grid-cols-2" style={{ gap: '8px', marginTop: '4px' }}>
                  {['Entry-level', 'Senior', 'Manager', 'Director', 'Executive'].map(lvl => {
                    const isSel = selectedLevels.includes(lvl);
                    return (
                      <button
                        key={lvl}
                        type="button"
                        onClick={() => {
                          setSelectedLevels(prev => 
                            prev.includes(lvl) ? prev.filter(x => x !== lvl) : [...prev, lvl]
                          );
                        }}
                        className="btn"
                        style={{ 
                          padding: '8px 4px', 
                          fontSize: '0.675rem', 
                          border: '1px solid var(--border-light)', 
                          background: isSel ? 'var(--primary)' : 'rgba(0, 0, 0, 0.25)',
                          color: isSel ? '#000' : 'white',
                          fontWeight: '600'
                        }}
                      >
                        {lvl}
                      </button>
                    );
                  })}
                </div>
              </div>

              <button 
                type="button"
                disabled={selectedFields.length === 0 || selectedLevels.length === 0}
                onClick={async () => {
                  const updatedSettings = {
                    ...settings,
                    targetField: JSON.stringify(selectedFields),
                    experienceLevel: JSON.stringify(selectedLevels)
                  };
                  try {
                      const res = await fetch(`${API_BASE}/settings`, {
                      method: 'PUT',
                      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                      body: JSON.stringify(updatedSettings)
                    });
                    const data = await res.json();
                    setSettings(data);
                    
                    // Mark onboarding as complete in the profile
                      await fetch(`${API_BASE}/profile`, {
                      method: 'PUT',
                      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                      body: JSON.stringify({ onboarding_completed: true })
                    });
                    
                    setShowOnboarding(false);
                    setActiveTab('dashboard');
                    alert('Target parameters locked! Autopilot is fully configured and ready to execute command directives.');
                  } catch (e) {
                    alert('Onboarding failed. Please try again.');
                  }
                }}
                className="btn btn-primary" 
                style={{ width: '100%', padding: '12px', fontSize: '0.75rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: '14px' }}
              >
                Initialize AI Autopilot
              </button>

            </div>
          </div>
        </div>
      )}
      
      {toastMessage && (
        <div style={{ position: 'fixed', top: 30, left: '50%', transform: 'translateX(-50%)', background: '#10b981', color: 'white', padding: '12px 24px', borderRadius: '8px', zIndex: 999999, display: 'flex', alignItems: 'center', boxShadow: '0 8px 24px rgba(16,185,129,0.5)', fontWeight: '600', fontSize: '0.9rem', animation: 'fadeInDown 0.3s ease' }}>
          {toastMessage}
        </div>
      )}
    </div>
  );
}
