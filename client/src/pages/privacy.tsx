import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { useLocation } from 'wouter';

export default function Privacy() {
  const [, setLocation] = useLocation();

  return (
    <div className="h-screen w-full overflow-y-auto bg-void p-8 md:p-16 font-body text-gray-300">
      <div className="max-w-2xl mx-auto space-y-8">
        <button onClick={() => setLocation('/login')} className="flex items-center gap-2 text-mystic hover:text-white transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        
        <h1 className="text-3xl font-fantasy text-gold">Privacy Policy</h1>
        
        <div className="prose prose-invert prose-sm">
          <p>Last updated: November 2025</p>
          
          <h3>1. Data Collection</h3>
          <p>We collect minimal data necessary to operate the game:</p>
          <ul>
            <li><strong>IP Address:</strong> Used for rate limiting the free tier.</li>
            <li><strong>Game State:</strong> Temporary storage of your current game session.</li>
            <li><strong>Account Info:</strong> If you log in via Google, we store your email and name for authentication.</li>
          </ul>
          
          <h3>2. AI Interactions</h3>
          <p>Your inputs are sent to third-party AI providers (e.g., Google Gemini) to generate the story. Please do not share sensitive personal information in your game prompts.</p>
          
          <h3>3. Cookies</h3>
          <p>We use local storage to save your preferences and session state. We do not use tracking cookies for advertising.</p>
          
          <h3>4. Data Sharing</h3>
          <p>We do not sell your data. Data is only shared with service providers (AI models, hosting) as required to function.</p>
        </div>
      </div>
    </div>
  );
}
