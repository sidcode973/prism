import React from 'react';
import { GripVertical, Settings, Sparkles, Bot, BrainCircuit, BarChart3, ChevronLeft, ChevronRight } from "lucide-react";

export default function Sidebar({ isOpen, toggleSidebar, onDragStart }: any) {
  return (
    <aside className={`absolute top-0 left-0 h-full bg-white border-r-4 border-black z-40 transition-transform duration-300 ease-in-out flex flex-col shadow-[4px_0px_0px_#000] w-[320px] ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>
      <button onClick={toggleSidebar} className="absolute -right-[46px] top-6 bg-white border-y-4 border-r-4 border-black p-2 rounded-r-xl shadow-[4px_4px_0px_#000] hover:bg-gray-100 active:translate-x-1 active:translate-y-1 active:shadow-none transition-all">
        {isOpen ? <ChevronLeft size={24} strokeWidth={3} /> : <ChevronRight size={24} strokeWidth={3} />}
      </button>
      <div className="p-4 border-b-4 border-black bg-yellow-300 shrink-0">
        <h2 className="font-black uppercase tracking-tight text-lg">Node Library</h2>
        <p className="text-xs font-bold text-gray-700 mt-1">Drag tools onto the canvas</p>
      </div>
      <div className="p-4 flex flex-col gap-3 overflow-y-auto flex-1 bg-gray-50">
        <div draggable onDragStart={(e) => onDragStart(e, 'fix_csv', 'Fix CSV', 'bg-red-300')} className="border-4 border-black p-3 rounded-xl cursor-grab hover:-translate-y-1 hover:shadow-[4px_4px_0px_#000] transition-all bg-white flex items-center gap-3"><GripVertical size={16} className="text-gray-400" /> <Settings size={20} className="text-red-500" /> <span className="font-bold">Fix CSV</span></div>
        <div draggable onDragStart={(e) => onDragStart(e, 'clean_data', 'Clean Data', 'bg-blue-300')} className="border-4 border-black p-3 rounded-xl cursor-grab hover:-translate-y-1 hover:shadow-[4px_4px_0px_#000] transition-all bg-white flex items-center gap-3"><GripVertical size={16} className="text-gray-400" /> <Sparkles size={20} className="text-blue-500" /> <span className="font-bold">Clean Data</span></div>
        <div draggable onDragStart={(e) => onDragStart(e, 'feature_engineer', 'Feature Eng', 'bg-orange-300')} className="border-4 border-black p-3 rounded-xl cursor-grab hover:-translate-y-1 hover:shadow-[4px_4px_0px_#000] transition-all bg-white flex items-center gap-3"><GripVertical size={16} className="text-gray-400" /> <Bot size={20} className="text-orange-500" /> <span className="font-bold">Feature Eng</span></div>
        <div draggable onDragStart={(e) => onDragStart(e, 'train_model', 'Train Model', 'bg-purple-300')} className="border-4 border-black p-3 rounded-xl cursor-grab hover:-translate-y-1 hover:shadow-[4px_4px_0px_#000] transition-all bg-white flex items-center gap-3"><GripVertical size={16} className="text-gray-400" /> <BrainCircuit size={20} className="text-purple-500" /> <span className="font-bold">Train Model</span></div>
        <div draggable onDragStart={(e) => onDragStart(e, 'generate_plot', 'Plot Graph', 'bg-pink-300')} className="border-4 border-black p-3 rounded-xl cursor-grab hover:-translate-y-1 hover:shadow-[4px_4px_0px_#000] transition-all bg-white flex items-center gap-3"><GripVertical size={16} className="text-gray-400" /> <BarChart3 size={20} className="text-pink-500" /> <span className="font-bold">Plot Graph</span></div>
      </div>
    </aside>
  );
}