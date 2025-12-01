import { useLocation } from 'wouter';
import { ArrowLeft, Lock } from 'lucide-react';

export default function Login() {
  const [, setLocation] = useLocation();

  const handleGoogleSignIn = () => {
    // Redirect to Google OAuth endpoint
    window.location.href = '/api/auth/google';
  };

  return (
    <div className="h-screen w-full overflow-y-auto bg-void flex flex-col items-center justify-center p-4 relative">
      {/* Background Atmosphere */}
      <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1635322966219-b75ed372eb01?q=80&w=2664')] bg-cover bg-center opacity-20 fixed"></div>
      <div className="absolute inset-0 bg-gradient-to-t from-void via-void/80 to-transparent fixed"></div>

      <div className="relative z-10 w-full max-w-md bg-void-light/90 backdrop-blur-xl border border-white/10 p-8 rounded-2xl shadow-2xl space-y-8 my-auto">
        <div className="text-center space-y-2">
          <h1 className="font-fantasy text-3xl text-gold">Unlock Destiny</h1>
          <p className="text-gray-400 text-sm">Save your progress and transcend mortal limits.</p>
        </div>

        <div className="space-y-4">
          <button 
            onClick={handleGoogleSignIn}
            className="w-full py-3 px-4 bg-white text-black font-bold rounded-lg flex items-center justify-center gap-3 hover:bg-gray-100 transition-colors"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.11c-.22-.66-.35-1.36-.35-2.11s.13-1.45.35-2.11V7.05H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.95l3.66-2.84z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.05l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Sign in with Google
          </button>

          <div className="relative py-2">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-white/10"></div></div>
            <div className="relative flex justify-center text-xs uppercase"><span className="bg-void-light px-2 text-gray-500">Coming Soon</span></div>
          </div>

          {/* TODO: Stripe Integration */}
          <button disabled className="w-full py-3 px-4 bg-void border border-white/10 text-gray-500 font-bold rounded-lg flex items-center justify-center gap-3 cursor-not-allowed opacity-75">
            <Lock className="w-4 h-4" />
            <span className="line-through">Purchase Full Game ($4.99)</span>
          </button>
        </div>

        <div className="text-center">
          <button onClick={() => setLocation('/')} className="text-gray-500 hover:text-white text-xs flex items-center justify-center gap-1 mx-auto transition-colors">
            <ArrowLeft className="w-3 h-3" /> Back to Free Trial
          </button>
        </div>

        <div className="text-[10px] text-center text-gray-600 space-x-4">
          <a href="/terms" className="hover:text-gray-400">Terms</a>
          <a href="/privacy" className="hover:text-gray-400">Privacy</a>
        </div>
      </div>
    </div>
  );
}
