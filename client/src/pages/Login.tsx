import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import bearLogoPath from "@assets/IMG_0207_1770933242469.jpeg";

export default function Login() {
  const handleLogin = () => {
    window.location.href = "/api/login";
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background">
      <div className="relative hidden lg:flex flex-col justify-between p-12 bg-primary text-primary-foreground overflow-hidden">
        <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1509440159596-0249088772ff?q=80&w=2072&auto=format&fit=crop')] bg-cover bg-center opacity-15"></div>
        <div className="absolute inset-0 bg-gradient-to-b from-primary/80 via-primary/60 to-primary/90"></div>
        
        <div className="relative z-10 flex items-center gap-3">
          <img src={bearLogoPath} alt="Bear's Cup Bakehouse" className="w-10 h-10 object-contain invert" />
          <span className="font-display text-2xl font-bold tracking-tight">JARVIS</span>
        </div>

        <div className="relative z-10 flex flex-col items-center text-center">
          <img src={bearLogoPath} alt="Bear's Cup Bakehouse" className="w-40 h-40 object-contain invert mb-8 opacity-90" />
          <h1 className="font-display text-5xl font-bold leading-tight mb-4">
            Bear's Cup<br />Bakehouse
          </h1>
          <p className="text-lg text-primary-foreground/70 font-light leading-relaxed max-w-md">
            Professional bakery operations, managed with precision.
          </p>
        </div>

        <div className="relative z-10 text-sm text-primary-foreground/40">
          Powered by Jarvis Bakery OS
        </div>
      </div>

      <div className="flex items-center justify-center p-8">
        <div className="w-full max-w-md space-y-8">
          <div className="text-center lg:text-left space-y-4">
            <div className="lg:hidden flex justify-center mb-6">
              <img src={bearLogoPath} alt="Bear's Cup Bakehouse" className="w-24 h-24 object-contain dark:invert" />
            </div>
            <h2 className="text-3xl font-bold tracking-tight text-foreground">Welcome back</h2>
            <p className="text-muted-foreground">Sign in to access your bakery dashboard.</p>
          </div>

          <div className="space-y-4">
            <Button 
              onClick={handleLogin}
              size="lg" 
              className="w-full h-12 text-base font-semibold shadow-lg shadow-primary/20"
              data-testid="button-login"
            >
              Sign in with Replit
              <ArrowRight className="ml-2 w-5 h-5" />
            </Button>
            
            <p className="text-xs text-center text-muted-foreground mt-8">
              Authorized personnel only.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
