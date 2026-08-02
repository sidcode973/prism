"use client";

import React from "react";
import Link from "next/link";
import { SignUp } from "@clerk/nextjs";
import { ArrowLeft, Sparkles, Bot } from "lucide-react";

export default function SignUpPage() {
    return (
        <div className="min-w-screen min-h-screen flex flex-col md:flex-row bg-[#fdfaf5] text-black font-sans overflow-x-hidden selection:bg-yellow-300">

            {/* LEFT PANEL: Branding & Design Aesthetics */}
            <div className="w-full md:w-1/2 p-8 md:p-12 flex flex-col justify-between border-b-4 md:border-b-0 md:border-r-4 border-black bg-purple-400 relative overflow-hidden">

                {/* Decorative canvas bot background */}
                <div className="absolute top-10 right-10 opacity-20 pointer-events-none rotate-12">
                    <Bot size={200} strokeWidth={1} />
                </div>

                {/* Top Navigation Row */}
                <div className="z-10">
                    <Link href="/">
                        <button
                            type="button"
                            className="p-2 border-2 border-black bg-white hover:bg-gray-100 shadow-[2px_2px_0px_#000] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all rounded-md flex items-center gap-2 font-bold text-sm cursor-pointer"
                        >
                            <ArrowLeft size={18} strokeWidth={3} />
                            BACK TO HOME
                        </button>
                    </Link>
                </div>

                {/* Hero Copywriting */}
                <div className="my-12 md:my-0 z-10 max-w-md">
                    <div className="inline-flex items-center gap-2 bg-yellow-300 border-2 border-black px-3 py-1 rounded-md shadow-[2px_2px_0px_#000] mb-4 font-black text-xs uppercase tracking-wider">
                        <Sparkles size={14} fill="black" /> Create New Account
                    </div>
                    <h1 className="text-4xl md:text-6xl font-black uppercase tracking-tighter text-white drop-shadow-[4px_4px_0px_#000] leading-none mb-4">
                        Join the AI Pipeline Engine.
                    </h1>
                    <p className="font-bold text-black text-lg md:text-xl leading-snug">
                        Build, clean, and orchestrate autonomous ML graphs without writing complex code infrastructure.
                    </p>
                </div>

                {/* Info Block */}
                <div className="hidden md:block z-10 bg-white border-4 border-black p-4 rounded-xl shadow-[6px_6px_0px_#000] max-w-xs">
                    <p className="font-black text-sm uppercase text-gray-500">Secure Registration</p>
                    <p className="font-bold text-xs mt-1 text-gray-700">Verifying your profile ensures access to shared workspace graph canvas endpoints.</p>
                </div>
            </div>

            {/* RIGHT PANEL: Sign Up Form Interface */}
            <div className="w-full md:w-1/2 flex items-center justify-center p-6 md:p-12 relative bg-[#fdfaf5]">

                {/* Core Container injection mapping Clerk onto your design rules */}
                <div className="w-full max-w-[480px] bg-white border-4 border-black rounded-2xl p-6 md:p-8 shadow-[8px_8px_0px_#000] relative">

                    <div className="mb-6">
                        <h2 className="text-2xl font-black uppercase tracking-tight mb-1">Create Account</h2>
                    </div>

                    {/* Custom Clerk Injector */}
                    <div>
                        <SignUp
                            routing="path"
                            path="/sign-up"
                            signInUrl="/sign-in"
                            fallbackRedirectUrl="/dashboard" // Redirects straight to your core workspace canvas layout
                            appearance={{
                                elements: {
                                    rootBox: "w-full",
                                    cardBox: "shadow-none border-0 p-0 bg-transparent w-full",
                                    headerTitle: "hidden", 
                                    headerSubtitle: "hidden",
                                    // FIXED: text-black for raw Neo-Brutalist contrast
                                    formButtonPrimary: "w-full border-4 border-black bg-purple-400 hover:bg-purple-500 text-black font-black text-sm rounded-xl py-3 shadow-[4px_4px_0px_#000] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all uppercase tracking-wider normal-case cursor-pointer",
                                    // FIXED: bg-white to maintain flat structural aesthetic
                                    formFieldInput: "w-full border-4 border-black rounded-xl p-3 font-bold focus:ring-4 focus:ring-purple-300 outline-none text-sm bg-white text-black",
                                    formFieldLabel: "font-black uppercase text-xs text-black mb-1",
                                    socialButtonsBlockButton: "border-4 border-black bg-white hover:bg-gray-50 rounded-xl shadow-[4px_4px_0px_#000] font-bold text-sm text-black transition-all active:translate-x-0.5 active:translate-y-0.5 active:shadow-none cursor-pointer",
                                    socialButtonsBlockButtonText: "font-black text-black",
                                    dividerLine: "bg-black h-1",
                                    dividerText: "font-black uppercase text-xs px-2 bg-white text-black",
                                    footerActionText: "font-bold text-gray-500",
                                    footerActionLink: "text-purple-600 font-black hover:underline",
                                    formFieldErrorText: "font-bold text-red-500 border-2 border-black bg-red-100 p-2 rounded-md mt-1 text-xs"
                                }
                            }}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}