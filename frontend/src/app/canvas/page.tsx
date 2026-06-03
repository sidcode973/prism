"use client";

import React, { useCallback, useState, useEffect } from "react";
import { UserButton, useAuth } from "@clerk/nextjs";
import Link from "next/link";
import {
  ReactFlow, Background, Controls, MiniMap, useNodesState, useEdgesState,
  Handle, Position, ReactFlowProvider, useReactFlow, BaseEdge, getBezierPath
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { ArrowLeft, Sparkles, BrainCircuit, Database, BarChart3, Settings, Bot, Loader2, UploadCloud, X } from "lucide-react";

import UploadModal from "./components/UploadModal";
import ResultsSidebar from "./components/ResultsSidebar";

const NeoEdge = ({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition, style, markerEnd }: any) => {
  const [edgePath] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
  return <BaseEdge path={edgePath} markerEnd={markerEnd} style={style} />;
};

const NeoNode = ({ data }: { data: any }) => {
  return (
    <div className="border-4 border-black shadow-[6px_6px_0px_#000] rounded-xl p-4 min-w-[240px] bg-white transition-all duration-200">
      <Handle type="target" position={Position.Left} className="w-4 h-4 border-4 border-black bg-white -ml-2" />
      <div className="flex items-center gap-3 mb-3 border-b-2 border-gray-200 pb-2">
        <div className={`p-2 rounded-lg border-2 border-black ${data.colorClass}`}>
           {data.icon}
        </div>
        <h3 className="font-black text-lg">{data.label}</h3>
      </div>
      <p className="text-sm font-bold text-gray-600 bg-gray-100 p-2 border-2 border-gray-300 rounded-md truncate">
        {data.description}
      </p>
      <Handle type="source" position={Position.Right} className="w-4 h-4 border-4 border-black bg-white -mr-2" />
    </div>
  );
};

const nodeTypes: any = { neoNode: NeoNode };
const edgeTypes: any = { neoEdge: NeoEdge };

function CanvasBoard() {
  const { fitView } = useReactFlow();
  const { getToken } = useAuth();
  
  const [nodes, setNodes, onNodesChange] = useNodesState<any>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<any>([]);
  const [selectedNode, setSelectedNode] = useState<any>(null);
  const [pipelineResult, setPipelineResult] = useState<any>(null);
  const [availableDatasets, setAvailableDatasets] = useState<string[]>([]);
  
  const [selectedDataset, setSelectedDataset] = useState<string>("");
  const [aiPrompt, setAiPrompt] = useState<string>("");
  const [isThinking, setIsThinking] = useState(false);
  
  const [isUploadModalOpen, setIsUploadModalOpen] = useState<boolean>(false);
  const [isResultsPanelOpen, setIsResultsPanelOpen] = useState<boolean>(false);

  const fetchDatasets = useCallback(async () => {
    try {
      const token = await getToken();
      if (!token) return;
      const response = await fetch("http://localhost:8000/api/datasets", { headers: { "Authorization": `Bearer ${token}` } });
      if (response.ok) {
        const data = await response.json();
        setAvailableDatasets(Array.isArray(data.datasets) ? data.datasets.map((d:any) => String(d)) : []);
      }
    } catch (error) { console.error("Failed to fetch datasets"); }
  }, [getToken]);

  useEffect(() => { fetchDatasets(); }, [fetchDatasets]);

  const autoDrawGraph = (dagStructure: any) => {
    const newNodes: any[] = [];
    const newEdges: any[] = [];

    dagStructure.nodes.forEach((n: any, index: number) => {
      let color = 'bg-gray-300';
      let icon = <Settings size={20} />;
      let uiLabel = n.action_type;

      if (n.action_type === 'load_dataset') { color = 'bg-green-300'; icon = <Database size={20} />; uiLabel = "Raw Data"; }
      if (n.action_type === 'clean_data') { color = 'bg-blue-300'; icon = <Sparkles size={20} />; uiLabel = "Clean Data"; }
      if (n.action_type === 'train_model') { color = 'bg-purple-300'; icon = <BrainCircuit size={20} />; uiLabel = "Train Model"; }
      if (n.action_type === 'generate_plot') { color = 'bg-pink-300'; icon = <BarChart3 size={20} />; uiLabel = "Plot Graph"; } 

      newNodes.push({
        id: n.node_id, type: 'neoNode', position: { x: 100 + (index * 320), y: 250 }, 
        data: { label: n.parameters.ui_label || uiLabel, description: n.parameters.description || 'AI Configured', colorClass: color, icon: icon, config: n.parameters }
      });
    });

    const executionOrder = dagStructure.execution_order || [];
    for (let i = 0; i < executionOrder.length - 1; i++) {
      newEdges.push({
        id: `edge_${executionOrder[i]}_${executionOrder[i+1]}`, source: executionOrder[i], target: executionOrder[i+1], type: 'neoEdge', animated: true, style: { stroke: 'black', strokeWidth: 4 }
      });
    }

    setNodes(newNodes); setEdges(newEdges);
    setTimeout(() => fitView({ padding: 0.3, duration: 800 }), 100);
  };

  const handleAIGenerate = async () => {
    if (!selectedDataset) { alert("⚠️ Please select a dataset first!"); return; }
    if (!aiPrompt) { alert("⚠️ Please tell the AI what you want to do!"); return; }

    setIsThinking(true); setIsResultsPanelOpen(false); setNodes([]); setEdges([]); setSelectedNode(null);

    try {
      const token = await getToken();
      const formData = new FormData();
      formData.append("file_name", selectedDataset);
      formData.append("prompt", aiPrompt);

      const response = await fetch("http://localhost:8000/api/run-pipeline", { method: "POST", headers: { "Authorization": `Bearer ${token}` }, body: formData });
      
      if (response.ok) {
        const data = await response.json();
        autoDrawGraph(data.dag_structure);
        
        if (data.execution_results && data.execution_results.results) {
            const rawResults = data.execution_results.results;
            const rawCharts = Array.isArray(rawResults.charts) ? rawResults.charts : [];
            const safeCharts = rawCharts.map((c: any, i: number) => {
                let safeTitle = `Chart ${i + 1}`;
                if (typeof c.title === 'string' && c.title) safeTitle = c.title;
                else if (c.title && typeof c.title.text === 'string' && c.title.text) safeTitle = c.title.text;
                return { title: safeTitle, echarts_payload: c.echarts_payload || c };
            });
            
            setPipelineResult({
                metric: rawResults.best_model ? `Best Model: ${String(rawResults.best_model)}` : (rawResults.cleaned_data_status ? "Data Pipeline" : null),
                score: rawResults.loss !== undefined && rawResults.loss !== null ? (typeof rawResults.loss === 'number' ? rawResults.loss.toFixed(4) : String(rawResults.loss)) : (rawResults.cleaned_data_status ? "Cleaned & Normalized" : null),
                charts: safeCharts, hasModel: !!rawResults.best_model, hasCleanData: !!rawResults.cleaned_data_status
            });
            setIsResultsPanelOpen(true); 
        } else { alert("⚠️ The pipeline finished, but returned empty results."); }
      } else {
        const errorData = await response.json(); alert(`❌ AI Engine Error: ${errorData.detail}`);
      }
    } catch (error) { alert("❌ CRITICAL: Could not connect to the ML Engine."); } finally { setIsThinking(false); }
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-[#fdfaf5] text-black font-sans overflow-hidden">
      
      {/* 1. EXTRACTED UPLOAD MODAL */}
      {isThinking && (
        <div className="absolute inset-0 z-[9999] bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center">
          <Loader2 size={64} className="animate-spin text-purple-600 mb-4" />
          <h2 className="text-3xl font-black uppercase tracking-tighter">Llama 3 is thinking...</h2>
          <p className="font-bold text-gray-500 mt-2">Designing and executing your pipeline autonomously.</p>
        </div>
      )}

      <UploadModal 
        isOpen={isUploadModalOpen} 
        onClose={() => setIsUploadModalOpen(false)} 
        onSuccess={() => { setIsUploadModalOpen(false); fetchDatasets(); }} 
      />

      {/* 2. HEADER */}
      <header className="h-20 border-b-4 border-black bg-white flex items-center justify-between px-6 z-10 shadow-[0px_4px_0px_#000] shrink-0">
        <div className="flex items-center gap-4">
          <Link href="/">
            <button className="p-2 border-2 border-black bg-gray-100 hover:bg-gray-200 shadow-[2px_2px_0px_#000] active:translate-x-1 active:translate-y-1 active:shadow-none transition-all rounded-md">
              <ArrowLeft size={24} strokeWidth={3} />
            </button>
          </Link>
          <h1 className="font-black text-2xl tracking-tighter hidden md:block">AI PIPELINE ENGINE</h1>
        </div>
        <UserButton />
      </header>

      {/* 3. MAIN WORKSPACE */}
      <main className="flex-1 w-full relative flex overflow-hidden">
        
        {/* Floating Open Analysis Button */}
        {pipelineResult && !isThinking && !isResultsPanelOpen && !isUploadModalOpen && (
          <button
            onClick={() => setIsResultsPanelOpen(true)}
            className="absolute top-6 right-6 z-30 bg-yellow-300 hover:bg-yellow-400 border-4 border-black px-6 py-3 rounded-xl shadow-[6px_6px_0px_#000] active:translate-x-1 active:translate-y-1 active:shadow-none transition-all flex items-center gap-3 font-black uppercase text-sm"
          >
            <BarChart3 size={20} />
            Open Analysis
          </button>
        )}

        {/* React Flow Canvas */}
        <div className="flex-1 relative pb-32"> 
          {nodes.length === 0 && !isThinking && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400 pointer-events-none z-10">
              <Bot size={80} className="mb-4 opacity-50" />
              <h2 className="text-2xl font-black">Waiting for instructions...</h2>
              <p className="font-bold">Select a dataset and tell the AI what to build below.</p>
            </div>
          )}

          <ReactFlow
            nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} 
            onNodeClick={(event: any, node: any) => setSelectedNode(node)} 
            onPaneClick={() => setSelectedNode(null)} 
            nodeTypes={nodeTypes} edgeTypes={edgeTypes} fitView
            nodesDraggable={false} 
            nodesConnectable={false} 
          >
            <Background color="#000" gap={24} size={2} />
            <Controls className="border-2 border-black shadow-[4px_4px_0px_#000] rounded-lg bg-white overflow-hidden [&>button]:border-black [&>button]:text-black" />
            <MiniMap className="border-4 border-black shadow-[4px_4px_0px_#000] rounded-xl bg-white" nodeColor="#000" maskColor="rgba(0,0,0,0.1)" />
          </ReactFlow>

          {/* AI Prompt Bar - THE FIX: Using shrink-0 and min-w-0 blocks flexbox from squishing elements */}
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-full max-w-4xl z-20 px-4">
            <div className="bg-white border-4 border-black shadow-[8px_8px_0px_#000] rounded-2xl p-3 flex flex-col md:flex-row gap-3 items-center">
              
              <div className="w-full md:w-72 shrink-0 flex gap-2 items-center">
                <select 
                  value={selectedDataset}
                  onChange={(e) => setSelectedDataset(e.target.value)}
                  className="flex-1 min-w-0 w-full border-4 border-black rounded-xl p-3 font-bold bg-gray-100 focus:ring-4 focus:ring-purple-300 outline-none cursor-pointer text-sm truncate"
                >
                  <option value="" disabled>
                    {availableDatasets.length === 0 ? "⚠️ No Hosted Files" : "1. Choose Target Dataset"}
                  </option>
                  {availableDatasets.map((fileName) => (
                    <option key={fileName} value={fileName}>📄 {fileName}</option>
                  ))}
                </select>
                
                <button 
                  onClick={() => setIsUploadModalOpen(true)}
                  title="Upload New Data"
                  className="w-[52px] h-[52px] shrink-0 flex items-center justify-center bg-purple-400 hover:bg-purple-500 border-4 border-black rounded-xl shadow-[4px_4px_0px_#000] active:translate-x-1 active:translate-y-1 active:shadow-none transition-all text-white"
                >
                  <UploadCloud size={24} strokeWidth={3} />
                </button>
              </div>

              <input 
                type="text" 
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder="2. E.g. Run structural cleaning and build a predictive model..." 
                className="flex-1 min-w-0 w-full border-4 border-black rounded-xl p-3 font-bold focus:ring-4 focus:ring-purple-300 outline-none text-sm" 
                onKeyDown={(e) => e.key === 'Enter' && handleAIGenerate()}
              />

              <button 
                onClick={handleAIGenerate}
                className="shrink-0 w-full md:w-auto flex items-center justify-center gap-2 border-4 border-black bg-purple-400 hover:bg-purple-500 shadow-[4px_4px_0px_#000] active:translate-x-1 active:translate-y-1 active:shadow-none transition-all px-8 py-3 rounded-xl font-black text-white"
              >
                <Sparkles fill="white" size={20} />
                GENERATE
              </button>

            </div>
          </div>
        </div>

        {/* ---> RESULTS SIDEBAR COMPONENT <--- */}
        <ResultsSidebar 
          isOpen={isResultsPanelOpen} 
          onClose={() => setIsResultsPanelOpen(false)} 
          pipelineResult={pipelineResult} 
        />

        {/* Slide-out Parameter Inspector Panel */}
        <div 
          className={`h-full bg-white border-l-4 border-black transition-all duration-300 ease-in-out z-20 relative ${selectedNode ? "w-80 translate-x-0" : "w-0 translate-x-full border-l-0"}`}
        >
          {selectedNode && (
            <div className="p-6 h-full flex flex-col overflow-y-auto">
              <div className="flex items-center justify-between mb-8 border-b-4 border-black pb-4">
                <h2 className="text-xl font-black flex items-center gap-2"><Bot size={24} /> AI Decision</h2>
                <button onClick={() => setSelectedNode(null)} className="p-1 border-2 border-black rounded-md hover:bg-red-200 transition-all shadow-[2px_2px_0px_#000] active:shadow-none active:translate-x-1 active:translate-y-1">
                  <X size={20} strokeWidth={3} />
                </button>
              </div>

              <div className="bg-gray-100 border-4 border-black rounded-xl p-4 shadow-[4px_4px_0px_#000] mb-6">
                <p className="font-bold text-sm text-gray-500 mb-2">Node Type</p>
                <p className="font-black text-lg uppercase">{selectedNode.data.label}</p>
              </div>

              <div className="flex flex-col gap-4">
                <p className="font-black text-md border-b-2 border-gray-200 pb-2">Parameters Configured by Llama 3:</p>
                
                {Object.entries(selectedNode.data.config || {}).map(([key, value]: any) => (
                  <div key={key}>
                    <label className="font-bold text-sm text-gray-500 block mb-1 uppercase">{key}</label>
                    <input 
                      type="text" 
                      readOnly 
                      value={typeof value === 'object' ? JSON.stringify(value) : value} 
                      className="w-full border-2 border-gray-300 bg-gray-50 rounded-lg p-2 font-bold text-gray-700 cursor-not-allowed text-xs" 
                    />
                  </div>
                ))}
                {Object.keys(selectedNode.data.config || {}).length === 0 && (
                  <p className="text-sm font-bold text-gray-400 italic">No specific parameters configured.</p>
                )}
              </div>
            </div>
          )}
        </div>

      </main>
    </div>
  );
}

export default function CanvasPage() {
  return (
    <ReactFlowProvider>
      <CanvasBoard />
    </ReactFlowProvider>
  );
}