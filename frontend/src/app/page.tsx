"use client";

import React, { useState } from "react";
import { 
  Menu, X, Play, FolderKanban, Settings, Database, 
  Home, Phone, Info, LogIn, Sparkles, BarChart3, BrainCircuit,
  LogOut, UserPlus
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useUser, useClerk } from "@clerk/nextjs";

// ==========================================
// 1. REUSABLE SIDEBAR COMPONENT
// ==========================================
function Sidebar({ isSignedIn, onCanvasClick, onDatasetsClick }: { isSignedIn: boolean, onCanvasClick: () => void, onDatasetsClick: () => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const router = useRouter();
  const { signOut } = useClerk();

  return (
    <>
      {/* Mobile Hamburger */}
      {!isOpen && (
        <button 
          onClick={() => setIsOpen(true)}
          className="md:hidden absolute top-4 left-4 z-50 p-2 bg-white border-4 border-black shadow-[4px_4px_0px_#000] active:translate-x-1 active:translate-y-1 active:shadow-none rounded-md text-black transition-all"
        >
          <Menu size={24} strokeWidth={3} />
        </button>
      )}

      {/* Sidebar Container */}
      <aside 
        onMouseEnter={() => setIsOpen(true)}
        onMouseLeave={() => setIsOpen(false)}
        className={`
          absolute md:relative z-40 h-full flex flex-col bg-green-100 transition-all duration-300 ease-in-out border-black
          ${isOpen ? "translate-x-0 w-72 border-r-4 shadow-[10px_0px_0px_rgba(0,0,0,0.1)] md:shadow-none" : "-translate-x-full w-72 border-r-0"}
          md:translate-x-0 md:border-r-4 ${isOpen ? "md:w-72" : "md:w-20"}
        `}
      >
        {/* Brand Header */}
        <div className={`h-20 border-b-4 border-black flex items-center text-black overflow-hidden ${isOpen ? 'justify-between px-4' : 'justify-center'}`}>
          {isOpen ? (
            <>
              <h1 className="font-black text-2xl tracking-tighter whitespace-nowrap flex items-center gap-2">
                <Sparkles className="text-yellow-500" /> PRISM.
              </h1>
              <button 
                onClick={() => setIsOpen(false)}
                className="md:hidden p-2 border-2 border-black bg-white text-black shadow-[2px_2px_0px_#000] active:translate-x-1 active:translate-y-1 active:shadow-none transition-all rounded-md"
              >
                <X size={18} strokeWidth={3} />
              </button>
            </>
          ) : (
            <Menu size={24} strokeWidth={3} className="hidden md:block shrink-0" />
          )}
        </div>

        {/* Main Navigation */}
        <div className="flex-1 flex flex-col gap-4 p-4 text-black overflow-hidden">
          <SidebarItem icon={<Home className="shrink-0" />} label="Home Dashboard" isOpen={isOpen} />
          <SidebarItem icon={<FolderKanban className="shrink-0" />} label="Pipeline Canvas" isOpen={isOpen} onClick={onCanvasClick} />
          {/* ---> NEW: Connected Datasets Routing <--- */}
          <SidebarItem icon={<Database className="shrink-0" />} label="Datasets" isOpen={isOpen} onClick={onDatasetsClick} />
          <SidebarItem icon={<Settings className="shrink-0" />} label="Settings" isOpen={isOpen} />
        </div>

        {/* Secondary Navigation (About, Contact, Login/Out) */}
        <div className="flex flex-col gap-2 p-4 border-t-4 border-black bg-white text-black overflow-hidden">
          <SidebarItem icon={<Info className="shrink-0 text-blue-500" />} label="About Us" isOpen={isOpen} />
          <SidebarItem icon={<Phone className="shrink-0 text-pink-500" />} label="Contact" isOpen={isOpen} />
          
          {isSignedIn ? (
            <SidebarItem 
              onClick={() => signOut({ redirectUrl: '/' })} 
              icon={<LogOut className="shrink-0 text-red-600" />} 
              label="Log Out" 
              isOpen={isOpen} 
            />
          ) : (
            <>
              <SidebarItem onClick={() => router.push('/sign-in')} icon={<LogIn className="shrink-0 text-green-600" />} label="Login" isOpen={isOpen} />
              <SidebarItem onClick={() => router.push('/sign-up')} icon={<UserPlus className="shrink-0 text-purple-600" />} label="Sign Up" isOpen={isOpen} />
            </>
          )}
        </div>

        {/* Global Action Button */}
        <div className="p-4 border-t-4 border-black bg-green-200 overflow-hidden flex justify-center">
          <button 
            onClick={onCanvasClick}
            className={`flex items-center justify-center gap-2 border-4 border-black bg-yellow-300 text-black hover:bg-yellow-400 shadow-[4px_4px_0px_#000] active:translate-x-1 active:translate-y-1 active:shadow-none transition-all rounded-xl font-black whitespace-nowrap ${isOpen ? "w-full py-3 text-lg" : "w-12 h-12 p-0"}`}>
            <Play fill="black" stroke="black" size={isOpen ? 24 : 20} className="shrink-0" />
            {isOpen && <span>OPEN CANVAS</span>}
          </button>
        </div>
      </aside>

      {/* Mobile Backdrop */}
      {isOpen && <div className="md:hidden absolute inset-0 bg-black/20 z-30" onClick={() => setIsOpen(false)} />}
    </>
  );
}

function SidebarItem({ icon, label, isOpen, onClick }: { icon: React.ReactNode, label: string, isOpen: boolean, onClick?: () => void }) {
  return (
    <button onClick={onClick} className={`flex items-center gap-3 border-2 border-transparent text-black hover:border-black hover:bg-gray-50 hover:shadow-[4px_4px_0px_#000] transition-all rounded-xl font-bold whitespace-nowrap ${isOpen ? "p-3 w-full" : "p-2 w-11 h-11 justify-center"}`}>
      {icon}
      {isOpen && <span>{label}</span>}
    </button>
  );
}

// ==========================================
// 2. DASHBOARD CARDS
// ==========================================
function DataCleanCard({ onClick }: { onClick: () => void }) {
  const [isHovered, setIsHovered] = useState(false);
  const scrambled = "!@#$ %^&*() _+{}|";
  const clean = "CLEAN DATA";

  return (
    <div 
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="group flex flex-col justify-between p-6 bg-blue-200 border-4 border-black shadow-[8px_8px_0px_#000] rounded-2xl cursor-pointer hover:-translate-y-2 hover:shadow-[12px_12px_0px_#000] transition-all duration-300 h-64"
    >
      <style>{`
        @keyframes swipe {
          0% { transform: translateX(-100%) skewX(-20deg); }
          100% { transform: translateX(200%) skewX(-20deg); }
        }
        .animate-swipe {
          animation: swipe 1s ease-out forwards;
        }
      `}</style>

      <div className="flex justify-between items-start">
        <Sparkles size={40} className={`text-black transition-all duration-500 ${isHovered ? "rotate-180 scale-125" : ""}`} />
        <span className="font-black text-xl bg-white px-3 py-1 border-2 border-black rounded-lg shadow-[2px_2px_0px_#000]">01</span>
      </div>
      <div>
        <div className="relative overflow-hidden inline-block mb-2">
          <h2 className="text-3xl font-black tracking-tight transition-all duration-300">
            {isHovered ? clean : scrambled}
          </h2>
          {isHovered && (
            <div className="absolute inset-y-0 -inset-x-2 bg-white/40 animate-swipe pointer-events-none"></div>
          )}
        </div>
        <p className="font-bold text-gray-800">Auto-impute nulls, drop duplicates, and format your datasets instantly.</p>
      </div>
    </div>
  );
}

function GraphCard({ onClick }: { onClick: () => void }) {
  return (
    <div onClick={onClick} className="group flex flex-col justify-between p-6 bg-pink-200 border-4 border-black shadow-[8px_8px_0px_#000] rounded-2xl cursor-pointer hover:-translate-y-2 hover:shadow-[12px_12px_0px_#000] transition-all duration-300 h-64">
      <div className="flex justify-between items-start">
        <div className="flex items-end gap-1 h-10 w-12 border-b-4 border-black">
          <div className="w-3 bg-black h-2 group-hover:h-8 transition-all duration-500 ease-out"></div>
          <div className="w-3 bg-black h-5 group-hover:h-10 transition-all duration-500 ease-out delay-75"></div>
          <div className="w-3 bg-black h-3 group-hover:h-6 transition-all duration-500 ease-out delay-150"></div>
        </div>
        <span className="font-black text-xl bg-white px-3 py-1 border-2 border-black rounded-lg shadow-[2px_2px_0px_#000]">02</span>
      </div>
      <div>
        <h2 className="text-3xl font-black mb-2 tracking-tight">VISUALIZE</h2>
        <p className="font-bold text-gray-800">Generate correlation matrices, scatter plots, and distribution charts.</p>
      </div>
    </div>
  );
}

function TrainCard({ onClick }: { onClick: () => void }) {
  return (
    <div onClick={onClick} className="group flex flex-col justify-between p-6 bg-purple-300 border-4 border-black shadow-[8px_8px_0px_#000] rounded-2xl cursor-pointer hover:-translate-y-2 hover:shadow-[12px_12px_0px_#000] transition-all duration-300 h-64">
      <div className="flex justify-between items-start">
        <BrainCircuit size={40} className="text-black group-hover:animate-pulse" />
        <span className="font-black text-xl bg-white px-3 py-1 border-2 border-black rounded-lg shadow-[2px_2px_0px_#000]">03</span>
      </div>
      <div>
        <h2 className="text-3xl font-black mb-2 tracking-tight flex items-center gap-2">
          TRAIN MODELS
        </h2>
        <p className="font-bold text-gray-800">Deploy AutoML. Let the Groq Agent pick the perfect algorithm for you.</p>
      </div>
    </div>
  );
}

// ==========================================
// 3. MAIN PAGE LAYOUT
// ==========================================
export default function HomePage() {
  const router = useRouter();
  
  const { isSignedIn, isLoaded } = useUser();

  // Route to canvas
  const handleRestrictedAction = () => {
    if (!isSignedIn) {
      router.push("/sign-in");
    } else {
      router.push("/canvas");
    }
  };

  // ---> NEW: Route to datasets
  const handleDatasetsClick = () => {
    if (!isSignedIn) {
      router.push("/sign-in");
    } else {
      router.push("/datasets");
    }
  };

  if (!isLoaded) {
    return <div className="h-screen w-screen bg-[#fdfaf5] flex items-center justify-center font-black text-xl">LOADING PRISM...</div>;
  }

  return (
    <div className="h-screen w-screen flex bg-[#fdfaf5] text-black font-sans overflow-hidden">
      
      {/* 1. Our Reusable Sidebar */}
      <Sidebar 
        isSignedIn={!!isSignedIn} 
        onCanvasClick={handleRestrictedAction}
        onDatasetsClick={handleDatasetsClick} 
      />

      {/* 2. Main Dashboard Content */}
      <main className="flex-1 overflow-y-auto p-8 md:p-12 relative">
        <div className="max-w-6xl mx-auto">
          
          <header className="mb-12 md:mt-0 mt-10">
            <h1 className="text-5xl md:text-6xl font-black tracking-tighter mb-4 border-b-8 border-black inline-block pb-2">
              WELCOME TO PRISM.
            </h1>
            <p className="text-xl font-bold text-gray-700 max-w-2xl border-l-4 border-green-400 pl-4">
              The world's fastest, AI-driven machine learning pipeline builder. Drag, drop, and deploy in seconds.
            </p>
          </header>

          {/* Interactive Feature Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            <DataCleanCard onClick={handleRestrictedAction} />
            <GraphCard onClick={handleRestrictedAction} />
            <TrainCard onClick={handleRestrictedAction} />
          </div>

          {/* Call to Action Section */}
          <div className="mt-12 p-8 bg-white border-4 border-black shadow-[8px_8px_0px_#000] rounded-2xl flex flex-col md:flex-row items-center justify-between gap-6">
            <div>
              <h3 className="text-2xl font-black mb-2">Ready to build your pipeline?</h3>
              <p className="font-bold text-gray-600">Head over to the canvas and start connecting your nodes.</p>
            </div>
            <button 
              onClick={handleRestrictedAction}
              className="bg-yellow-300 text-black border-4 border-black hover:bg-yellow-400 active:translate-x-1 active:translate-y-1 active:shadow-none shadow-[4px_4px_0px_#000] px-8 py-4 font-black text-xl rounded-xl transition-all whitespace-nowrap"
            >
              OPEN CANVAS
            </button>
          </div>

        </div>
      </main>

    </div>
  );
}