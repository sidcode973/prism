"use client";

import React, { useCallback, useState, useEffect, useRef } from "react";
import { UserButton, useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { ReactFlow, Background, Controls, MiniMap, useNodesState, useEdgesState, ReactFlowProvider, useReactFlow, addEdge } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { ArrowLeft, Database, Bot, BarChart3 } from "lucide-react";

import UploadModal from "./components/UploadModal";
import ResultsModal from "./components/ResultsModal";
import NeoNode from "./components/NeoNode";
import NeoEdge from "./components/NeoEdge";
import Sidebar from "./components/Sidebar";
import BottomBar from "./components/BottomBar";
import Inspector from "./components/Inspector";

const nodeTypes: any = { neoNode: NeoNode };
const edgeTypes: any = { neoEdge: NeoEdge };

interface DatasetRecord { id: string; file_name: string; }

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
  const [datasetColumns, setDatasetColumns] = useState<string[]>([]);
  
  const [aiPrompt, setAiPrompt] = useState<string>("");
  const [isThinking, setIsThinking] = useState(false);
  const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState(true); 
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isResultsPanelOpen, setIsResultsPanelOpen] = useState(false);
  const [isIdle, setIsIdle] = useState(false);

  useEffect(() => {
    let timeout: NodeJS.Timeout;
    const resetIdleTimer = () => { setIsIdle(false); clearTimeout(timeout); timeout = setTimeout(() => setIsIdle(true), 10000); };
    window.addEventListener('mousemove', resetIdleTimer); window.addEventListener('keydown', resetIdleTimer); resetIdleTimer();
    return () => { window.removeEventListener('mousemove', resetIdleTimer); window.removeEventListener('keydown', resetIdleTimer); clearTimeout(timeout); };
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

  // Schema Introspection hook
  useEffect(() => {
    const fetchColumns = async () => {
      if (!selectedDatasetId) { setDatasetColumns([]); return; }
      try {
        const token = await getToken();
        const response = await fetch(`http://localhost:8000/api/datasets/${selectedDatasetId}/columns`, { headers: { "Authorization": `Bearer ${token}` } });
        if (response.ok) {
          const data = await response.json();
          setDatasetColumns(data.columns || []);
        }
      } catch (error) { console.error("Failed to fetch columns"); }
    };
    fetchColumns();
  }, [selectedDatasetId, getToken]);

  const onDragStart = (event: any, nodeType: string, label: string, color: string) => {
    event.dataTransfer.setData('application/reactflow', JSON.stringify({ action_type: nodeType, label, colorClass: color }));
    event.dataTransfer.effectAllowed = 'move';
  };

  const onDragOver = useCallback((e: any) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }, []);

  const onDrop = useCallback((event: any) => {
      event.preventDefault();
      if (!reactFlowWrapper.current) return;
      const nodeDataStr = event.dataTransfer.getData('application/reactflow');
      if (!nodeDataStr) return;
      
      const parsedData = JSON.parse(nodeDataStr);
      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });

      const newNode = {
        id: `${parsedData.action_type}_${Date.now()}`,
        type: 'neoNode',
        position,
        data: { ...parsedData, description: 'Manual node.', icon: null, config: {} }, // Icon mapped in Node component via class
      };
      setNodes((nds) => nds.concat(newNode));
    }, [screenToFlowPosition, setNodes]
  );

  const onConnect = useCallback((params: any) => {
      setEdges((eds) => addEdge({ ...params, type: 'neoEdge', animated: true, style: { stroke: 'black', strokeWidth: 4 } }, eds));
  }, [setEdges]);

  const handleClearCanvas = () => {
    if (window.confirm("🗑️ Delete the entire pipeline?")) { setNodes([]); setEdges([]); setSelectedNode(null); setPipelineResult(null); }
  };

  const handleDeleteNode = () => {
    if (!selectedNode) return;
    setNodes((nds) => nds.filter((n) => n.id !== selectedNode.id));
    setEdges((eds) => eds.filter((e) => e.source !== selectedNode.id && e.target !== selectedNode.id));
    setSelectedNode(null);
  };

  const updateNodeConfig = (key: string, value: any) => {
    if (!selectedNode) return;
    const newConfig = { ...(selectedNode.data.config || {}), [key]: value };
    const updatedNode = { ...selectedNode, data: { ...selectedNode.data, config: newConfig } };
    setSelectedNode(updatedNode); 
    setNodes((nds) => nds.map((n: any) => (n.id === selectedNode.id ? updatedNode : n)));
  };

  const handleAIGenerate = async () => {
    if (!selectedDatasetId) { alert("⚠️ Please select a dataset first!"); return; }
    setIsThinking(true); setIsResultsPanelOpen(false); setSelectedNode(null);
    try {
      const token = await getToken();
      const formData = new FormData();
      formData.append("dataset_id", selectedDatasetId);
      formData.append("prompt", aiPrompt.trim() || "Execute my manual pipeline.");
      if (nodes.length > 0) {
        formData.append("manual_nodes", JSON.stringify(nodes));
        formData.append("manual_edges", JSON.stringify(edges));
      }
      const response = await fetch("http://localhost:8000/api/run-pipeline", { method: "POST", headers: { "Authorization": `Bearer ${token}` }, body: formData });
      if (response.ok) {
        const data = await response.json();
        
        // 🚨 FIX: Re-enable the rejection alert so it doesn't fail silently
        if (data.execution_results?.status === "error" || data.execution_results?.status === "warning") {
            alert(`🛑 Pipeline Interrupted:\n${data.execution_results.message}`);
            return;
        }

        if (data.execution_results?.results) {
          const rawResults = data.execution_results.results;
          setPipelineResult({
             run_id: data.run_id, best_model: rawResults.best_model, loss: rawResults.loss,
             optimization_metric: rawResults.optimization_metric, charts: rawResults.charts || [], hasModel: !!rawResults.best_model,
          });
          setIsResultsPanelOpen(true); 
        }
      } else { alert("❌ Error connecting to engine."); }
    } catch (error) { alert("❌ Error."); } finally { setIsThinking(false); }
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-[#fdfaf5] text-black font-sans overflow-hidden">
      
      {/* OBS 2: CUSTOM ANIMATED LOADING SCREEN RESTORED */}
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

      <header className="h-20 border-b-4 border-black bg-white flex items-center justify-between px-6 z-10 shrink-0">
        <div className="flex items-center gap-4">
          <Link href="/"><button className="p-2 border-2 border-black bg-gray-100 rounded-md shadow-[2px_2px_0px_#000]"><ArrowLeft size={24}/></button></Link>
          <h1 className="font-black text-2xl hidden md:block tracking-tighter">AI PIPELINE ENGINE</h1>
        </div>
        <UserButton />
      </header>

      <main className="flex-1 w-full relative overflow-hidden flex">
        <Sidebar isOpen={isLeftSidebarOpen} toggleSidebar={() => setIsLeftSidebarOpen(!isLeftSidebarOpen)} onDragStart={onDragStart} />
        
        {/* OBS 9: RESTORE FLOATING ANALYSIS BUTTON */}
        {pipelineResult && !isThinking && !isResultsPanelOpen && !isUploadModalOpen && (
          <button type="button" onClick={() => setIsResultsPanelOpen(true)} className="absolute top-6 right-6 z-30 bg-yellow-300 hover:bg-yellow-400 border-4 border-black px-6 py-3 rounded-xl shadow-[6px_6px_0px_#000] active:translate-x-1 active:translate-y-1 active:shadow-none transition-all flex items-center gap-3 font-black uppercase text-sm">
            <BarChart3 size={20} /> Open Analysis
          </button>
        )}

        <div className="flex-1 h-full w-full relative pb-32" ref={reactFlowWrapper}> 
          {nodes.length === 0 && !isThinking && (
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-10 transition-all duration-700">
               {isIdle ? <Database size={160} className="text-gray-200" /> : <Bot size={80} className="opacity-50 text-gray-400" />}
            </div>
          )}
          <ReactFlow
            nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} 
            onConnect={onConnect} onDrop={onDrop} onDragOver={onDragOver}
            onNodeClick={(event, node) => setSelectedNode(node)} onPaneClick={() => setSelectedNode(null)} 
            nodeTypes={nodeTypes} edgeTypes={edgeTypes} fitView defaultEdgeOptions={{ type: 'neoEdge' }}
          >
            <Background color="#000" gap={24} size={2} />
            <Controls className="border-2 border-black rounded-lg bg-white shadow-[4px_4px_0px_#000]" />
            <MiniMap className="border-4 border-black shadow-[4px_4px_0px_#000] rounded-xl bg-white" nodeColor="#000" maskColor="rgba(0,0,0,0.1)" />
          </ReactFlow>

          <BottomBar 
            selectedDatasetId={selectedDatasetId} setSelectedDatasetId={setSelectedDatasetId} availableDatasets={availableDatasets}
            setIsUploadModalOpen={setIsUploadModalOpen} handleClearCanvas={handleClearCanvas} nodesLength={nodes.length}
            aiPrompt={aiPrompt} setAiPrompt={setAiPrompt} handleAIGenerate={handleAIGenerate}
          />
        </div>

        <ResultsModal isOpen={isResultsPanelOpen} onClose={() => setIsResultsPanelOpen(false)} pipelineResult={pipelineResult} />
        <Inspector selectedNode={selectedNode} setSelectedNode={setSelectedNode} handleDeleteNode={handleDeleteNode} updateNodeConfig={updateNodeConfig} availableDatasets={availableDatasets} datasetColumns={datasetColumns} />
      </main>
    </div>
  );
}

export default function CanvasPage() { return <ReactFlowProvider><CanvasBoard /></ReactFlowProvider>; }