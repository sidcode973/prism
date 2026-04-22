"use client";

import React, { useState } from "react";
import { useAuth, useUser, UserButton } from "@clerk/nextjs";
import { UploadCloud, FileType, CheckCircle, AlertTriangle, ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function DatasetsPage() {
  const { getToken } = useAuth();
  const { user } = useUser();
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<"idle" | "uploading" | "success" | "error">("idle");

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setStatus("idle");
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    setStatus("uploading");

    try {
      const token = await getToken();
      
      // We use FormData to send physical files over HTTP
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("http://localhost:8000/api/datasets/upload", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}` // Secure Clerk Token!
        },
        body: formData, // Notice we do NOT use JSON.stringify here
      });

      if (response.ok) {
        setStatus("success");
      } else {
        setStatus("error");
      }
    } catch (error) {
      setStatus("error");
    }
  };

  return (
    <div className="min-h-screen bg-[#fdfaf5] font-sans text-black flex flex-col">
      {/* HEADER */}
      <header className="h-20 border-b-4 border-black bg-white flex items-center justify-between px-6 z-10 shadow-[0px_4px_0px_#000]">
        <div className="flex items-center gap-4">
          <Link href="/">
            <button className="p-2 border-2 border-black bg-gray-100 hover:bg-gray-200 shadow-[2px_2px_0px_#000] active:translate-x-1 active:translate-y-1 active:shadow-none transition-all rounded-md">
              <ArrowLeft size={24} strokeWidth={3} />
            </button>
          </Link>
          <h1 className="font-black text-2xl tracking-tighter">DATASET MANAGER</h1>
        </div>
        <div className="border-2 border-black rounded-full shadow-[2px_2px_0px_#000]">
  <UserButton />
</div>
      </header>

      {/* MAIN CONTENT */}
      <main className="flex-1 p-8 md:p-12 flex flex-col items-center justify-center">
        <div className="max-w-2xl w-full bg-blue-200 border-8 border-black shadow-[16px_16px_0px_#000] p-8 md:p-12 rounded-3xl">
          <h2 className="text-4xl font-black mb-4 uppercase tracking-tighter">Upload New Data</h2>
          <p className="font-bold text-gray-700 mb-8 border-l-4 border-black pl-4">
            Upload your CSV files here. They will be securely stored in your private cloud partition.
          </p>

          <div className="border-4 border-dashed border-black bg-white p-10 rounded-2xl flex flex-col items-center justify-center text-center transition-all hover:bg-gray-50">
            <UploadCloud size={64} className="mb-4 text-blue-500" />
            <input 
              type="file" 
              accept=".csv" 
              onChange={handleFileChange}
              className="mb-4 block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-2 file:border-black file:text-sm file:font-bold file:bg-yellow-300 file:text-black hover:file:bg-yellow-400 file:shadow-[2px_2px_0px_#000] transition-all cursor-pointer"
            />
            {file && <p className="font-bold text-green-600 flex items-center gap-2"><FileType size={18}/> Selected: {file.name}</p>}
          </div>

          <button 
            onClick={handleUpload}
            disabled={!file || status === "uploading"}
            className="mt-8 w-full bg-black text-white border-4 border-black hover:bg-gray-800 active:translate-x-1 active:translate-y-1 active:shadow-none shadow-[8px_8px_0px_#ccc] py-4 font-black text-xl rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed uppercase"
          >
            {status === "uploading" ? "Uploading to secure vault..." : "Confirm & Upload"}
          </button>

          {status === "success" && (
            <div className="mt-6 p-4 bg-green-300 border-4 border-black rounded-xl font-bold flex items-center gap-3">
              <CheckCircle size={24} /> File successfully uploaded and ready for the Canvas!
            </div>
          )}
          {status === "error" && (
            <div className="mt-6 p-4 bg-red-300 border-4 border-black rounded-xl font-bold flex items-center gap-3">
              <AlertTriangle size={24} /> Upload failed. Check your Python server.
            </div>
          )}
        </div>
      </main>
    </div>
  );
}