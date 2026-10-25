"use client";

import React, { useEffect, useState } from "react";
import { useAuth, UserButton } from "@clerk/nextjs";
import { Activity, Database, BrainCircuit, Trash2, AlertCircle, Zap, Home, LayoutDashboard } from "lucide-react";
import Link from "next/link";
import ResultsModal from "../canvas/components/ResultsModal";
import { API_URL } from "@/lib/api";

interface PipelineHistory {
  id: string;
  dataset_name: string;
  status: string;
  task_type: string | null;
  best_model_name: string | null;
  optimization_metric: string | null;
  final_score: number | null;
  is_deployed: boolean;
  api_endpoint: string | null;
  completed_at: string | null;
}

export default function HistoryPage() {
  const { getToken } = useAuth();
  const [history, setHistory] = useState<PipelineHistory[]>([]);
  const [loading, setLoading] = useState(true);

  // 🚀 Modal State Management
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedRunDetail, setSelectedRunDetail] = useState<any>(null);
  const [isFetchingDetails, setIsFetchingDetails] = useState(false);

  const fetchHistory = async () => {
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/api/history`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setHistory(data.history || []);
      }
    } catch (err) {
      console.error("Failed to fetch history:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  const handleDelete = async (runId: string) => {
    if (!confirm("Are you sure you want to delete this pipeline run? This will disable any active APIs.")) return;
    
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/api/history/${runId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      
      if (res.ok) {
        setHistory(history.filter(run => run.id !== runId));
      } else {
        alert("Failed to delete run.");
      }
    } catch (err) {
      console.error("Deletion error:", err);
    }
  };

  // 🚀 Fetch Full Details and Open Modal
  const handleOpenResults = async (runId: string) => {
    setIsFetchingDetails(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/api/history/${runId}/details`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setSelectedRunDetail(data);
        setIsModalOpen(true);
      } else {
        alert("Failed to load run details.");
      }
    } catch (err) {
      console.error("Failed to fetch run details:", err);
      alert("Error loading run details.");
    } finally {
      setIsFetchingDetails(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#fdfaf5] text-black font-sans selection:bg-yellow-300 selection:text-black flex flex-col">
      {/* 🟢 TOP NAVIGATION BAR */}
      <nav className="h-16 lg:h-20 border-b-4 border-black bg-white flex items-center justify-between px-4 lg:px-8 sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-yellow-300 border-4 border-black shadow-[2px_2px_0px_#000] flex items-center justify-center text-black">
            <Activity size={24} strokeWidth={3} />
          </div>
          <h1 className="text-xl lg:text-2xl font-black uppercase tracking-tight text-black">Project Prism</h1>
        </div>
        
        <div className="flex items-center gap-4">
          <Link href="/canvas" className="px-4 py-2 bg-white border-4 border-black text-black shadow-[4px_4px_0px_#000] font-black uppercase text-sm hover:bg-yellow-300 hover:translate-x-1 hover:translate-y-1 hover:shadow-none transition-all flex items-center gap-2">
            <Home size={18} /> Studio
          </Link>
          <div className="border-4 border-black shadow-[4px_4px_0px_#000] rounded-full">
            <UserButton appearance={{ elements: { avatarBox: "w-10 h-10" } }} />
          </div>
        </div>
      </nav>

      {/* 🟢 MAIN DASHBOARD AREA */}
      <main className="flex-1 p-6 lg:p-10 max-w-7xl mx-auto w-full">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h2 className="text-4xl font-black uppercase mb-2 text-black">Command Center</h2>
            <p className="text-gray-500 font-bold uppercase tracking-wider text-sm">Manage your deployed models and training history.</p>
          </div>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Activity size={48} className="animate-spin text-yellow-500 mb-4" />
            <p className="font-black uppercase text-gray-500">Loading History...</p>
          </div>
        ) : history.length === 0 ? (
          <div className="border-4 border-dashed border-gray-300 rounded-3xl p-16 flex flex-col items-center justify-center text-center bg-white">
            <BrainCircuit size={64} className="text-gray-300 mb-4" />
            <h3 className="text-2xl font-black uppercase text-gray-400 mb-2">No Pipelines Found</h3>
            <p className="text-gray-500 font-bold max-w-md">You haven't trained any models yet. Head over to the Studio to build your first pipeline.</p>
            <Link href="/canvas" className="mt-6 px-6 py-3 bg-yellow-300 text-black border-4 border-black shadow-[4px_4px_0px_#000] font-black uppercase hover:bg-yellow-400 transition-all active:translate-x-1 active:translate-y-1 active:shadow-none flex items-center gap-2">
              <Activity size={20} /> Open Studio
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {history.map((run) => (
              <div key={run.id} className="bg-white border-4 border-black rounded-2xl p-5 shadow-[8px_8px_0px_#000] flex flex-col relative group hover:-translate-y-1 transition-transform">
                
                {/* Status Badges */}
                <div className="flex justify-between items-start mb-4">
                  <span className="font-mono text-xs font-black text-black bg-gray-200 border-2 border-black px-2 py-1 rounded">
                    ID: {run.id.substring(0,8)}
                  </span>
                  {run.status === "success" ? (
                    <span className="bg-green-300 text-black border-2 border-black px-2 py-1 rounded text-[10px] font-black uppercase">Success</span>
                  ) : run.status === "failed" ? (
                    <span className="bg-red-300 text-black border-2 border-black px-2 py-1 rounded text-[10px] font-black uppercase flex items-center gap-1"><AlertCircle size={12}/> Failed</span>
                  ) : (
                    <span className="bg-blue-300 text-black border-2 border-black px-2 py-1 rounded text-[10px] font-black uppercase animate-pulse">Running</span>
                  )}
                </div>

                {/* Details */}
                <div className="mb-4">
                  <h3 className="font-black text-lg text-black uppercase mb-1 flex items-center gap-2 truncate">
                    <Database size={18} className="text-gray-400 shrink-0"/> 
                    {run.dataset_name}
                  </h3>
                  
                  {run.best_model_name && (
                    <div className="mt-3 p-3 bg-gray-50 border-2 border-black rounded-xl">
                      <p className="font-black text-sm text-black uppercase flex items-center gap-2 mb-1"><BrainCircuit size={14}/> {run.best_model_name}</p>
                      <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                        {run.task_type} | {run.optimization_metric?.toUpperCase()}: {run.final_score !== null ? run.final_score.toFixed(4) : "N/A"}
                      </p>
                    </div>
                  )}
                </div>

                {/* Deployment Tag */}
                {run.is_deployed && (
                  <div className="mb-4 bg-orange-100 border-2 border-orange-500 text-orange-700 px-3 py-2 rounded-lg text-xs font-black flex items-center gap-2 uppercase">
                    <Zap size={14} /> API Active
                  </div>
                )}

                {/* Footer Controls & Actions */}
                <div className="mt-auto pt-4 border-t-4 border-black flex flex-col gap-3">
                  {run.status === "success" && (
                    <button 
                      onClick={() => handleOpenResults(run.id)}
                      disabled={isFetchingDetails}
                      className="w-full py-2 bg-yellow-300 border-2 border-black font-black uppercase text-sm rounded-xl hover:bg-yellow-400 flex items-center justify-center gap-2 shadow-[2px_2px_0px_#000] active:translate-x-1 active:translate-y-1 active:shadow-none transition-all disabled:opacity-50"
                    >
                      <LayoutDashboard size={16} /> Open Dashboard
                    </button>
                  )}
                  
                  <div className="flex justify-between items-center w-full">
                    <span className="text-[10px] font-bold text-gray-400 uppercase">
                      {run.completed_at ? new Date(run.completed_at).toLocaleDateString() : 'N/A'}
                    </span>
                    <button 
                      onClick={() => handleDelete(run.id)}
                      className="p-2 border-2 border-transparent hover:border-black hover:bg-red-200 text-gray-400 hover:text-black rounded-lg transition-all"
                      title="Delete Run"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>

              </div>
            ))}
          </div>
        )}
      </main>

      {/* 🚀 THE RESULTS MODAL INJECTION 🚀 */}
      <ResultsModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        pipelineResult={selectedRunDetail} 
      />
    </div>
  );
}