import React, { useState } from 'react';
import { 
  ShieldAlert, 
  Lock, 
  User, 
  Eye, 
  EyeOff, 
  Building2,
  Utensils 
} from 'lucide-react';

interface LoginScreenProps {
  lang: 'en' | 'ne';
  setLang: (l: 'en' | 'ne') => void;
  onLoginSuccess: (token: string, userDetails?: any) => void;
}

export default function LoginScreen({ lang, setLang, onLoginSuccess }: LoginScreenProps) {
  const [RESTAURANTName, setRESTAURANTName] = useState('');
  const [staffId, setStaffId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const t = {
    en: {
      portalTitle: "Authentication Portal",
      subtitle: "Restaurant Management System",
      RESTAURANTLabel: "Restaurant Name",
      RESTAURANTPlaceholder: "Enter registered Restaurant name",
      idLabel: "User ID",
      idPlaceholder: "Enter your ID",
      passLabel: "Access Password",
      passPlaceholder: "Enter password",
      loginBtn: "Authenticate & Enter",
      authenticating: "Verifying credentials...",
      errorHeader: "Access Denied",
      unauthorizedTip: "Only authorized people are permitted to access this panel.",
      envNote: "Staff credentials are secure and checked in real-time with server database records.",
      viewTitle: "Digital Restaurant",
      location: ""
    },
    ne: {
      portalTitle: "प्रमाणीकरण पोर्टल",
      subtitle: "रेस्टुरेन्ट व्यवस्थापन प्रणाली",
      RESTAURANTLabel: "रेस्टुरेन्टको नाम",
      RESTAURANTPlaceholder: "रेस्टुरेन्टको नाम हाल्नुहोस्",
      idLabel: "प्रयोगकर्ता ID",
      idPlaceholder: "आफ्नो ID हाल्नुहोस्",
      passLabel: "पहुँच पासवर्ड",
      passPlaceholder: "पासवर्ड हाल्नुहोस्",
      loginBtn: "प्रमाणित गर्नुहोस् र प्रवेश गर्नुहोस्",
      authenticating: "प्रमाणीकरण हुँदैछ...",
      errorHeader: "पहुँच अस्वीकृत",
      unauthorizedTip: "केवल अधिकृत कर्मचारीहरूलाई मात्र यो प्रणाली पहुँच गर्न अनुमति छ।",
      envNote: "कर्मचारी परिचयपत्र सुरक्षित छन् र वास्तविक-समय डाटाबेस रेकर्डहरूसँग जाँच गरिन्छ।",
      viewTitle: "डिजिटल रेस्टुरेन्ट",
      location: ""
    }
  }[lang];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setIsLoading(true);

    try {
     const response = await fetch(`${(import.meta.env.VITE_API_URL || 'https://rms-elhj.onrender.com').trim().replace(/\/+$/, '')}/api/auth/login`,  {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          restaurantName: RESTAURANTName.trim(), 
          id: staffId.trim(),                
          password                        
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        const userDetails = data.user;
        localStorage.setItem('RESTAURANTUser', JSON.stringify(userDetails));
        onLoginSuccess(data.token, userDetails);
      } else {
        setErrorMsg(data.message || t.errorHeader);
      }
    } catch (err) {
      setErrorMsg(lang === 'en' ? 'Unable to connect to authentication server.' : 'प्रमाणीकरण सर्भरमा जडान गर्न असमर्थ।');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-start pt-12 sm:pt-16 items-center p-4 relative overflow-hidden font-sans text-slate-800 selection:bg-purple-100 selection:text-purple-900">
      
      {/* Background glow effects */}
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-purple-200/20 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-indigo-200/20 blur-[120px] pointer-events-none" />

      <div className="w-full max-w-md space-y-4 mt-20" id="login-container">
        
        {/* Core Auth Card - Removed top padding and vertical space gaps */}
        <div className="bg-white border border-slate-100 rounded-3xl shadow-xl px-6 pb-6 pt-0 sm:px-8 sm:pb-8 sm:pt-0 relative overflow-hidden" id="login-card">
          
          {/* Header & Standalone Top Logo (Zero bottom margin) */}
          <div className="flex flex-col items-center text-center m-0 p-0" id="login-header">
            <div className="flex items-center justify-center m-0 p-0">
              <img
                src="/logo.png"
                alt="Restaurant Logo"
                className="h-48 w-auto object-contain rounded-t-2xl block m-0 p-0"
                onError={(e) => {
                  const target = e.currentTarget;
                  target.style.display = 'none';
                  const fallback = target.nextElementSibling as HTMLElement | null;
                  if (fallback) fallback.classList.remove('hidden');
                }}
              />
              <Utensils className="h-16 w-16 text-purple-600 hidden" />
            </div>
          </div>

          {/* Alert messages */}
          {errorMsg && (
            <div className="my-3 p-3.5 bg-red-50 border border-red-100 rounded-2xl text-xs text-red-700 flex gap-2.5 items-start" id="login-error-alert">
              <ShieldAlert className="h-4.5 w-4.5 text-red-500 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <span className="font-bold block">{t.errorHeader}</span>
                <p className="opacity-90">{errorMsg}</p>
              </div>
            </div>
          )}

          {/* Form starting immediately below logo with zero top margin */}
          <form onSubmit={handleSubmit} className="space-y-4 mt-0" id="login-form">
            
            {/* Restaurant Name Field */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider block">{t.RESTAURANTLabel}</label>
              <div className="relative">
                <Building2 className="absolute left-3.5 top-3 w-4.5 h-4.5 text-slate-400" />
                <input
                  type="text"
                  required
                  value={RESTAURANTName}
                  onChange={(e) => setRESTAURANTName(e.target.value)}
                  placeholder={t.RESTAURANTPlaceholder}
                  disabled={isLoading}
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50/55 border border-slate-200 rounded-xl text-sm placeholder-slate-400 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all text-slate-800 font-medium"
                />
              </div>
            </div>

            {/* Staff ID Field */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider block">{t.idLabel}</label>
              <div className="relative">
                <User className="absolute left-3.5 top-3 w-4.5 h-4.5 text-slate-400" />
                <input
                  type="text"
                  required
                  value={staffId}
                  onChange={(e) => setStaffId(e.target.value)}
                  placeholder={t.idPlaceholder}
                  disabled={isLoading}
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50/55 border border-slate-200 rounded-xl text-sm placeholder-slate-400 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all text-slate-800 font-medium"
                />
              </div>
            </div>

            {/* Password Field */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider block">{t.passLabel}</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-3 w-4.5 h-4.5 text-slate-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t.passPlaceholder}
                  disabled={isLoading}
                  className="w-full pl-10 pr-10 py-2.5 bg-slate-50/55 border border-slate-200 rounded-xl text-sm placeholder-slate-400 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all text-slate-800 font-medium"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-3 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 bg-purple-600 hover:bg-purple-500 disabled:bg-slate-100 disabled:text-slate-400 text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-md shadow-purple-600/10 hover:shadow-purple-600/20 active:scale-[0.98] cursor-pointer mt-2"
            >
              {isLoading ? t.authenticating : t.loginBtn}
            </button>
          </form>
        </div>

        {/* Security watermark footer */}
        <div className="text-center space-y-1 opacity-80">
          <p className="text-base font-bold text-[#9333EA]">Official IRD verified RMS system</p>
          <p className="text-[10px] text-slate-400">{t.unauthorizedTip}</p>
          <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">{t.envNote}</p>
        </div>
      </div>
    </div>
  );
}