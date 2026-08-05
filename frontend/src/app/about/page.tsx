"use client";

import React from "react";
import Link from "next/link";
import {
  ArrowLeft, Sparkles, BrainCircuit, Database, Bot, 
  Zap, Shield, BarChart3, Cpu, GitBranch, Layers,
  Code2, Rocket, Users, Target, ChevronRight
} from "lucide-react";

const techStack = [
  { name: "Next.js 16", desc: "React framework with SSR & App Router", color: "bg-black text-white", icon: <Code2 size={20} /> },
  { name: "FastAPI", desc: "Async Python REST API backend", color: "bg-green-300", icon: <Zap size={20} /> },
  { name: "ReactFlow", desc: "Visual node-based graph canvas", color: "bg-blue-300", icon: <GitBranch size={20} /> },
  { name: "FLAML AutoML", desc: "Automated model selection & tuning", color: "bg-purple-300", icon: <BrainCircuit size={20} /> },
  { name: "Polars", desc: "High-performance DataFrame engine", color: "bg-orange-300", icon: <Cpu size={20} /> },
  { name: "Groq / Llama 3", desc: "AI-powered pipeline routing", color: "bg-pink-300", icon: <Bot size={20} /> },
  { name: "MinIO", desc: "S3-compatible object storage", color: "bg-yellow-300", icon: <Database size={20} /> },
  { name: "Clerk", desc: "Authentication & user management", color: "bg-cyan-300", icon: <Shield size={20} /> },
];

const features = [
  {
    title: "AI-POWERED PIPELINE BUILDER",
    desc: "Describe what you want in plain English. Our Groq-powered Llama 3 agent interprets your intent and generates a complete ML pipeline — or drag and drop nodes manually.",
    icon: <Bot size={36} />,
    color: "bg-pink-200",
  },
  {
    title: "BLUEPRINT ARCHITECTURE",
    desc: "Every transformation records its parameters in a reproducible JSON blueprint. Deploy your model anywhere and the blueprint guarantees identical preprocessing.",
    icon: <Layers size={36} />,
    color: "bg-blue-200",
  },
  {
    title: "ONE-CLICK DEPLOYMENT",
    desc: "Train a model and deploy it as a live REST API endpoint — all from the canvas. Test predictions instantly in the built-in API playground.",
    icon: <Rocket size={36} />,
    color: "bg-green-200",
  },
  {
    title: "INTERACTIVE VISUALIZATIONS",
    desc: "Generate scatter plots, bar charts, histograms, boxplots, and correlation heatmaps. All charts are interactive, zoomable, and downloadable.",
    icon: <BarChart3 size={36} />,
    color: "bg-yellow-200",
  },
];

export default function AboutPage() {
  return (
    <div className="min-h-screen w-full bg-[#fdfaf5] text-black font-[family-name:var(--font-geist-sans)]">
      
      {/* HERO HEADER */}
      <header className="border-b-4 border-black bg-purple-400 relative overflow-hidden">
        {/* Decorative elements */}
        <div className="absolute top-10 right-10 opacity-10 pointer-events-none rotate-12">
          <BrainCircuit size={300} strokeWidth={1} />
        </div>
        <div className="absolute bottom-0 left-20 opacity-10 pointer-events-none -rotate-12">
          <Sparkles size={200} strokeWidth={1} />
        </div>

        <div className="relative z-10 max-w-6xl mx-auto px-6 py-12 md:py-20">
          <Link 
            href="/"
            className="w-fit mb-8 p-2 px-4 border-4 border-black bg-white hover:bg-gray-100 shadow-[4px_4px_0px_#000] active:translate-x-1 active:translate-y-1 active:shadow-none transition-all rounded-xl flex items-center gap-2 font-black text-sm cursor-pointer"
          >
            <ArrowLeft size={18} strokeWidth={3} />
            BACK TO HOME
          </Link>

          <div className="inline-flex items-center gap-2 bg-yellow-300 border-4 border-black px-4 py-1.5 rounded-lg shadow-[4px_4px_0px_#000] mb-6 font-black text-xs uppercase tracking-wider">
            <Sparkles size={14} fill="black" /> About Project Prism
          </div>

          <h1 className="text-5xl md:text-7xl font-black uppercase tracking-tighter text-white drop-shadow-[4px_4px_0px_#000] leading-none mb-6">
            THE AI PIPELINE
            <br />
            ENGINE.
          </h1>

          <p className="font-bold text-lg md:text-xl text-black max-w-2xl leading-relaxed">
            Project Prism is an autonomous machine learning platform that lets you build, clean, engineer, train, visualize, and deploy ML models — all from a visual drag-and-drop canvas powered by artificial intelligence.
          </p>
        </div>
      </header>

      {/* MISSION SECTION */}
      <section className="max-w-6xl mx-auto px-6 py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
          <div>
            <h2 className="text-4xl font-black uppercase tracking-tighter mb-4 border-b-8 border-black inline-block pb-2">
              OUR MISSION
            </h2>
            <p className="font-bold text-lg text-gray-700 leading-relaxed mb-6">
              Machine learning shouldn&apos;t require a PhD. We built Prism to democratize the entire ML workflow — from messy CSV files to production-ready API endpoints — in a single, intuitive interface.
            </p>
            <p className="font-bold text-gray-600 leading-relaxed">
              Every pipeline step is transparent, reproducible, and explainable. Our Blueprint Architecture ensures your models produce identical results in development and production — eliminating the dreaded training-serving skew.
            </p>
          </div>

          <div className="bg-white border-4 border-black shadow-[8px_8px_0px_#000] rounded-2xl p-6 flex flex-col gap-4">
            <div className="flex items-center gap-3 border-b-2 border-gray-200 pb-3">
              <div className="p-2 bg-yellow-300 border-2 border-black rounded-lg">
                <Target size={24} />
              </div>
              <div>
                <h3 className="font-black text-lg">ZERO-CODE ML</h3>
                <p className="text-sm font-bold text-gray-500">No infrastructure code required</p>
              </div>
            </div>
            <div className="flex items-center gap-3 border-b-2 border-gray-200 pb-3">
              <div className="p-2 bg-green-300 border-2 border-black rounded-lg">
                <Shield size={24} />
              </div>
              <div>
                <h3 className="font-black text-lg">REPRODUCIBLE</h3>
                <p className="text-sm font-bold text-gray-500">Blueprint-driven transformations</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-300 border-2 border-black rounded-lg">
                <Users size={24} />
              </div>
              <div>
                <h3 className="font-black text-lg">FOR EVERYONE</h3>
                <p className="text-sm font-bold text-gray-500">Students, analysts, and engineers</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FEATURES SECTION */}
      <section className="bg-white border-y-4 border-black py-16">
        <div className="max-w-6xl mx-auto px-6">
          <h2 className="text-4xl font-black uppercase tracking-tighter mb-10 text-center">
            WHAT PRISM DOES
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {features.map((feat, i) => (
              <div
                key={i}
                className={`${feat.color} border-4 border-black shadow-[8px_8px_0px_#000] rounded-2xl p-6 hover:-translate-y-2 hover:shadow-[12px_12px_0px_#000] transition-all duration-300`}
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-3 bg-white border-4 border-black rounded-xl shadow-[4px_4px_0px_#000]">
                    {feat.icon}
                  </div>
                  <h3 className="font-black text-xl tracking-tight">{feat.title}</h3>
                </div>
                <p className="font-bold text-gray-800 leading-relaxed">{feat.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="max-w-6xl mx-auto px-6 py-16">
        <h2 className="text-4xl font-black uppercase tracking-tighter mb-10 text-center">
          HOW IT WORKS
        </h2>
        <div className="flex flex-col md:flex-row items-center justify-center gap-4 md:gap-0">
          {[
            { step: "01", title: "Upload", desc: "Drop your CSV file", color: "bg-green-300" },
            { step: "02", title: "Describe", desc: "Type what you need", color: "bg-blue-300" },
            { step: "03", title: "Execute", desc: "AI builds the pipeline", color: "bg-purple-300" },
            { step: "04", title: "Deploy", desc: "One-click live API", color: "bg-yellow-300" },
          ].map((item, i) => (
            <React.Fragment key={i}>
              <div className={`${item.color} border-4 border-black shadow-[6px_6px_0px_#000] rounded-2xl p-6 w-full md:w-56 text-center hover:-translate-y-1 hover:shadow-[8px_8px_0px_#000] transition-all`}>
                <span className="font-black text-3xl">{item.step}</span>
                <h3 className="font-black text-lg uppercase mt-2">{item.title}</h3>
                <p className="font-bold text-sm text-gray-700 mt-1">{item.desc}</p>
              </div>
              {i < 3 && (
                <ChevronRight size={32} strokeWidth={4} className="hidden md:block shrink-0 mx-2 text-gray-400" />
              )}
            </React.Fragment>
          ))}
        </div>
      </section>

      {/* TECH STACK */}
      <section className="bg-black text-white border-y-4 border-black py-16">
        <div className="max-w-6xl mx-auto px-6">
          <h2 className="text-4xl font-black uppercase tracking-tighter mb-10 text-center">
            BUILT WITH
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {techStack.map((tech, i) => (
              <div
                key={i}
                className={`${tech.color} border-4 border-white rounded-xl p-4 flex items-center gap-3 hover:scale-105 transition-transform duration-200 ${tech.color.includes("black") ? "border-white" : "border-black text-black"}`}
              >
                <div className={`p-2 rounded-lg border-2 ${tech.color.includes("black") ? "border-white bg-white/10" : "border-black bg-white"}`}>
                  {tech.icon}
                </div>
                <div>
                  <h3 className="font-black text-sm uppercase">{tech.name}</h3>
                  <p className={`text-xs font-bold ${tech.color.includes("black") ? "text-gray-400" : "text-gray-700"}`}>{tech.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-6xl mx-auto px-6 py-16 text-center">
        <div className="bg-yellow-300 border-4 border-black shadow-[8px_8px_0px_#000] rounded-2xl p-10">
          <h2 className="text-3xl md:text-4xl font-black uppercase tracking-tighter mb-4">
            READY TO BUILD YOUR PIPELINE?
          </h2>
          <p className="font-bold text-lg text-gray-800 mb-8 max-w-xl mx-auto">
            Head over to the canvas and start building your first ML pipeline in seconds.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link 
              href="/canvas"
              className="bg-black text-white border-4 border-black hover:bg-gray-800 active:translate-x-1 active:translate-y-1 active:shadow-none shadow-[4px_4px_0px_#000] px-8 py-4 font-black text-lg rounded-xl transition-all uppercase"
            >
              OPEN CANVAS
            </Link>
            <Link 
              href="/contact"
              className="bg-white text-black border-4 border-black hover:bg-gray-100 active:translate-x-1 active:translate-y-1 active:shadow-none shadow-[4px_4px_0px_#000] px-8 py-4 font-black text-lg rounded-xl transition-all uppercase"
            >
              GET IN TOUCH
            </Link>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t-4 border-black bg-white py-8">
        <div className="max-w-6xl mx-auto px-6 text-center">
          <p className="font-black text-lg flex items-center justify-center gap-2">
            <Sparkles className="text-yellow-500" size={20} /> PRISM.
          </p>
          <p className="font-bold text-sm text-gray-500 mt-2">
            The AI-Powered Machine Learning Pipeline Engine.
          </p>
        </div>
      </footer>
    </div>
  );
}
