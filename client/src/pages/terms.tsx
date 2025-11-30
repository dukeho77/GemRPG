import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { useLocation } from 'wouter';

export default function Terms() {
  const [, setLocation] = useLocation();
  
  return (
    <div className="h-screen w-full overflow-y-auto bg-void p-8 md:p-16 font-body text-gray-300">
      <div className="max-w-2xl mx-auto space-y-8">
        <button onClick={() => setLocation('/login')} className="flex items-center gap-2 text-mystic hover:text-white transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        
        <h1 className="text-3xl font-fantasy text-gold">Terms of Service</h1>
        
        <div className="prose prose-invert prose-sm">
          <p>Last updated: November 2025</p>
          
          <h3>1. Acceptance of Terms</h3>
          <p>By accessing and using GemRPG ("the Service"), you accept and agree to be bound by the terms and provision of this agreement.</p>
          
          <h3>2. Service Description</h3>
          <p>GemRPG is an AI-powered text adventure game. The content is generated dynamically and we do not guarantee specific outcomes or content types.</p>
          
          <h3>3. User Accounts</h3>
          <p>You are responsible for maintaining the security of your account. The "Free Tier" is limited to 5 turns per session. Abuse of the system or attempting to bypass these limits may result in IP bans.</p>
          
          <h3>4. Intellectual Property</h3>
          <p>The game engine, design, and code are property of GemRPG. Your specific story generations are yours to keep and share.</p>
          
          <h3>5. Limitation of Liability</h3>
          <p>The Service is provided "as is". We are not liable for any data loss or service interruptions.</p>
        </div>
      </div>
    </div>
  );
}
