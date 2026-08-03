"use client";

import React, { useCallback, useState, useEffect, useRef } from "react";
import { UserButton, useAuth } from "@clerk/nextjs";
import Link from "next/link";
import {
  ReactFlow, Background, Controls, MiniMap, useNodesState, useEdgesState,
  Handle, Position, ReactFlowProvider, useReactFlow, BaseEdge, getBezierPath, addEdge
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { ArrowLeft, Sparkles, BrainCircuit, Database, BarChart3, Settings, Bot, UploadCloud, X, GripVertical, ChevronLeft, ChevronRight, Trash2, Eraser } from "lucide-react";

import UploadModal from "./components/UploadModal";
import ResultsModal from "./components/ResultsModal";

const NeoEdge = ({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition, style, markerEnd }: any) => {
  const [edgePath] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
  return <BaseEdge path={edgePath} markerEnd={markerEnd} style={style} />;
};

const NeoNode = ({ data, id }: { data: any, id: string }) => {
  return (
    <div className="border-4 border-black shadow-[6px_6px_0px_#000] rounded-xl p-4 min-w-[220px] bg-white transition-all duration-200 hover:-translate-y-1 hover:shadow-[8px_8px_0px_#000] relative">
      <Handle 
        type="target" 
        position={Position.Left} 
        className="!w-6 !h-6 !bg-blue-200 border-4 border-black rounded-full -ml-3 z-10 cursor-crosshair shadow-[2px_2px_0px_#000]" 
      />
      
      <div className="flex items-center gap-3 mb-2 border-b-2 border-gray-200 pb-2">
        <div className={`p-2 rounded-lg border-2 border-black ${data.colorClass}`}>
           {data.icon}
        </div>
        <h3 className="font-black text-lg uppercase tracking-tight">{data.label}</h3>
      </div>
      
      <p className="text-xs font-bold text-gray-500 uppercase truncate">
        {data.description}
      </p>

      <Handle 
        type="source" 
        position={Position.Right} 
        className="!w-6 !h-6 !bg-yellow-300 border-4 border-black rounded-full -mr-3 z-10 cursor-crosshair shadow-[2px_2px_0px_#000]" 
      />
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
  
  const [availableDatasets, setAvailableDatasets] = useState<DatasetRecord[]>([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState<string>("");
  
  const [aiPrompt, setAiPrompt] = useState<string>("");
  const [isThinking, setIsThinking] = useState(false);
  const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState(true); 
  
  const [isUploadModalOpen, setIsUploadModalOpen] = useState<boolean>(false);
  const [isResultsPanelOpen, setIsResultsPanelOpen] = useState<boolean>(false);

  const [isIdle, setIsIdle] = useState(false);

  useEffect(() => {
    let timeout: NodeJS.Timeout;
    const resetIdleTimer = () => {
      setIsIdle(false);
      clearTimeout(timeout);
      timeout = setTimeout(() => setIsIdle(true), 10000); 
    };

    window.addEventListener('mousemove', resetIdleTimer);
    window.addEventListener('keydown', resetIdleTimer);
    resetIdleTimer();

    return () => {
      window.removeEventListener('mousemove', resetIdleTimer);
      window.removeEventListener('keydown', resetIdleTimer);
      clearTimeout(timeout);
    };
  }, []);

  const fetchDatasets = useCallback(async () => {
    try {
      const token = await getToken();
      if (!token) return;
      const response = await fetch("http://localhost:8000/api/datasets", { headers: { "Authorization": `Bearer ${token}` } });
      if (response.ok) {
        const data = await response.json();
        setAvailableDatasets(Array.isArray(data.datasets) ? data.datasets : []);
      }
    } catch (error) { console.error("Failed to fetch datasets"); }
  }, [getToken]);

  useEffect(() => { fetchDatasets(); }, [fetchDatasets]);

  const onDragStart = (event: any, nodeType: string, label: string, color: string) => {
    const dragData = { action_type: nodeType, label, colorClass: color };
    event.dataTransfer.setData('application/reactflow', JSON.stringify(dragData));
    event.dataTransfer.effectAllowed = 'move';
  };

  const onDragOver = useCallback((event: any) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: any) => {
      event.preventDefault();
      if (!reactFlowWrapper.current) return;
      
      const reactFlowBounds = reactFlowWrapper.current.getBoundingClientRect();
      const nodeDataStr = event.dataTransfer.getData('application/reactflow');
      
      if (!nodeDataStr) return;
      const parsedData = JSON.parse(nodeDataStr);

      let icon = <Settings size={20} />;
      if (parsedData.action_type === 'load_dataset') icon = <Database size={20} />;
      if (parsedData.action_type === 'fix_csv') icon = <Settings size={20} />;
      if (parsedData.action_type === 'clean_data') icon = <Sparkles size={20} />;
      if (parsedData.action_type === 'feature_engineer') icon = <Bot size={20} />;
      if (parsedData.action_type === 'train_model') icon = <BrainCircuit size={20} />;
      if (parsedData.action_type === 'generate_plot') icon = <BarChart3 size={20} />;

      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });

      const newNode = {
        id: `${parsedData.action_type}_${Date.now()}`,
        type: 'neoNode',
        position,
        data: { ...parsedData, description: 'Manually placed node.', icon, config: {} },
      };

      setNodes((nds) => nds.concat(newNode));
    },
    [screenToFlowPosition, setNodes]
  );

  const onConnect = useCallback(
    (params: any) => {
      const sourceNode = nodes.find((n: any) => n.id === params.source);
      const targetNode = nodes.find((n: any) => n.id === params.target);

      if (!sourceNode || !targetNode) return;

      if (sourceNode.data.action_type === 'train_model' && targetNode.data.action_type === 'clean_data') {
        alert("🛑 INVALID PIPELINE: You cannot 'Clean Data' after a model is already trained.");
        return; 
      }
      if (sourceNode.data.action_type === 'load_dataset' && targetNode.data.action_type === 'train_model') {
        alert("⚠️ WARNING: AI models cannot read raw text. You must connect 'Feature Engineer' before 'Train Model'.");
        return;
      }
      setEdges((eds) => addEdge({ ...params, type: 'neoEdge', animated: true, style: { stroke: 'black', strokeWidth: 4 } }, eds));
    },
    [nodes, setEdges]
  );

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

  const handleClearCanvas = () => {
    if (window.confirm("🗑️ Are you sure you want to delete the entire pipeline?")) {
      setNodes([]);
      setEdges([]);
      setSelectedNode(null);
      setPipelineResult(null);
    }
  };

  const handleDeleteNode = () => {
    if (!selectedNode) return;
    setNodes((nds) => nds.filter((n) => n.id !== selectedNode.id));
    setEdges((eds) => eds.filter((e) => e.source !== selectedNode.id && e.target !== selectedNode.id));
    setSelectedNode(null);
  };

  const handleAIGenerate = async () => {
    if (!selectedDatasetId) { alert("⚠️ Please select a dataset first!"); return; }
    if (!aiPrompt && nodes.length === 0) { alert("⚠️ Please drag nodes or write instructions!"); return; }

    // THE FIX: Allow a single node to run without edges. Only enforce edge rules if there are 2 or more nodes.
    if (nodes.length > 1) {
      const disconnectedNodes = nodes.filter((node) => {
        const isSource = edges.some((e) => e.source === node.id);
        const isTarget = edges.some((e) => e.target === node.id);
        return !isSource && !isTarget;
      });

      if (disconnectedNodes.length > 0) {
        alert(`🛑 INVALID PIPELINE:\n\nYou have ${disconnectedNodes.length} disconnected node(s) floating on the canvas. Please connect them to the pipeline or delete them before running.`);
        return; 
      }
    }

    setIsThinking(true); 
    setIsResultsPanelOpen(false); 
    setSelectedNode(null);

    try {
      const token = await getToken();
      const formData = new FormData();
      
      const finalPrompt = aiPrompt.trim() === "" ? "Execute my manual pipeline." : aiPrompt;
      
      formData.append("dataset_id", selectedDatasetId);
      formData.append("prompt", finalPrompt);

      if (nodes.length > 0) {
        formData.append("manual_nodes", JSON.stringify(nodes));
        formData.append("manual_edges", JSON.stringify(edges));
      }

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
                
                setPipelineResult({
                    best_model: rawResults.best_model,
                    loss: rawResults.loss,
                    optimization_metric: rawResults.optimization_metric,
                    charts: safeCharts,
                    hasModel: !!rawResults.best_model,
                });
                setIsResultsPanelOpen(true); 
            } else {
                alert("⚠️ The pipeline finished, but returned empty results.");
            }
        }
      } else {
        const errorData = await response.json(); 
        const errorMessage = typeof errorData.detail === 'object' ? JSON.stringify(errorData.detail, null, 2) : errorData.detail;
        alert(`❌ AI Engine Error:\n${errorMessage}`);
      }
    } catch (error) { alert("❌ CRITICAL: Could not connect to the ML Engine."); } finally { setIsThinking(false); }
  };

  const updateNodeConfig = (key: string, value: string) => {
    if (!selectedNode) return;
    
    // Ensure booleans and numbers are handled correctly if needed, but text is fine for the LLM prompt context
    const newConfig = { ...(selectedNode.data.config || {}), [key]: value };
    const updatedNode = { ...selectedNode, data: { ...selectedNode.data, config: newConfig } };
    
    setSelectedNode(updatedNode); 
    
    setNodes((nds) =>
      nds.map((n: any) => (n.id === selectedNode.id ? updatedNode : n))
    );
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-[#fdfaf5] text-black font-sans overflow-hidden">
      
      <style>{`
        @keyframes scrub-arm {
          0% { transform: rotate(-30deg) translateY(0px); }
          100% { transform: rotate(-60deg) translateY(5px); }
        }
        @keyframes bob {
          0% { transform: translateY(0px); }
          100% { transform: translateY(5px); }
        }
        .animate-scrub-arm { animation: scrub-arm 0.4s ease-in-out infinite alternate; }
        .animate-bob { animation: bob 1s ease-in-out infinite alternate; }
        
        .react-flow__handle {
          width: 24px !important;
          height: 24px !important;
          border-width: 4px !important;
          border-color: black !important;
        }
      `}</style>

      {/* FULL SCREEN PROCESSING OVERLAY */}
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

      <UploadModal isOpen={isUploadModalOpen} onClose={() => setIsUploadModalOpen(false)} onSuccess={() => { setIsUploadModalOpen(false); fetchDatasets(); }} />

      {/* HEADER */}
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

      <main className="flex-1 w-full relative overflow-hidden flex">
        
        {/* ========================================== */}
        {/* SLIDING LEFT SIDEBAR (TOOLS ONLY)          */}
        {/* ========================================== */}
        <aside className={`absolute top-0 left-0 h-full bg-white border-r-4 border-black z-40 transition-transform duration-300 ease-in-out flex flex-col shadow-[4px_0px_0px_#000] w-[320px] ${isLeftSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
          
          <button 
            onClick={() => setIsLeftSidebarOpen(!isLeftSidebarOpen)}
            className="absolute -right-[46px] top-6 bg-white border-y-4 border-r-4 border-black p-2 rounded-r-xl shadow-[4px_4px_0px_#000] hover:bg-gray-100 active:translate-x-1 active:translate-y-1 active:shadow-none transition-all"
          >
            {isLeftSidebarOpen ? <ChevronLeft size={24} strokeWidth={3} /> : <ChevronRight size={24} strokeWidth={3} />}
          </button>

          <div className="p-4 border-b-4 border-black bg-yellow-300 shrink-0">
            <h2 className="font-black uppercase tracking-tight text-lg">Node Library</h2>
            <p className="text-xs font-bold text-gray-700 mt-1">Drag tools onto the canvas</p>
          </div>
          
          <div className="p-4 flex flex-col gap-3 overflow-y-auto flex-1 bg-gray-50">
            <div draggable onDragStart={(e) => onDragStart(e, 'fix_csv', 'Fix CSV', 'bg-red-300')} className="border-4 border-black p-3 rounded-xl cursor-grab active:cursor-grabbing hover:-translate-y-1 hover:shadow-[4px_4px_0px_#000] transition-all bg-white flex items-center gap-3">
               <GripVertical size={16} className="text-gray-400" /> <Settings size={20} className="text-red-500" /> <span className="font-bold">Fix CSV</span>
            </div>
            <div draggable onDragStart={(e) => onDragStart(e, 'clean_data', 'Clean Data', 'bg-blue-300')} className="border-4 border-black p-3 rounded-xl cursor-grab active:cursor-grabbing hover:-translate-y-1 hover:shadow-[4px_4px_0px_#000] transition-all bg-white flex items-center gap-3">
               <GripVertical size={16} className="text-gray-400" /> <Sparkles size={20} className="text-blue-500" /> <span className="font-bold">Clean Data</span>
            </div>
            <div draggable onDragStart={(e) => onDragStart(e, 'feature_engineer', 'Feature Eng', 'bg-orange-300')} className="border-4 border-black p-3 rounded-xl cursor-grab active:cursor-grabbing hover:-translate-y-1 hover:shadow-[4px_4px_0px_#000] transition-all bg-white flex items-center gap-3">
               <GripVertical size={16} className="text-gray-400" /> <Bot size={20} className="text-orange-500" /> <span className="font-bold">Feature Eng</span>
            </div>
            <div draggable onDragStart={(e) => onDragStart(e, 'train_model', 'Train Model', 'bg-purple-300')} className="border-4 border-black p-3 rounded-xl cursor-grab active:cursor-grabbing hover:-translate-y-1 hover:shadow-[4px_4px_0px_#000] transition-all bg-white flex items-center gap-3">
               <GripVertical size={16} className="text-gray-400" /> <BrainCircuit size={20} className="text-purple-500" /> <span className="font-bold">Train Model</span>
            </div>
            <div draggable onDragStart={(e) => onDragStart(e, 'generate_plot', 'Plot Graph', 'bg-pink-300')} className="border-4 border-black p-3 rounded-xl cursor-grab active:cursor-grabbing hover:-translate-y-1 hover:shadow-[4px_4px_0px_#000] transition-all bg-white flex items-center gap-3">
               <GripVertical size={16} className="text-gray-400" /> <BarChart3 size={20} className="text-pink-500" /> <span className="font-bold">Plot Graph</span>
            </div>
          </div>
        </aside>

        {/* FLOATING BUTTON (Analysis) */}
        {pipelineResult && !isThinking && !isResultsPanelOpen && !isUploadModalOpen && (
          <button type="button" onClick={() => setIsResultsPanelOpen(true)} className="absolute top-6 right-6 z-30 bg-yellow-300 hover:bg-yellow-400 border-4 border-black px-6 py-3 rounded-xl shadow-[6px_6px_0px_#000] active:translate-x-1 active:translate-y-1 active:shadow-none transition-all flex items-center gap-3 font-black uppercase text-sm">
            <BarChart3 size={20} /> Open Analysis
          </button>
        )}

        {/* ========================================== */}
        {/* REACT FLOW CANVAS & IDLE JANITOR           */}
        {/* ========================================== */}
        <div className="flex-1 h-full w-full relative pb-32" ref={reactFlowWrapper}> 
          
          {/* Default Canvas State OR Idle Animation */}
          {nodes.length === 0 && !isThinking && (
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-10 transition-all duration-700">
              {isIdle ? (
                <div className="relative flex items-end justify-center gap-4 animate-bob mt-[-80px]">
                  <div className="flex flex-col items-center relative z-10">
                     <div className="w-16 h-16 bg-[#008000] border-4 border-black rounded-full shadow-[4px_4px_0px_#000] mb-2 translate-x-4" />
                     <div className="relative flex justify-center">
                        <div className="flex flex-col items-center">
                           <div className="w-14 h-28 bg-[#008000] border-4 border-black border-b-0 rounded-t-[32px] relative z-10" />
                           <div className="relative w-14 h-28 z-0 -mt-1">
                              <div className="absolute top-0 right-1 w-6 h-28 bg-[#006000] border-4 border-black border-t-0 rounded-b-full" />
                              <div className="absolute top-0 left-1 w-6 h-28 bg-[#008000] border-4 border-black border-t-0 rounded-b-full shadow-[4px_4px_0px_#000]" />
                           </div>
                        </div>
                        <div className="absolute right-0 top-2 w-7 h-28 bg-[#008000] border-4 border-black rounded-full origin-top animate-scrub-arm flex items-end justify-center shadow-[4px_4px_0px_#000] z-20">
                           <div className="absolute -bottom-6 -right-4 w-10 h-10 bg-yellow-400 border-4 border-black rounded-md flex items-center justify-center shadow-[2px_2px_0px_#000] rotate-[45deg]">
                              <Sparkles size={18} className="text-white animate-spin" />
                           </div>
                        </div>
                     </div>
                  </div>
                  <div className="relative z-0 mb-4">
                     <Database size={160} strokeWidth={1} className="text-gray-200" />
                     <Sparkles size={40} className="absolute -top-2 -left-4 text-yellow-400 animate-pulse" />
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center text-gray-400 transition-opacity">
                  <Bot size={80} className="mb-4 opacity-50" />
                  <h2 className="text-2xl font-black">Waiting for instructions...</h2>
                  <p className="font-bold text-center mt-2 max-w-sm">Open the left panel to drag tools, or prompt the AI below.</p>
                </div>
              )}
            </div>
          )}

          <ReactFlow
            nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} 
            onConnect={onConnect} onDrop={onDrop} onDragOver={onDragOver}
            onNodeClick={(event: any, node: any) => setSelectedNode(node)} 
            onPaneClick={() => setSelectedNode(null)} 
            nodeTypes={nodeTypes} edgeTypes={edgeTypes} fitView
            nodesDraggable={true} nodesConnectable={true} 
            defaultEdgeOptions={{ type: 'neoEdge' }}
          >
            <Background color="#000" gap={24} size={2} />
            <Controls className="border-2 border-black shadow-[4px_4px_0px_#000] rounded-lg bg-white overflow-hidden [&>button]:border-black [&>button]:text-black" />
            <MiniMap className="border-4 border-black shadow-[4px_4px_0px_#000] rounded-xl bg-white" nodeColor="#000" maskColor="rgba(0,0,0,0.1)" />
          </ReactFlow>

          {/* ========================================== */}
          {/* BOTTOM EXECUTION ENGINE (PROMPT)           */}
          {/* ========================================== */}
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-full max-w-4xl z-20 px-4">
            <div className="bg-white border-4 border-black shadow-[8px_8px_0px_#000] rounded-2xl p-3 flex flex-col md:flex-row gap-3 items-center">
              
              <div className="w-full md:w-[340px] shrink-0 flex gap-2 items-center">
                <select 
                  value={selectedDatasetId}
                  onChange={(e) => setSelectedDatasetId(e.target.value)}
                  className="flex-1 min-w-0 w-full border-4 border-black rounded-xl p-3 font-bold bg-gray-100 focus:ring-4 focus:ring-purple-300 outline-none cursor-pointer text-sm truncate"
                >
                  <option value="" disabled>
                    {availableDatasets.length === 0 ? "⚠️ No Hosted Files" : "1. Choose Target Dataset"}
                  </option>
                  {availableDatasets.map((dataset) => (
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

                {/* THE ERASE CANVAS BUTTON */}
                <button 
                  type="button"
                  onClick={handleClearCanvas}
                  title="Clear Entire Canvas"
                  disabled={nodes.length === 0}
                  className={`w-[52px] h-[52px] shrink-0 flex items-center justify-center border-4 border-black rounded-xl transition-all ${nodes.length === 0 ? 'bg-gray-200 text-gray-400 cursor-not-allowed border-gray-400' : 'bg-red-400 hover:bg-red-500 shadow-[4px_4px_0px_#000] active:translate-x-1 active:translate-y-1 active:shadow-none text-white'}`}
                >
                  <Eraser size={24} strokeWidth={3} />
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

        <ResultsModal isOpen={isResultsPanelOpen} onClose={() => setIsResultsPanelOpen(false)} pipelineResult={pipelineResult} />

        {/* ========================================== */}
        {/* RIGHT SLIDE-OUT INSPECTOR (WITH EDITABLE INPUTS) */}
        {/* ========================================== */}
        <div className={`absolute top-0 right-0 h-full bg-white border-l-4 border-black transition-transform duration-300 ease-in-out z-30 shadow-[-4px_0px_0px_rgba(0,0,0,0.1)] w-80 ${selectedNode ? "translate-x-0" : "translate-x-full"}`}>
          {selectedNode && (
            <div className="p-6 h-full flex flex-col overflow-y-auto">
              <div className="flex items-center justify-between mb-8 border-b-4 border-black pb-4">
                <h2 className="text-xl font-black flex items-center gap-2"><Settings size={24} /> Inspector</h2>
                <div className="flex gap-2">
                  <button type="button" onClick={handleDeleteNode} title="Delete Node" className="p-1 border-2 border-black rounded-md bg-white hover:bg-red-400 hover:text-white transition-all shadow-[2px_2px_0px_#000] active:shadow-none active:translate-x-1 active:translate-y-1">
                    <Trash2 size={20} strokeWidth={3} />
                  </button>
                  <button type="button" onClick={() => setSelectedNode(null)} title="Close Inspector" className="p-1 border-2 border-black rounded-md hover:bg-gray-200 transition-all shadow-[2px_2px_0px_#000] active:shadow-none active:translate-x-1 active:translate-y-1">
                    <X size={20} strokeWidth={3} />
                  </button>
                </div>
              </div>

              <div className="bg-gray-100 border-4 border-black rounded-xl p-4 shadow-[4px_4px_0px_#000] mb-6">
                <p className="font-bold text-sm text-gray-500 mb-2">Node Type</p>
                <p className="font-black text-lg uppercase">{selectedNode.data.label}</p>
              </div>

              <div className="flex flex-col gap-4">
                <p className="font-black text-md border-b-2 border-gray-200 pb-2">Active Configuration:</p>
                
                {/* THE FIX: Upgraded Inspector Inputs to Options/Selects */}
                {selectedNode.data.action_type === 'fix_csv' && (
                  <div>
                    <label className="font-bold text-xs text-gray-500 block mb-1 uppercase">Delimiter</label>
                    <input type="text" value={selectedNode.data.config?.delimiter || ''} onChange={(e) => updateNodeConfig('delimiter', e.target.value)} placeholder="e.g., , or ;" className="w-full border-2 border-black rounded-lg p-2 font-bold text-sm focus:bg-yellow-100 outline-none" />
                  </div>
                )}

                {selectedNode.data.action_type === 'clean_data' && (
                  <div>
                    <label className="font-bold text-xs text-gray-500 block mb-1 uppercase">Drop Null Values?</label>
                    <select 
                      value={selectedNode.data.config?.drop_nulls || 'false'} 
                      onChange={(e) => updateNodeConfig('drop_nulls', e.target.value)} 
                      className="w-full border-2 border-black rounded-lg p-2 font-bold text-sm focus:bg-yellow-100 outline-none cursor-pointer bg-white"
                    >
                      <option value="false">No (Keep missing data)</option>
                      <option value="true">Yes (Delete rows with missing data)</option>
                    </select>
                  </div>
                )}

                {selectedNode.data.action_type === 'feature_engineer' && (
                  <div>
                    <label className="font-bold text-xs text-gray-500 block mb-1 uppercase">Target Column</label>
                    <input type="text" value={selectedNode.data.config?.target_column || ''} onChange={(e) => updateNodeConfig('target_column', e.target.value)} placeholder="REQUIRED for AI" className="w-full border-2 border-black rounded-lg p-2 font-bold text-sm focus:bg-yellow-100 outline-none" />
                  </div>
                )}

                {selectedNode.data.action_type === 'train_model' && (
                  <div className="flex flex-col gap-4">
                    <div>
                      <label className="font-bold text-xs text-gray-500 block mb-1 uppercase">Target Column</label>
                      <input 
                        type="text" 
                        value={selectedNode.data.config?.target_column || ''} 
                        onChange={(e) => updateNodeConfig('target_column', e.target.value)} 
                        placeholder="e.g., species (REQUIRED)" 
                        className="w-full border-2 border-black rounded-lg p-2 font-bold text-sm focus:bg-yellow-100 outline-none" 
                      />
                    </div>
                    <div>
                      <label className="font-bold text-xs text-gray-500 block mb-1 uppercase">AI Brain (Model Type)</label>
                      <select 
                        value={selectedNode.data.config?.model_type || 'auto'} 
                        onChange={(e) => updateNodeConfig('model_type', e.target.value)} 
                        className="w-full border-2 border-black rounded-lg p-2 font-bold text-sm focus:bg-yellow-100 outline-none cursor-pointer bg-white"
                      >
                        <option value="auto">🧠 Auto-Pilot (Let AI Decide)</option>
                        <optgroup label="🗂️ Guessing Categories (e.g. Yes/No, Species)">
                          <option value="logistic_regression">Simple Category Guesser (Logistic)</option>
                          <option value="random_forest">Group of Trees (Random Forest)</option>
                          <option value="xgboost">Advanced Guesser (XGBoost)</option>
                          <option value="lightgbm">Fast Advanced Guesser (LightGBM)</option>
                          <option value="svm">Boundary Drawer (SVM)</option>
                        </optgroup>
                        <optgroup label="📈 Guessing Numbers (e.g. Price, Age, Sales)">
                          <option value="linear_regression">Simple Trend Line (Linear)</option>
                          <option value="random_forest">Tree-Based Predictor (Random Forest)</option>
                          <option value="xgboost">Advanced Predictor (XGBoost)</option>
                          <option value="lightgbm">Fast Advanced Predictor (LightGBM)</option>
                        </optgroup>
                      </select>
                    </div>
                  </div>
                )}

                {selectedNode.data.action_type === 'generate_plot' && (
                  <div className="flex flex-col gap-4">
                    <div>
                      <label className="font-bold text-xs text-gray-500 block mb-1 uppercase">Chart Type</label>
                      <select 
                        value={selectedNode.data.config?.chart_type || 'scatter'} 
                        onChange={(e) => updateNodeConfig('chart_type', e.target.value)} 
                        className="w-full border-2 border-black rounded-lg p-2 font-bold text-sm focus:bg-yellow-100 outline-none cursor-pointer bg-white"
                      >
                        <option value="scatter">📍 Scatter Plot (Compare 2 numbers)</option>
                        <option value="bar">📊 Bar Chart (Compare categories)</option>
                        <option value="histogram">📉 Histogram (Show distribution)</option>
                        <option value="boxplot">📦 Boxplot (Find Outliers)</option>
                        <option value="heatmap">🔥 Heatmap (Show correlations)</option>
                      </select>
                    </div>
                    <div>
                      <label className="font-bold text-xs text-gray-500 block mb-1 uppercase">Specific Columns (Optional)</label>
                      <input 
                        type="text" 
                        value={selectedNode.data.config?.columns || ''} 
                        onChange={(e) => updateNodeConfig('columns', e.target.value)} 
                        placeholder="e.g., price, size (comma separated)" 
                        className="w-full border-2 border-black rounded-lg p-2 font-bold text-sm focus:bg-yellow-100 outline-none" 
                      />
                    </div>
                  </div>
                )}
                {/* Catch-all for AI generated parameters we didn't hardcode */}
                {Object.entries(selectedNode.data.config || {}).map(([key, value]: any) => {
                  const knownKeys = ['delimiter', 'drop_nulls', 'target_column', 'model_type', 'columns', 'chart_type'];
                  if (knownKeys.includes(key)) return null; 
                  return (
                    <div key={key}>
                      <label className="font-bold text-xs text-gray-500 block mb-1 uppercase">{key}</label>
                      <input 
                        type="text" 
                        value={typeof value === 'object' ? JSON.stringify(value) : value} 
                        onChange={(e) => updateNodeConfig(key, e.target.value)}
                        className="w-full border-2 border-black rounded-lg p-2 font-bold text-sm focus:bg-yellow-100 outline-none" 
                      />
                    </div>
                  );
                })}

                {/* Empty State Fallback */}
                {Object.keys(selectedNode.data.config || {}).length === 0 && !['fix_csv', 'clean_data', 'feature_engineer', 'train_model', 'generate_plot'].includes(selectedNode.data.action_type) && (
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