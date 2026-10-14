import React, { useEffect, useRef, useState } from 'react';
import { 
  ShieldAlert, 
  Lock, 
  User, 
  Eye, 
  EyeOff, 
  Building2,
  Utensils,
  ShieldCheck,
  MailCheck,
  RefreshCw,
  ArrowLeft,
  Timer
} from 'lucide-react';

const AUTH_API = `${(import.meta.env.VITE_API_URL || 'https://rms-elhj.onrender.com').trim().replace(/\/+$/, '')}/api/auth`;

// 🔐 Admin 2-step login: waiting for the email code
interface OtpState {
  challengeId: string;
  sentTo: string;
  expiresAt: number; // time (ms) when the code stops working
}

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

  // 🔐 Admin email code
  const [otp, setOtp] = useState<OtpState | null>(null);
  const [digits, setDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [otpInfo, setOtpInfo] = useState('');
  const [now, setNow] = useState(Date.now());
  const digitRefs = useRef<Array<HTMLInputElement | null>>([]);

  // Countdown (ticks every 0.25 s while the code screen is open)
  useEffect(() => {
    if (!otp) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [otp]);

  const secondsLeft = otp ? Math.max(0, Math.ceil((otp.expiresAt - now) / 1000)) : 0;
  const codeExpired = !!otp && secondsLeft === 0;
  const code = digits.join('');

  const openOtp = (data: any) => {
    setOtp({
      challengeId: data.challengeId,
      sentTo: data.sentTo || 'your email',
      expiresAt: Date.now() + (Number(data.expiresIn) || 60) * 1000,
    });
    setDigits(['', '', '', '', '', '']);
    setOtpInfo(data.message || '');
    setErrorMsg('');
    setNow(Date.now());
    window.setTimeout(() => digitRefs.current[0]?.focus(), 50);
  };

  const backToLogin = (message = '') => {
    setOtp(null);
    setDigits(['', '', '', '', '', '']);
    setOtpInfo('');
    setPassword('');
    setErrorMsg(message);
  };

  const verifyCode = async (value: string) => {
    if (!otp || value.length !== 6 || isLoading) return;
    if (codeExpired) {
      setErrorMsg(lang === 'en' ? 'This code has expired. Please send a new code.' : 'कोडको समय सकियो। नयाँ कोड पठाउनुहोस्।');
      return;
    }
    setIsLoading(true);
    setErrorMsg('');
    try {
      const res = await fetch(`${AUTH_API}/admin-otp/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challengeId: otp.challengeId, code: value }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success && data.token) {
        localStorage.setItem('RESTAURANTUser', JSON.stringify(data.user));
        onLoginSuccess(data.token, data.user);
        return;
      }
      if (data.code === 'OTP_RESTART') return backToLogin(data.message);
      if (data.code === 'OTP_EXPIRED') setOtp((o) => (o ? { ...o, expiresAt: Date.now() } : o));
      setErrorMsg(data.message || 'Wrong code.');
      setDigits(['', '', '', '', '', '']);
      window.setTimeout(() => digitRefs.current[0]?.focus(), 30);
    } catch {
      setErrorMsg(lang === 'en' ? 'Unable to connect to authentication server.' : 'प्रमाणीकरण सर्भरमा जडान गर्न असमर्थ।');
    } finally {
      setIsLoading(false);
    }
  };

  const resendCode = async () => {
    if (!otp || isLoading) return;
    setIsLoading(true);
    setErrorMsg('');
    try {
      const res = await fetch(`${AUTH_API}/admin-otp/resend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challengeId: otp.challengeId }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        openOtp({ ...data, challengeId: otp.challengeId });
        return;
      }
      if (data.code === 'OTP_RESTART') return backToLogin(data.message);
      setErrorMsg(data.message || 'Could not send a new code.');
    } catch {
      setErrorMsg(lang === 'en' ? 'Unable to connect to authentication server.' : 'प्रमाणीकरण सर्भरमा जडान गर्न असमर्थ।');
    } finally {
      setIsLoading(false);
    }
  };

  // Typing / pasting in the 6 boxes
  const setDigitAt = (index: number, raw: string) => {
    const onlyNums = raw.replace(/\D/g, '');
    if (onlyNums.length > 1) {
      // pasted the whole code
      const next = onlyNums.slice(0, 6).split('');
      while (next.length < 6) next.push('');
      setDigits(next);
      digitRefs.current[Math.min(onlyNums.length, 6) - 1]?.focus();
      if (onlyNums.length >= 6) verifyCode(next.join(''));
      return;
    }
    const next = [...digits];
    next[index] = onlyNums;
    setDigits(next);
    if (onlyNums && index < 5) digitRefs.current[index + 1]?.focus();
    if (next.every((d) => d)) verifyCode(next.join(''));
  };

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

  const submittingRef = useRef(false); // stops a double click from logging in twice

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submittingRef.current) return;
    submittingRef.current = true;
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

      if (response.ok && data.success && data.otpRequired) {
        // 🔐 Admin: password correct → now the email code
        openOtp(data);
        return;
      }

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
      submittingRef.current = false;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-start pt-12 sm:pt-16 items-center p-4 relative overflow-hidden font-sans text-slate-800 selection:bg-purple-100 selection:text-purple-900">
      
      {/* Background glow effects */}
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-purple-200/20 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-indigo-200/20 blur-[120px] pointer-events-none" />

      <div className="w-full max-w-md space-y-4 mt-20" id="login-container">
        
        {/* Core Auth Card - Removed top padding and vertical space gaps */}
        <div className={`bg-white border border-slate-100 rounded-3xl shadow-xl px-6 pb-6 sm:px-8 sm:pb-8 relative overflow-hidden ${otp ? 'pt-8 sm:pt-10' : 'pt-0 sm:pt-0'}`} id="login-card">
          
          {/* Header & Standalone Top Logo (hidden on the admin code screen) */}
          {!otp && (
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
          )}

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

          {otp ? (
            /* ================= 🔐 ADMIN EMAIL CODE ================= */
            <div className="space-y-5" id="admin-otp">
              <div className="flex flex-col items-center text-center">
                <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-purple-600 to-indigo-600 text-white shadow-lg shadow-purple-500/30">
                  <ShieldCheck className="h-7 w-7" />
                </span>
                <h2 className="mt-3 text-lg font-extrabold text-slate-900">
                  {lang === 'en' ? 'Verify it’s you' : 'आफूलाई प्रमाणित गर्नुहोस्'}
                </h2>
                <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                  <MailCheck className="h-3.5 w-3.5 text-purple-600" />
                  {lang === 'en' ? 'Code sent to' : 'कोड पठाइयो'} <b className="text-slate-700">{otp.sentTo}</b>
                </p>
              </div>

              {/* Timer */}
              {!codeExpired ? (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] font-bold">
                    <span className="flex items-center gap-1 text-slate-500">
                      <Timer className="h-3.5 w-3.5" /> {lang === 'en' ? 'Code expires in' : 'कोडको समय बाँकी'}
                    </span>
                    <span className={`font-mono text-sm ${secondsLeft <= 10 ? 'text-rose-600' : 'text-purple-700'}`}>
                      {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, '0')}
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={`h-full rounded-full transition-[width] duration-300 ${secondsLeft <= 10 ? 'bg-rose-500' : 'bg-gradient-to-r from-purple-600 to-indigo-500'}`}
                      style={{ width: `${(secondsLeft / 60) * 100}%` }}
                    />
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-2.5 rounded-2xl border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-800">
                  <Timer className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                  <div>
                    <b className="block">{lang === 'en' ? 'Code expired' : 'कोडको समय सकियो'}</b>
                    {lang === 'en'
                      ? 'This code no longer works. Send a new code to your email.'
                      : 'यो कोड अब चल्दैन। इमेलमा नयाँ कोड पठाउनुहोस्।'}
                  </div>
                </div>
              )}

              {/* 6 boxes */}
              <div className="flex justify-between gap-2" onPaste={(e) => { e.preventDefault(); setDigitAt(0, e.clipboardData.getData('text')); }}>
                {digits.map((d, i) => (
                  <input
                    key={i}
                    ref={(el) => { digitRefs.current[i] = el; }}
                    type="text"
                    inputMode="numeric"
                    autoComplete={i === 0 ? 'one-time-code' : 'off'}
                    maxLength={6}
                    value={d}
                    disabled={isLoading || codeExpired}
                    aria-label={`Digit ${i + 1}`}
                    onChange={(e) => setDigitAt(i, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Backspace' && !digits[i] && i > 0) digitRefs.current[i - 1]?.focus();
                    }}
                    className={`h-13 w-full min-w-0 rounded-xl border-2 text-center font-mono text-xl font-extrabold outline-none transition-all disabled:bg-slate-100 disabled:text-slate-300 ${
                      d ? 'border-purple-500 bg-purple-50 text-purple-800' : 'border-slate-200 bg-slate-50 text-slate-800'
                    } focus:border-purple-600 focus:ring-4 focus:ring-purple-500/15`}
                  />
                ))}
              </div>

              {otpInfo && !errorMsg && !codeExpired && (
                <p className="text-center text-[11px] text-slate-400">{otpInfo}</p>
              )}

              {codeExpired ? (
                <button
                  type="button"
                  onClick={resendCode}
                  disabled={isLoading}
                  className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-purple-600 py-3 text-xs font-bold uppercase tracking-wider text-white shadow-md shadow-purple-600/20 transition-all hover:bg-purple-500 active:scale-[0.98] disabled:bg-slate-100 disabled:text-slate-400"
                >
                  <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                  {isLoading ? (lang === 'en' ? 'Sending…' : 'पठाउँदै…') : lang === 'en' ? 'Send code again' : 'फेरि कोड पठाउनुहोस्'}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => verifyCode(code)}
                  disabled={isLoading || code.length !== 6}
                  className="w-full cursor-pointer rounded-xl bg-purple-600 py-3 text-xs font-bold uppercase tracking-wider text-white shadow-md shadow-purple-600/20 transition-all hover:bg-purple-500 active:scale-[0.98] disabled:bg-slate-100 disabled:text-slate-400"
                >
                  {isLoading ? (lang === 'en' ? 'Checking…' : 'जाँच हुँदैछ…') : lang === 'en' ? 'Verify & enter' : 'प्रमाणित गर्नुहोस्'}
                </button>
              )}

              <button
                type="button"
                onClick={() => backToLogin()}
                disabled={isLoading}
                className="mx-auto flex cursor-pointer items-center gap-1.5 text-xs font-bold text-slate-500 transition hover:text-purple-700"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> {lang === 'en' ? 'Back to login' : 'लगइनमा फर्कनुहोस्'}
              </button>
            </div>
          ) : (
          /* Form starting immediately below logo with zero top margin */
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
          )}
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