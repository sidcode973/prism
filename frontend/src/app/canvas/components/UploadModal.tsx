"use client";

import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { UploadCloud, FileText, Loader2, X } from "lucide-react";
import { useAuth } from "@clerk/nextjs";

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function UploadModal({ isOpen, onClose, onSuccess }: UploadModalProps) {
  const { getToken } = useAuth();
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadStatus, setUploadStatus] = useState<"idle" | "uploading" | "success" | "error">("idle");
  
  // 1. Add a mounted state to prevent hydration mismatches in Next.js
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // 2. Wait until the component is mounted on the client to render the portal
  if (!isOpen || !mounted) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setUploadFile(e.target.files[0]);
      setUploadStatus("idle");
    }
  };

  const handleUploadSubmit = async () => {
    if (!uploadFile) return;
    setUploadStatus("uploading");

    try {
      const token = await getToken();
      const formData = new FormData();
      formData.append("file", uploadFile);

      const response = await fetch("http://localhost:8000/api/datasets/upload", {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}` },
        body: formData,
      });

      if (response.ok) {
        setUploadStatus("success");
        setTimeout(() => {
          onSuccess();
          setUploadFile(null);
          setUploadStatus("idle");
        }, 1500);
      } else {
        setUploadStatus("error");
      }
    } catch (error) {
      setUploadStatus("error");
    }
  };

  // 3. Wrap the return JSX in createPortal, targeting document.body
  return createPortal(
<div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 font-sans text-black">
<div className="w-full max-w-4xl bg-blue-200 border-8 border-black shadow-[12px_12px_0px_#000] p-8 rounded-3xl relative animate-in zoom-in-95 duration-200">        
        <button 
          onClick={() => { onClose(); setUploadStatus("idle"); setUploadFile(null); }} 
          className="absolute top-4 right-4 p-2 bg-white hover:bg-red-200 border-4 border-black rounded-xl transition-all shadow-[4px_4px_0px_#000] active:translate-y-1 active:translate-x-1 active:shadow-none"
        >
          <X size={24} strokeWidth={3} />
        </button>

        <h2 className="text-3xl font-black mb-2 uppercase tracking-tighter">Upload Data</h2>
        <p className="font-bold text-gray-700 mb-6 border-l-4 border-black pl-3">
          Securely upload CSV files to your workspace.
        </p>

        <div className="border-4 border-dashed border-black bg-white p-6 rounded-2xl flex flex-col items-center justify-center text-center transition-all hover:bg-gray-50">
          <UploadCloud size={48} className="mb-4 text-blue-500" />
          <input 
            type="file" 
            accept=".csv" 
            onChange={handleFileChange}
            className="mb-4 block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-2 file:border-black file:text-sm file:font-bold file:bg-yellow-300 file:text-black hover:file:bg-yellow-400 file:shadow-[2px_2px_0px_#000] transition-all cursor-pointer"
          />
          {uploadFile && <p className="font-bold text-green-600 flex items-center gap-2"><FileText size={18}/> {uploadFile.name}</p>}
        </div>

        <button 
          onClick={handleUploadSubmit}
          disabled={!uploadFile || uploadStatus === "uploading"}
          className="mt-6 w-full bg-black text-white border-4 border-black hover:bg-gray-800 active:translate-x-1 active:translate-y-1 active:shadow-none shadow-[6px_6px_0px_#ccc] py-3 font-black text-xl rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed uppercase flex justify-center items-center gap-2"
        >
          {uploadStatus === "uploading" ? <><Loader2 className="animate-spin" size={24} /> Uploading...</> : "Confirm & Upload"}
        </button>

        {uploadStatus === "success" && (
          <div className="mt-4 p-3 bg-green-300 border-4 border-black rounded-xl font-bold flex items-center gap-2 text-sm">
            ✅ File securely uploaded! Refreshing...
          </div>
        )}
        {uploadStatus === "error" && (
          <div className="mt-4 p-3 bg-red-300 border-4 border-black rounded-xl font-bold flex items-center gap-2 text-sm">
            ⚠️ Upload failed. Check your Python server.
          </div>
        )}
      </div>
    </div>,
    document.body // <--- Teleports the modal outside the root app container
  );
}