"use client";

import React, { useCallback, useState, useEffect, useRef } from "react";
import { UserButton, useAuth } from "@clerk/nextjs";
import Link from "next/link";
import {
  ReactFlow, Background, Controls, MiniMap, useNodesState, useEdgesState,
  Handle, Position, ReactFlowProvider, useReactFlow, BaseEdge, getBezierPath, addEdge
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { ArrowLeft, Sparkles, BrainCircuit, Database, BarChart3, Settings, Bot, Loader2, UploadCloud, X, GripVertical } from "lucide-react";

import UploadModal from "./components/UploadModal";
import ResultsModal from "./components/ResultsModal";

const NeoEdge = ({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition, style, markerEnd }: any) => {
  const [edgePath] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
  return <BaseEdge path={edgePath} markerEnd={markerEnd} style={style} />;
};

const NeoNode = ({ data, id }: { data: any, id: string }) => {
  const { setNodes } = useReactFlow();

  // Function to let users manually update parameters inside the node
  const updateParam = (key: string, value: string) => {
    setNodes((nds) =>
      nds.map((n: any) => {
        if (n.id === id) {
          return { 
            ...n, 
            data: { 
              ...n.data, 
              config: { ...(n.data.config || {}), [key]: value } 
            } 
          };
        }
        return n;
      })
    );
  };

  return (
    <div className="border-4 border-black shadow-[6px_6px_0px_#000] rounded-xl p-4 min-w-[260px] bg-white transition-all duration-200 hover:-translate-y-1 hover:shadow-[8px_8px_0px_#000]">
      <Handle type="target" position={Position.Left} className="w-5 h-5 border-4 border-black bg-white -ml-2.5 z-10" />
      
      <div className="flex items-center gap-3 mb-3 border-b-2 border-gray-200 pb-2">
        <div className={`p-2 rounded-lg border-2 border-black ${data.colorClass}`}>
           {data.icon}
        </div>
        <h3 className="font-black text-lg uppercase tracking-tight">{data.label}</h3>
      </div>
      
      {/* THIS IS THE TAG THAT WAS DUPLICATED! Just one here now. */}
      <p className="text-sm font-bold text-gray-600 mb-3 truncate">
        {data.description}
      </p>

      {/* Manual Configuration Inputs for ALL Nodes */}
      <div className="flex flex-col gap-2">
        {data.action_type === 'fix_csv' && (
          <input 
            type="text" 
            placeholder="Delimiter (e.g., , or ;)" 
            onChange={(e) => updateParam('delimiter', e.target.value)}
            className="w-full text-xs font-bold border-2 border-black rounded p-1.5 focus:outline-none focus:bg-red-100"
          />
        )}
        {data.action_type === 'clean_data' && (
          <input 
            type="text" 
            placeholder="Drop Nulls? (true/false)" 
            onChange={(e) => updateParam('drop_nulls', e.target.value)}
            className="w-full text-xs font-bold border-2 border-black rounded p-1.5 focus:outline-none focus:bg-blue-100"
          />
        )}
        {data.action_type === 'feature_engineer' && (
          <input 
            type="text" 
            placeholder="Target Column (REQUIRED for AI)" 
            onChange={(e) => updateParam('target_column', e.target.value)}
            className="w-full text-xs font-bold border-2 border-black rounded p-1.5 focus:outline-none focus:bg-orange-100"
          />
        )}
        {data.action_type === 'train_model' && (
          <input 
            type="text" 
            placeholder="Model (e.g., xgboost, auto)" 
            onChange={(e) => updateParam('model_type', e.target.value)}
            className="w-full text-xs font-bold border-2 border-black rounded p-1.5 focus:outline-none focus:bg-purple-100"
          />
        )}
        {data.action_type === 'generate_plot' && (
          <input 
            type="text" 
            placeholder="Columns (e.g., price, size) or blank" 
            onChange={(e) => updateParam('columns', e.target.value)}
            className="w-full text-xs font-bold border-2 border-black rounded p-1.5 focus:outline-none focus:bg-pink-100"
          />
        )}
      </div>

      <Handle type="source" position={Position.Right} className="w-5 h-5 border-4 border-black bg-white -mr-2.5 z-10" />
    </div>
  );
};
    
  
const nodeTypes: any = { neoNode: NeoNode };
const edgeTypes: any = { neoEdge: NeoEdge };

interface DatasetRecord {
  id: string;
  file_name: string;
}

function CanvasBoard() {
  const { fitView, screenToFlowPosition } = useReactFlow();
  const { getToken } = useAuth();
 const reactFlowWrapper = useRef<HTMLDivElement>(null);
  
  const [nodes, setNodes, onNodesChange] = useNodesState<any>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<any>([]);
  const [selectedNode, setSelectedNode] = useState<any>(null);
  const [pipelineResult, setPipelineResult] = useState<any>(null);
  
  // THE FIX: Expecting objects with IDs and filenames from Postgres
  const [availableDatasets, setAvailableDatasets] = useState<DatasetRecord[]>([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState<string>("");
  
  const [aiPrompt, setAiPrompt] = useState<string>("");
  const [isThinking, setIsThinking] = useState(false);
  
  const [isUploadModalOpen, setIsUploadModalOpen] = useState<boolean>(false);
  const [isResultsPanelOpen, setIsResultsPanelOpen] = useState<boolean>(false);

  // Fetching Data
  const fetchDatasets = useCallback(async () => {
    try {
      const token = await getToken();
      if (!token) return;
      const response = await fetch("http://localhost:8000/api/datasets", { headers: { "Authorization": `Bearer ${token}` } });
      if (response.ok) {
        const data = await response.json();
        // Set the structured array directly
        setAvailableDatasets(Array.isArray(data.datasets) ? data.datasets : []);
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
      if (n.action_type === 'fix_csv') { color = 'bg-red-300'; icon = <Settings size={20} />; uiLabel = "Fix CSV"; }
      if (n.action_type === 'feature_engineer') { color = 'bg-orange-300'; icon = <Bot size={20} />; uiLabel = "Feature Eng"; }

      newNodes.push({
        id: n.node_id, type: 'neoNode', position: { x: 100 + (index * 320), y: 250 }, 
        data: { label: n.parameters.ui_label || uiLabel, description: n.parameters.description || 'AI Configured', action_type: n.action_type, colorClass: color, icon: icon, config: n.parameters }
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
    if (!selectedDatasetId) { alert("⚠️ Please select a dataset first!"); return; }
    if (!aiPrompt) { alert("⚠️ Please tell the AI what you want to do!"); return; }

    setIsThinking(true); setIsResultsPanelOpen(false); setNodes([]); setEdges([]); setSelectedNode(null);

    try {
      const token = await getToken();
      const formData = new FormData();
      
      // THE FIX: Pass dataset_id specifically to match the new backend schema
      formData.append("dataset_id", selectedDatasetId);
      formData.append("prompt", aiPrompt);

      const response = await fetch("http://localhost:8000/api/run-pipeline", { method: "POST", headers: { "Authorization": `Bearer ${token}` }, body: formData });
      
      if (response.ok) {
        const data = await response.json();
        
        if (data.dag_structure) autoDrawGraph(data.dag_structure);
        
        if (data.execution_results) {
            if (data.execution_results.status === "error" || data.execution_results.status === "warning") {
                alert(`🛑 AI Engine Interrupted:\n${data.execution_results.message}`);
                return; 
            }

            if (data.execution_results.results) {
                const rawResults = data.execution_results.results;
const rawCharts = Array.isArray(rawResults.charts) ? rawResults.charts : [];
const safeCharts = rawCharts.map((c: any, i: number) => {
    let safeTitle = `Chart ${i + 1}`;
    if (typeof c.title === 'string' && c.title) safeTitle = c.title;
    else if (c.title && typeof c.title.text === 'string' && c.title.text) safeTitle = c.title.text;
    return { title: safeTitle, echarts_payload: c.echarts_payload || c };
});
                
                // Inside handleAIGenerate in page.tsx


// 👇 THIS IS THE CRITICAL FIX 👇
setPipelineResult({
    best_model: rawResults.best_model,
    loss: rawResults.loss,
    optimization_metric: rawResults.optimization_metric,
    charts: safeCharts,
    hasModel: !!rawResults.best_model,
});
setIsResultsPanelOpen(true);
                setIsResultsPanelOpen(true); 
            } else {
                alert("⚠️ The pipeline finished, but returned empty results.");
            }
        }
      } else {
        const errorData = await response.json(); alert(`❌ AI Engine Error: ${errorData.detail}`);
      }
    } catch (error) { alert("❌ CRITICAL: Could not connect to the ML Engine."); } finally { setIsThinking(false); }
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-[#fdfaf5] text-black font-sans overflow-hidden">
      
      {isThinking && (
        <div className="absolute inset-0 z-[9999] bg-[#fdfaf5]/90 backdrop-blur-md flex flex-col items-center justify-center overflow-hidden">
          <div className="absolute w-64 h-64 bg-yellow-300 border-8 border-black rounded-full mix-blend-multiply animate-[ping_3s_ease-in-out_infinite] opacity-50 -ml-32"></div>
          <div className="absolute w-72 h-72 bg-purple-400 border-8 border-black mix-blend-multiply animate-[spin_4s_linear_infinite] opacity-50 ml-32 rotate-12"></div>
          <div className="absolute w-48 h-48 bg-pink-400 border-8 border-black rounded-3xl mix-blend-multiply animate-[bounce_2s_infinite] opacity-50 mt-48"></div>

          <div className="z-10 bg-white border-8 border-black p-8 rounded-2xl shadow-[12px_12px_0px_#000] flex flex-col items-center max-w-md text-center">
            <Bot size={80} strokeWidth={1.5} className="mb-6 animate-pulse text-black" />
            <h2 className="text-4xl font-black uppercase tracking-tighter mb-2">Processing...</h2>
            <p className="font-bold text-lg text-gray-700 bg-gray-100 border-4 border-black p-3 rounded-lg shadow-[4px_4px_0px_#000]">
              Llama 3 is verifying your connections, formatting the DAG, and executing the matrix.
            </p>
          </div>
        </div>
      )}

      <UploadModal 
        isOpen={isUploadModalOpen} 
        onClose={() => setIsUploadModalOpen(false)} 
        onSuccess={() => { setIsUploadModalOpen(false); fetchDatasets(); }} 
      />

      <header className="h-20 border-b-4 border-black bg-white flex items-center justify-between px-6 z-10 shadow-[0px_4px_0px_#000] shrink-0">
        <div className="flex items-center gap-4">
          <Link href="/">
            <button type="button" className="p-2 border-2 border-black bg-gray-100 hover:bg-gray-200 shadow-[2px_2px_0px_#000] active:translate-x-1 active:translate-y-1 active:shadow-none transition-all rounded-md">
              <ArrowLeft size={24} strokeWidth={3} />
            </button>
          </Link>
          <h1 className="font-black text-2xl tracking-tighter hidden md:block">AI PIPELINE ENGINE</h1>
        </div>
        <UserButton />
      </header>

      <main className="flex-1 w-full relative flex overflow-hidden">
        
        {pipelineResult && !isThinking && !isResultsPanelOpen && !isUploadModalOpen && (
          <button type="button"
            onClick={() => setIsResultsPanelOpen(true)}
            className="absolute top-6 right-6 z-30 bg-yellow-300 hover:bg-yellow-400 border-4 border-black px-6 py-3 rounded-xl shadow-[6px_6px_0px_#000] active:translate-x-1 active:translate-y-1 active:shadow-none transition-all flex items-center gap-3 font-black uppercase text-sm"
          >
            <BarChart3 size={20} />
            Open Analysis
          </button>
        )}

        <div className="flex-1 relative pb-32"> 
          {nodes.length === 0 && !isThinking && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400 pointer-events-none z-10">
              <Bot size={80} className="mb-4 opacity-50" />
              <h2 className="text-2xl font-black">Waiting for instructions...</h2>
              <p className="font-bold">Drag tools from the left, or prompt the AI below.</p>
            </div>
          )}

          <ReactFlow
            nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} 
            onConnect={onConnect} 
            onDrop={onDrop}
            onDragOver={onDragOver}
            onNodeClick={(event: any, node: any) => setSelectedNode(node)} 
            onPaneClick={() => setSelectedNode(null)} 
            nodeTypes={nodeTypes} edgeTypes={edgeTypes} fitView
            nodesDraggable={true} 
            nodesConnectable={true} 
          >
            <Background color="#000" gap={24} size={2} />
            <Controls className="border-2 border-black shadow-[4px_4px_0px_#000] rounded-lg bg-white overflow-hidden [&>button]:border-black [&>button]:text-black" />
            <MiniMap className="border-4 border-black shadow-[4px_4px_0px_#000] rounded-xl bg-white" nodeColor="#000" maskColor="rgba(0,0,0,0.1)" />
          </ReactFlow>

          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-full max-w-4xl z-20 px-4">
            <div className="bg-white border-4 border-black shadow-[8px_8px_0px_#000] rounded-2xl p-3 flex flex-col md:flex-row gap-3 items-center">
              
              <div className="w-full md:w-72 shrink-0 flex gap-2 items-center">
                <select 
                  value={selectedDatasetId}
                  onChange={(e) => setSelectedDatasetId(e.target.value)}
                  className="flex-1 min-w-0 w-full border-4 border-black rounded-xl p-3 font-bold bg-gray-100 focus:ring-4 focus:ring-purple-300 outline-none cursor-pointer text-sm truncate"
                >
                  <option value="" disabled>
                    {availableDatasets.length === 0 ? "⚠️ No Hosted Files" : "1. Choose Target Dataset"}
                  </option>
                  {availableDatasets.map((dataset) => (
                    // THE FIX: Value is ID, Display is File Name
                    <option key={dataset.id} value={dataset.id}>📄 {dataset.file_name}</option>
                  ))}
                </select>
                
                <button 
                type="button"
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
                placeholder="2. Auto-build with AI, or click Run if manually connected..." 
                className="flex-1 min-w-0 w-full border-4 border-black rounded-xl p-3 font-bold focus:ring-4 focus:ring-purple-300 outline-none text-sm" 
                onKeyDown={(e) => e.key === 'Enter' && handleAIGenerate()}
              />

              <button 
                type="button"
                onClick={handleAIGenerate}
                className="shrink-0 w-full md:w-auto flex items-center justify-center gap-2 border-4 border-black bg-purple-400 hover:bg-purple-500 shadow-[4px_4px_0px_#000] active:translate-x-1 active:translate-y-1 active:shadow-none transition-all px-8 py-3 rounded-xl font-black text-white"
              >
                <Sparkles fill="white" size={20} />
                RUN / GEN
              </button>
            </div>
          </div>
        </div>

        <ResultsModal 
          isOpen={isResultsPanelOpen} 
          onClose={() => setIsResultsPanelOpen(false)} 
          pipelineResult={pipelineResult} 
        />

        <div 
          className={`h-full bg-white border-l-4 border-black transition-all duration-300 ease-in-out z-20 relative ${selectedNode ? "w-80 translate-x-0" : "w-0 translate-x-full border-l-0"}`}
        >
          {selectedNode && (
            <div className="p-6 h-full flex flex-col overflow-y-auto w-80">
              <div className="flex items-center justify-between mb-8 border-b-4 border-black pb-4">
                <h2 className="text-xl font-black flex items-center gap-2"><Settings size={24} /> Inspector</h2>
                <button type="button" onClick={() => setSelectedNode(null)} className="p-1 border-2 border-black rounded-md hover:bg-red-200 transition-all shadow-[2px_2px_0px_#000] active:shadow-none active:translate-x-1 active:translate-y-1">
                  <X size={20} strokeWidth={3} />
                </button>
              </div>

              <div className="bg-gray-100 border-4 border-black rounded-xl p-4 shadow-[4px_4px_0px_#000] mb-6">
                <p className="font-bold text-sm text-gray-500 mb-2">Node Type</p>
                <p className="font-black text-lg uppercase">{selectedNode.data.label}</p>
              </div>

              <div className="flex flex-col gap-4">
                <p className="font-black text-md border-b-2 border-gray-200 pb-2">Active Configuration:</p>
                
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