"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, Sparkles, Mail, Send, MapPin, Code,
  Globe, MessageSquare, Clock, CheckCircle2, Bot,
  Loader2, AlertCircle,
} from "lucide-react";

// ============================================================
// CONFIGURATION
// Replace this with your real Web3Forms access key.
// Get one free at: https://web3forms.com (enter bhavyadoriya2007@gmail.com)
// ============================================================
const WEB3FORMS_ACCESS_KEY = process.env.NEXT_PUBLIC_WEB3FORMS_KEY || "";

type FormStatus = "idle" | "sending" | "success" | "error";

export default function ContactPage() {
  const [formData, setFormData] = useState({ name: "", email: "", subject: "", message: "" });
  const [status, setStatus] = useState<FormStatus>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const updateField = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("sending");
    setErrorMessage("");

    try {
      const response = await fetch("https://api.web3forms.com/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          access_key: WEB3FORMS_ACCESS_KEY,
          name: formData.name,
          email: formData.email,
          subject: formData.subject || "Project Prism Inquiry",
          message: formData.message,
          from_name: "Project Prism Contact Form",
        }),
      });

      const result = await response.json();

      if (result.success) {
        setStatus("success");
        setFormData({ name: "", email: "", subject: "", message: "" });
        setTimeout(() => setStatus("idle"), 5000);
      } else {
        setStatus("error");
        setErrorMessage(result.message || "Something went wrong. Please try again.");
      }
    } catch {
      setStatus("error");
      setErrorMessage("Network error. Please check your connection and try again.");
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#fdfaf5] text-black font-[family-name:var(--font-geist-sans)]">

      {/* HERO HEADER */}
      <header className="border-b-4 border-black bg-pink-400 relative overflow-hidden">
        <div className="absolute top-10 right-10 opacity-10 pointer-events-none -rotate-12">
          <MessageSquare size={280} strokeWidth={1} />
        </div>
        <div className="absolute bottom-5 left-16 opacity-10 pointer-events-none rotate-6">
          <Mail size={180} strokeWidth={1} />
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
            <Mail size={14} /> Get In Touch
          </div>

          <h1 className="text-5xl md:text-7xl font-black uppercase tracking-tighter text-white drop-shadow-[4px_4px_0px_#000] leading-none mb-6">
            LET&apos;S
            <br />
            CONNECT.
          </h1>

          <p className="font-bold text-lg md:text-xl text-black max-w-2xl leading-relaxed">
            Have a question, feedback, or want to collaborate? We&apos;d love to hear from you. Reach out and let&apos;s build something amazing together.
          </p>
        </div>
      </header>

      {/* MAIN CONTENT */}
      <section className="max-w-6xl mx-auto px-6 py-16">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-10">

          {/* LEFT: Contact Info Cards */}
          <div className="lg:col-span-2 flex flex-col gap-6">

            {/* Email Card */}
            <div className="bg-yellow-300 border-4 border-black shadow-[8px_8px_0px_#000] rounded-2xl p-6 hover:-translate-y-1 hover:shadow-[10px_10px_0px_#000] transition-all">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-3 bg-white border-4 border-black rounded-xl shadow-[4px_4px_0px_#000]">
                  <Mail size={24} />
                </div>
                <h3 className="font-black text-xl uppercase">EMAIL</h3>
              </div>
              <a
                href="mailto:bhavyadoriya2007@gmail.com"
                className="font-bold text-sm break-all hover:underline underline-offset-4"
              >
                bhavyadoriya2007@gmail.com
              </a>
              <p className="font-bold text-xs text-gray-700 mt-2">
                Primary contact for all inquiries.
              </p>
            </div>

            {/* Response Time Card */}
            <div className="bg-green-300 border-4 border-black shadow-[8px_8px_0px_#000] rounded-2xl p-6 hover:-translate-y-1 hover:shadow-[10px_10px_0px_#000] transition-all">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-3 bg-white border-4 border-black rounded-xl shadow-[4px_4px_0px_#000]">
                  <Clock size={24} />
                </div>
                <h3 className="font-black text-xl uppercase">RESPONSE TIME</h3>
              </div>
              <p className="font-bold text-gray-800">
                We typically respond within <span className="bg-white border-2 border-black px-2 py-0.5 rounded font-black">24–48 hours</span>.
              </p>
            </div>

            {/* Location Card */}
            <div className="bg-blue-200 border-4 border-black shadow-[8px_8px_0px_#000] rounded-2xl p-6 hover:-translate-y-1 hover:shadow-[10px_10px_0px_#000] transition-all">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-3 bg-white border-4 border-black rounded-xl shadow-[4px_4px_0px_#000]">
                  <MapPin size={24} />
                </div>
                <h3 className="font-black text-xl uppercase">LOCATION</h3>
              </div>
              <p className="font-bold text-gray-800">India 🇮🇳</p>
              <p className="font-bold text-xs text-gray-600 mt-1">Available for remote collaboration worldwide.</p>
            </div>

            {/* Social Links */}
            <div className="bg-purple-200 border-4 border-black shadow-[8px_8px_0px_#000] rounded-2xl p-6 hover:-translate-y-1 hover:shadow-[10px_10px_0px_#000] transition-all">
              <h3 className="font-black text-xl uppercase mb-4">CONNECT</h3>
              <div className="flex gap-3">
                <a href="https://github.com/BhavyaDoriya" target="_blank" rel="noopener noreferrer" className="p-3 bg-white border-4 border-black rounded-xl shadow-[4px_4px_0px_#000] hover:bg-gray-100 active:translate-x-1 active:translate-y-1 active:shadow-none transition-all">
                  <Code size={24} />
                </a>
                <a href="https://linkedin.com" target="_blank" rel="noopener noreferrer" className="p-3 bg-white border-4 border-black rounded-xl shadow-[4px_4px_0px_#000] hover:bg-gray-100 active:translate-x-1 active:translate-y-1 active:shadow-none transition-all">
                  <Globe size={24} />
                </a>
                <a href="mailto:bhavyadoriya2007@gmail.com" className="p-3 bg-white border-4 border-black rounded-xl shadow-[4px_4px_0px_#000] hover:bg-gray-100 active:translate-x-1 active:translate-y-1 active:shadow-none transition-all">
                  <Mail size={24} />
                </a>
              </div>
            </div>
          </div>

          {/* RIGHT: Contact Form */}
          <div className="lg:col-span-3">
            <div className="bg-white border-4 border-black shadow-[8px_8px_0px_#000] rounded-2xl p-8 relative">

              {/* Decorative Bot */}
              <div className="absolute -top-6 -right-6 bg-yellow-300 border-4 border-black rounded-full p-3 shadow-[4px_4px_0px_#000] hidden md:block">
                <Bot size={28} />
              </div>

              <h2 className="text-3xl font-black uppercase tracking-tighter mb-2">
                SEND A MESSAGE
              </h2>
              <p className="font-bold text-gray-500 mb-8 border-l-4 border-pink-400 pl-3">
                Fill out the form and we&apos;ll get back to you as soon as possible.
              </p>

              {/* Success Banner */}
              {status === "success" && (
                <div className="mb-6 p-4 bg-green-300 border-4 border-black rounded-xl font-black flex items-center gap-3 shadow-[4px_4px_0px_#000]">
                  <CheckCircle2 size={24} />
                  Message sent successfully! We&apos;ll get back to you soon.
                </div>
              )}

              {/* Error Banner */}
              {status === "error" && (
                <div className="mb-6 p-4 bg-red-300 border-4 border-black rounded-xl font-black flex items-center gap-3 shadow-[4px_4px_0px_#000]">
                  <AlertCircle size={24} />
                  {errorMessage}
                </div>
              )}

              <form onSubmit={handleSubmit} className="flex flex-col gap-5">
                {/* Name */}
                <div>
                  <label className="font-black text-xs uppercase text-gray-500 block mb-2 tracking-wider">
                    Your Name
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => updateField("name", e.target.value)}
                    placeholder="John Doe"
                    className="w-full border-4 border-black rounded-xl p-3 font-bold focus:ring-4 focus:ring-pink-300 outline-none text-sm bg-gray-50 hover:bg-white transition-colors"
                  />
                </div>

                {/* Email */}
                <div>
                  <label className="font-black text-xs uppercase text-gray-500 block mb-2 tracking-wider">
                    Your Email
                  </label>
                  <input
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => updateField("email", e.target.value)}
                    placeholder="you@example.com"
                    className="w-full border-4 border-black rounded-xl p-3 font-bold focus:ring-4 focus:ring-pink-300 outline-none text-sm bg-gray-50 hover:bg-white transition-colors"
                  />
                </div>

                {/* Subject */}
                <div>
                  <label className="font-black text-xs uppercase text-gray-500 block mb-2 tracking-wider">
                    Subject
                  </label>
                  <select
                    value={formData.subject}
                    onChange={(e) => updateField("subject", e.target.value)}
                    className="w-full border-4 border-black rounded-xl p-3 font-bold focus:ring-4 focus:ring-pink-300 outline-none text-sm bg-gray-50 hover:bg-white transition-colors cursor-pointer"
                  >
                    <option value="">Choose a topic...</option>
                    <option value="General Inquiry">💬 General Inquiry</option>
                    <option value="Bug Report">🐛 Bug Report</option>
                    <option value="Feature Request">✨ Feature Request</option>
                    <option value="Collaboration">🤝 Collaboration</option>
                    <option value="Feedback">📝 Feedback</option>
                    <option value="Other">📌 Other</option>
                  </select>
                </div>

                {/* Message */}
                <div>
                  <label className="font-black text-xs uppercase text-gray-500 block mb-2 tracking-wider">
                    Message
                  </label>
                  <textarea
                    required
                    rows={5}
                    value={formData.message}
                    onChange={(e) => updateField("message", e.target.value)}
                    placeholder="Tell us what's on your mind..."
                    className="w-full border-4 border-black rounded-xl p-3 font-bold focus:ring-4 focus:ring-pink-300 outline-none text-sm bg-gray-50 hover:bg-white transition-colors resize-none"
                  />
                </div>

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={status === "sending"}
                  className="w-full bg-black text-white border-4 border-black hover:bg-gray-800 active:translate-x-1 active:translate-y-1 active:shadow-none shadow-[6px_6px_0px_#ccc] py-4 font-black text-lg rounded-xl transition-all uppercase flex items-center justify-center gap-3 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {status === "sending" ? (
                    <>
                      <Loader2 size={22} className="animate-spin" />
                      SENDING...
                    </>
                  ) : (
                    <>
                      <Send size={22} />
                      SEND MESSAGE
                    </>
                  )}
                </button>
              </form>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ SECTION */}
      <section className="bg-white border-y-4 border-black py-16">
        <div className="max-w-4xl mx-auto px-6">
          <h2 className="text-4xl font-black uppercase tracking-tighter mb-10 text-center">
            QUICK FAQ
          </h2>
          <div className="flex flex-col gap-4">
            {[
              { q: "Is Project Prism free to use?", a: "Yes — Prism is an open-source project built for learning and experimentation." },
              { q: "What file formats are supported?", a: "Currently, Prism supports CSV file uploads. More formats are on the roadmap." },
              { q: "Can I deploy models to production?", a: "Prism includes one-click deployment that creates a live REST API endpoint for your trained model." },
              { q: "What ML algorithms does Prism support?", a: "Prism uses FLAML AutoML which automatically selects from XGBoost, LightGBM, Random Forest, and more." },
            ].map((faq, i) => (
              <div
                key={i}
                className="border-4 border-black rounded-xl p-5 shadow-[4px_4px_0px_#000] hover:-translate-y-1 hover:shadow-[6px_6px_0px_#000] transition-all bg-gray-50"
              >
                <h3 className="font-black text-md uppercase mb-2">{faq.q}</h3>
                <p className="font-bold text-sm text-gray-600">{faq.a}</p>
              </div>
            ))}
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
