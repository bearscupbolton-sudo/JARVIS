import { Button } from "@/components/ui/button";
import { ChefHat, ArrowRight } from "lucide-react";

export default function Login() {
  const handleLogin = () => {
    window.location.href = "/api/login";
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background">
      {/* Left Panel - Branding */}
      <div className="relative hidden lg:flex flex-col justify-between p-12 bg-primary text-primary-foreground overflow-hidden">
        <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1509440159596-0249088772ff?q=80&w=2072&auto=format&fit=crop')] bg-cover bg-center opacity-20 mix-blend-overlay"></div>
        {/* Abstract bakery dough texture */}
        
        <div className="relative z-10 flex items-center gap-3">
          <div className="w-10 h-10 rounded bg-accent flex items-center justify-center">
            <ChefHat className="w-6 h-6 text-primary" />
          </div>
          <span className="font-display text-2xl font-bold tracking-tight">JARVIS BAKERY OS</span>
        </div>

        <div className="relative z-10 max-w-lg">
          <h1 className="font-display text-5xl font-bold leading-tight mb-6">
            Precision Baking<br />
            <span className="text-accent">Redefined.</span>
          </h1>
          <p className="text-lg text-primary-foreground/80 font-light leading-relaxed">
            Manage recipes, scale production, and streamline your bakery operations with intelligent tools designed for professional bakers.
          </p>
        </div>

        <div className="relative z-10 text-sm text-primary-foreground/50">
          © {new Date().getFullYear()} Jarvis Systems. All rights reserved.
        </div>
      </div>

      {/* Right Panel - Login */}
      <div className="flex items-center justify-center p-8">
        <div className="w-full max-w-md space-y-8">
          <div className="text-center lg:text-left">
            <h2 className="text-3xl font-bold tracking-tight text-foreground">Welcome back</h2>
            <p className="mt-2 text-muted-foreground">Sign in to access your bakery dashboard.</p>
          </div>

          <div className="space-y-4">
            <Button 
              onClick={handleLogin}
              size="lg" 
              className="w-full h-12 text-base font-semibold shadow-lg shadow-primary/20 hover:scale-[1.02] transition-transform"
            >
              Sign in with Replit
              <ArrowRight className="ml-2 w-5 h-5" />
            </Button>
            
            <p className="text-xs text-center text-muted-foreground mt-8">
              Authorized personnel only. Access logs are monitored.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
