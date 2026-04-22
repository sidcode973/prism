import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center bg-[#fdfaf5] font-sans">
      
      {/* Title */}
      <div className="mb-8 text-center">
        <h1 className="text-6xl font-black tracking-tighter uppercase mb-2">Welcome Back</h1>
        <p className="text-xl font-bold text-gray-600">Log in to access your pipeline canvas.</p>
      </div>

      {/* The Brutalist Wrapper */}
      <div className="p-6 bg-yellow-300 border-8 border-black shadow-[16px_16px_0px_#000] rounded-3xl transform -rotate-2 hover:rotate-0 transition-transform duration-300">
        <div className="transform rotate-2 bg-white rounded-xl border-4 border-black overflow-hidden shadow-[8px_8px_0px_#000]">
          
          {/* We inject Clerk's component right here! */}
          <SignIn 
            appearance={{
              elements: {
                formButtonPrimary: 
                  "bg-black text-white hover:bg-gray-800 font-bold border-2 border-black shadow-[4px_4px_0px_#ccc] active:shadow-none active:translate-y-1 transition-all",
                card: "shadow-none p-6", // Removes Clerk's default shadow so ours shines
                headerTitle: "hidden", // We hide their title because we built our own!
                headerSubtitle: "hidden"
              }
            }}
          />

        </div>
      </div>
      
    </div>
  );
}