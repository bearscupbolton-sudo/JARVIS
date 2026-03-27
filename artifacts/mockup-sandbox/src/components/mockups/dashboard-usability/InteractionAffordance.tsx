import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardFooter, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { 
  Clock, 
  MessageSquare, 
  Calendar as CalendarIcon, 
  AlertTriangle, 
  CheckCircle2, 
  Play, 
  Plus, 
  Minus, 
  Coffee, 
  Settings, 
  MapPin, 
  BellRing,
  ArrowRight,
  ChevronRight,
  Send,
  MoreVertical,
  Check,
  X,
  CreditCard,
  Ticket
} from "lucide-react";

export function InteractionAffordance() {
  const [currentTime, setCurrentTime] = useState("08:14 AM");
  const [isClockedIn, setIsClockedIn] = useState(true);
  
  // Production state
  const [production, setProduction] = useState([
    { id: 1, name: "Croissants", actual: 48, target: 60, unit: "pcs" },
    { id: 2, name: "Sourdough", actual: 12, target: 12, unit: "loaves" },
    { id: 3, name: "Bagels", actual: 24, target: 36, unit: "pcs" }
  ]);

  const updateProduction = (id: number, delta: number) => {
    setProduction(prev => 
      prev.map(p => {
        if (p.id === id) {
          const newActual = Math.max(0, p.actual + delta);
          return { ...p, actual: newActual };
        }
        return p;
      })
    );
  };

  // Problems state
  const [problems, setProblems] = useState([
    { id: 1, title: "Espresso Machine Leak", severity: "critical", location: "FOH", resolved: false },
    { id: 2, title: "Oven 2 Temp Fluctuation", severity: "high", location: "BOH", resolved: false }
  ]);

  const resolveProblem = (id: number) => {
    setProblems(prev => 
      prev.map(p => p.id === id ? { ...p, resolved: true } : p)
    );
  };

  // Messages state
  const [replyText, setReplyText] = useState("");
  const [messages, setMessages] = useState([
    { id: 1, from: "Sarah (Manager)", text: "Can you double check the inventory on whole milk?", time: "10m ago", read: false }
  ]);

  const markRead = (id: number) => {
    setMessages(prev => 
      prev.map(m => m.id === id ? { ...m, read: true } : m)
    );
  };

  const handleReply = (id: number) => {
    if (!replyText.trim()) return;
    markRead(id);
    setReplyText("");
    // In a real app, send reply
  };

  return (
    <div className="min-h-screen bg-[#FDFBF7] text-slate-900 pb-24 font-sans selection:bg-amber-200">
      {/* STICKY TOP BAR */}
      <div className="sticky top-0 z-50 bg-[#FDFBF7]/95 backdrop-blur-md border-b border-amber-900/10 px-4 py-3 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-amber-950 flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-amber-600" />
              {currentTime}
            </span>
            {isClockedIn && (
              <span className="text-xs text-amber-700/80 font-medium">Shift ends in 4h 15m</span>
            )}
          </div>
        </div>
        
        <Button 
          onClick={() => setIsClockedIn(!isClockedIn)}
          variant={isClockedIn ? "outline" : "default"}
          className={`rounded-full px-6 font-bold shadow-sm transition-all active:scale-95 ${
            isClockedIn 
              ? "border-amber-200 text-amber-900 bg-amber-50 hover:bg-amber-100" 
              : "bg-amber-600 text-white hover:bg-amber-700 shadow-amber-600/25"
          }`}
        >
          {isClockedIn ? "Clock Out" : "Clock In"}
        </Button>
      </div>

      <div className="max-w-7xl mx-auto p-4 md:p-6 lg:p-8 flex flex-col md:flex-row gap-6 lg:gap-8">
        {/* MAIN COLUMN */}
        <div className="flex-1 space-y-6">
          
          {/* HEADER */}
          <header className="flex items-start justify-between">
            <div>
              <h1 className="text-3xl md:text-4xl font-black tracking-tight text-amber-950">
                Good morning, Kolby.
              </h1>
              <div className="flex items-center gap-2 mt-2 text-amber-800/70 font-medium text-sm">
                <CalendarIcon className="w-4 h-4" />
                <span>Thursday, Oct 24</span>
                <span className="mx-1">•</span>
                <MapPin className="w-4 h-4" />
                <span className="flex items-center gap-1 cursor-pointer hover:text-amber-900 transition-colors">
                  Bear's Cup Main <ChevronRight className="w-3 h-3" />
                </span>
              </div>
            </div>
            <Button variant="ghost" size="icon" className="text-amber-900/50 hover:text-amber-900 hover:bg-amber-100/50 rounded-full h-10 w-10">
              <Settings className="w-5 h-5" />
            </Button>
          </header>

          {/* PINNED ANNOUNCEMENT */}
          <div className="bg-amber-100 border border-amber-200 rounded-xl p-4 flex items-start gap-3 shadow-sm">
            <div className="bg-amber-200 text-amber-700 p-2 rounded-lg shrink-0 mt-0.5">
              <BellRing className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-amber-900 text-sm">Pinned Notice</h3>
              <p className="text-amber-800 text-sm mt-0.5">New menu items — updated espresso drinks are now available in the POS. Please refer to the updated recipe cards.</p>
            </div>
            <Button variant="ghost" size="sm" className="text-amber-700 hover:bg-amber-200/50 -mt-1 -mr-2">Dismiss</Button>
          </div>

          {/* JARVIS BRIEFING (Actionable) */}
          <Card className="border-amber-900/10 shadow-md shadow-amber-900/5 overflow-hidden">
            <div className="bg-gradient-to-r from-amber-50 to-[#FDFBF7] p-5">
              <div className="flex items-start gap-4">
                <Avatar className="w-12 h-12 border-2 border-white shadow-sm ring-1 ring-amber-900/10">
                  <AvatarImage src="/__mockup/images/bear_logo_clean.png" />
                  <AvatarFallback className="bg-amber-200 text-amber-800 font-bold">JV</AvatarFallback>
                </Avatar>
                <div className="flex-1 space-y-4">
                  <p className="text-amber-950 font-medium leading-relaxed text-sm md:text-base">
                    Good morning, Kolby. It's 48°F and partly cloudy. Just a heads up — we've got a croissant dough proofing and another resting. There's an overdue lease payment to check on. Bagels & Barks event this morning, Spaghetti Dinner Donation at 2 PM. Tomorrow: 3 dozen cookies for Mel at 10 AM.
                  </p>
                  
                  {/* Extracted Actions */}
                  <div className="flex flex-wrap gap-2 pt-2 border-t border-amber-900/10">
                    <Button size="sm" className="bg-white border border-amber-200 text-amber-900 hover:bg-amber-50 shadow-sm rounded-full text-xs font-semibold h-8">
                      <CreditCard className="w-3.5 h-3.5 mr-1.5 text-amber-600" />
                      Pay Lease
                    </Button>
                    <Button size="sm" className="bg-white border border-amber-200 text-amber-900 hover:bg-amber-50 shadow-sm rounded-full text-xs font-semibold h-8">
                      <Ticket className="w-3.5 h-3.5 mr-1.5 text-amber-600" />
                      View Events
                    </Button>
                    <Button size="sm" className="bg-white border border-amber-200 text-amber-900 hover:bg-amber-50 shadow-sm rounded-full text-xs font-semibold h-8">
                      <CheckCircle2 className="w-3.5 h-3.5 mr-1.5 text-amber-600" />
                      Acknowledge
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </Card>

          {/* ACTION CARDS (Replacing Quick Stats) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="border-amber-900/10 shadow-sm hover:border-amber-300 transition-colors group relative overflow-hidden">
              <div className="absolute inset-y-0 left-0 w-1 bg-blue-500" />
              <CardContent className="p-4 flex flex-col h-full justify-between gap-4">
                <div>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Messages</p>
                  <div className="flex items-end gap-2">
                    <span className="text-3xl font-black text-slate-800">3</span>
                    <span className="text-sm font-medium text-slate-500 mb-1">Unread</span>
                  </div>
                </div>
                <Button className="w-full bg-blue-50 text-blue-700 hover:bg-blue-100 hover:text-blue-800 border border-blue-200 shadow-none font-bold">
                  Open Inbox <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </CardContent>
            </Card>

            <Card className="border-amber-900/10 shadow-sm hover:border-amber-300 transition-colors group relative overflow-hidden">
              <div className="absolute inset-y-0 left-0 w-1 bg-amber-500" />
              <CardContent className="p-4 flex flex-col h-full justify-between gap-4">
                <div>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Upcoming</p>
                  <div className="flex items-end gap-2">
                    <span className="text-3xl font-black text-slate-800">2</span>
                    <span className="text-sm font-medium text-slate-500 mb-1">Shifts</span>
                  </div>
                </div>
                <Button className="w-full bg-amber-50 text-amber-700 hover:bg-amber-100 hover:text-amber-800 border border-amber-200 shadow-none font-bold">
                  View Schedule <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </CardContent>
            </Card>

            <Card className="border-amber-900/10 shadow-sm hover:border-amber-300 transition-colors group relative overflow-hidden">
              <div className="absolute inset-y-0 left-0 w-1 bg-purple-500" />
              <CardContent className="p-4 flex flex-col h-full justify-between gap-4">
                <div>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Time Off</p>
                  <div className="flex items-end gap-2">
                    <span className="text-3xl font-black text-slate-800">1</span>
                    <span className="text-sm font-medium text-slate-500 mb-1">Pending</span>
                  </div>
                </div>
                <Button className="w-full bg-purple-50 text-purple-700 hover:bg-purple-100 hover:text-purple-800 border border-purple-200 shadow-none font-bold">
                  Review Request <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </CardContent>
            </Card>

            <Card className="border-amber-900/10 shadow-sm hover:border-amber-300 transition-colors group relative overflow-hidden">
              <div className="absolute inset-y-0 left-0 w-1 bg-red-500" />
              <CardContent className="p-4 flex flex-col h-full justify-between gap-4">
                <div>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Problems</p>
                  <div className="flex items-end gap-2">
                    <span className="text-3xl font-black text-slate-800">1</span>
                    <span className="text-sm font-medium text-slate-500 mb-1">Active</span>
                  </div>
                </div>
                <Button className="w-full bg-red-50 text-red-700 hover:bg-red-100 hover:text-red-800 border border-red-200 shadow-none font-bold">
                  Resolve Now <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* TIMELINE SCHEDULE (Visual instead of list) */}
          <Card className="border-amber-900/10 shadow-sm overflow-hidden">
            <CardHeader className="bg-slate-50 border-b border-slate-100 pb-4 pt-5 px-5">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  <Clock className="w-5 h-5 text-amber-600" />
                  Today's Timeline
                </CardTitle>
                <Badge variant="outline" className="bg-white border-slate-200 text-slate-600 font-semibold">
                  Kitchen Dept
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-6">
              <div className="relative pt-8 pb-4">
                {/* Time markers */}
                <div className="absolute top-0 left-0 right-0 flex justify-between text-[10px] font-bold text-slate-400 px-2">
                  <span>6 AM</span>
                  <span>9 AM</span>
                  <span>12 PM</span>
                  <span>3 PM</span>
                  <span>6 PM</span>
                </div>
                
                {/* The bar background */}
                <div className="h-10 bg-slate-100 rounded-lg relative w-full overflow-hidden border border-slate-200 inset-0">
                  {/* Current time indicator */}
                  <div 
                    className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-20"
                    style={{ left: '22%' }} // ~8:14 AM mapping roughly
                  >
                    <div className="absolute -top-1 -translate-x-1/2 w-2.5 h-2.5 rounded-full bg-red-500 border-2 border-white shadow-sm" />
                  </div>

                  {/* My Shift Block */}
                  <div 
                    className="absolute top-1 bottom-1 bg-amber-400 rounded-md shadow-sm border border-amber-500/50 flex items-center justify-center overflow-hidden group cursor-pointer transition-all hover:bg-amber-500 z-10"
                    style={{ left: '8%', width: '42%' }} // 7 AM to 12 PM approx
                  >
                    <span className="text-xs font-bold text-amber-950 px-2 truncate">7:00am - 12:00pm (Baking)</span>
                  </div>

                  {/* Prep Task Block */}
                  <div 
                    className="absolute top-1 bottom-1 bg-blue-400 rounded-md shadow-sm border border-blue-500/50 flex items-center justify-center overflow-hidden group cursor-pointer transition-all hover:bg-blue-500 z-10"
                    style={{ left: '55%', width: '15%' }} // 12:30 PM to 2 PM approx
                  >
                    <span className="text-xs font-bold text-blue-950 px-2 truncate">Prep</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* INTERACTIVE PRODUCTION TRACKER */}
          <Card className="border-amber-900/10 shadow-sm">
            <CardHeader className="bg-slate-50 border-b border-slate-100 pb-4 pt-5 px-5">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  <Coffee className="w-5 h-5 text-amber-600" />
                  Production: Bakeoffs
                </CardTitle>
                <Button size="sm" variant="ghost" className="text-amber-700 hover:text-amber-900 hover:bg-amber-100">
                  View Full List
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0 divide-y divide-slate-100">
              {production.map((item) => {
                const percent = Math.min(100, Math.round((item.actual / item.target) * 100));
                const isComplete = item.actual >= item.target;
                
                return (
                  <div key={item.id} className={`p-4 transition-colors ${isComplete ? 'bg-green-50/50' : 'hover:bg-slate-50/50'}`}>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-bold text-slate-800 flex items-center gap-2">
                            {item.name}
                            {isComplete && <CheckCircle2 className="w-4 h-4 text-green-500" />}
                          </span>
                          <span className="text-sm font-semibold text-slate-500">
                            <span className={isComplete ? "text-green-600" : "text-slate-800"}>{item.actual}</span> / {item.target} <span className="text-slate-400 font-normal">{item.unit}</span>
                          </span>
                        </div>
                        <Progress 
                          value={percent} 
                          className={`h-2.5 ${isComplete ? '[&>div]:bg-green-500' : '[&>div]:bg-amber-500'}`} 
                        />
                      </div>
                      
                      {/* INLINE ACTIONS */}
                      <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg shrink-0">
                        <Button 
                          onClick={() => updateProduction(item.id, -1)}
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 text-slate-500 hover:text-slate-800 hover:bg-white hover:shadow-sm transition-all rounded-md disabled:opacity-50"
                          disabled={item.actual <= 0}
                        >
                          <Minus className="w-4 h-4" />
                        </Button>
                        <div className="w-10 text-center font-bold text-slate-700 tabular-nums">
                          +1
                        </div>
                        <Button 
                          onClick={() => updateProduction(item.id, 1)}
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 text-amber-700 hover:text-amber-900 hover:bg-white hover:shadow-sm transition-all rounded-md"
                        >
                          <Plus className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* INLINE MESSAGES (Reply directly from dashboard) */}
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-amber-950 flex items-center gap-2 px-1">
              <MessageSquare className="w-5 h-5 text-amber-600" />
              Recent Messages
            </h2>
            
            {messages.map(msg => (
              <Card key={msg.id} className={`border-amber-900/10 shadow-sm overflow-hidden transition-all ${msg.read ? 'opacity-70' : 'ring-1 ring-blue-500/20'}`}>
                <div className={`p-4 ${msg.read ? 'bg-slate-50' : 'bg-white'}`}>
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-xs">
                        S
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-800">{msg.from}</p>
                        <p className="text-xs font-medium text-slate-500">{msg.time}</p>
                      </div>
                    </div>
                    {!msg.read && (
                      <Badge className="bg-blue-500 hover:bg-blue-600 text-[10px] px-1.5 py-0">NEW</Badge>
                    )}
                  </div>
                  <p className="text-sm text-slate-700 font-medium mb-4 pl-10">"{msg.text}"</p>
                  
                  {!msg.read ? (
                    <div className="flex gap-2 pl-10">
                      <Input 
                        placeholder="Type a quick reply..." 
                        className="h-9 text-sm border-slate-200 focus-visible:ring-blue-500"
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleReply(msg.id)}
                      />
                      <Button 
                        size="sm" 
                        onClick={() => handleReply(msg.id)}
                        className="h-9 px-3 bg-blue-600 hover:bg-blue-700"
                      >
                        <Send className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => markRead(msg.id)}
                        className="h-9 px-3 text-slate-500 hover:text-slate-800 hover:bg-slate-100"
                      >
                        <Check className="w-4 h-4 mr-1" /> Ack
                      </Button>
                    </div>
                  ) : (
                    <div className="pl-10">
                      <span className="text-xs font-semibold text-slate-400 flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Handled
                      </span>
                    </div>
                  )}
                </div>
              </Card>
            ))}
          </div>

        </div>

        {/* SIDEBAR */}
        <div className="w-full md:w-80 lg:w-96 flex flex-col gap-6">
          
          {/* HIGH VISIBILITY ACTION BUTTONS */}
          <div className="grid grid-cols-2 gap-3">
            <Button className="h-16 flex flex-col items-center justify-center gap-1 bg-white border border-amber-200 text-amber-900 hover:bg-amber-50 hover:border-amber-300 shadow-sm rounded-xl">
              <Plus className="w-5 h-5 text-amber-600" />
              <span className="text-xs font-bold">New Order</span>
            </Button>
            <Button className="h-16 flex flex-col items-center justify-center gap-1 bg-white border border-amber-200 text-amber-900 hover:bg-amber-50 hover:border-amber-300 shadow-sm rounded-xl">
              <AlertTriangle className="w-5 h-5 text-red-500" />
              <span className="text-xs font-bold">Log Issue</span>
            </Button>
            <Button className="h-16 flex flex-col items-center justify-center gap-1 bg-white border border-amber-200 text-amber-900 hover:bg-amber-50 hover:border-amber-300 shadow-sm rounded-xl">
              <Coffee className="w-5 h-5 text-amber-700" />
              <span className="text-xs font-bold">Recipes</span>
            </Button>
            <Button className="h-16 flex flex-col items-center justify-center gap-1 bg-white border border-amber-200 text-amber-900 hover:bg-amber-50 hover:border-amber-300 shadow-sm rounded-xl">
              <MoreVertical className="w-5 h-5 text-slate-500" />
              <span className="text-xs font-bold">More</span>
            </Button>
          </div>

          {/* ACTIVE PROBLEMS (Actionable cards) */}
          <div className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <h3 className="font-bold text-slate-800 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-red-500" />
                Active Problems
              </h3>
              <Badge variant="secondary" className="bg-red-100 text-red-700 hover:bg-red-100">
                {problems.filter(p => !p.resolved).length}
              </Badge>
            </div>
            
            <div className="space-y-3">
              {problems.filter(p => !p.resolved).map(problem => (
                <Card key={problem.id} className="border-red-200 bg-red-50/30 shadow-sm group">
                  <CardContent className="p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 border-red-200 text-red-700 uppercase`}>
                            {problem.severity}
                          </Badge>
                          <span className="text-[10px] font-bold text-slate-500 uppercase">{problem.location}</span>
                        </div>
                        <p className="text-sm font-bold text-slate-800 leading-tight">{problem.title}</p>
                      </div>
                      <Button 
                        size="icon" 
                        variant="ghost" 
                        onClick={() => resolveProblem(problem.id)}
                        className="h-8 w-8 text-slate-400 hover:text-green-600 hover:bg-green-100 shrink-0"
                        title="Mark Resolved"
                      >
                        <Check className="w-5 h-5" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
              
              {problems.filter(p => !p.resolved).length === 0 && (
                <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
                  <CheckCircle2 className="w-6 h-6 text-green-500 mx-auto mb-2" />
                  <p className="text-sm font-bold text-green-800">All clear!</p>
                  <p className="text-xs text-green-600 mt-1">No active problems reported.</p>
                </div>
              )}
            </div>
          </div>

          {/* WHO'S ON TODAY (Simplified & Actionable) */}
          <Card className="border-amber-900/10 shadow-sm flex-1">
            <CardHeader className="bg-slate-50 border-b border-slate-100 py-4 px-5">
              <CardTitle className="text-sm font-bold text-slate-800 flex items-center justify-between">
                Who's On Today
                <span className="text-xs font-semibold text-slate-500">6 People</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-slate-100">
                {/* Manager */}
                <div className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                  <div className="flex items-center gap-3">
                    <Avatar className="w-9 h-9 border border-amber-200">
                      <AvatarFallback className="bg-blue-100 text-blue-700 text-xs font-bold">SM</AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-sm font-bold text-slate-800 leading-none">Sarah</p>
                      <p className="text-xs font-medium text-slate-500 mt-1">Manager • 6am - 2pm</p>
                    </div>
                  </div>
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-blue-600 hover:bg-blue-50">
                    <MessageSquare className="w-4 h-4" />
                  </Button>
                </div>
                
                {/* Bakers */}
                <div className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors bg-amber-50/30">
                  <div className="flex items-center gap-3">
                    <Avatar className="w-9 h-9 border border-amber-400 ring-2 ring-amber-100 ring-offset-1">
                      <AvatarFallback className="bg-amber-100 text-amber-700 text-xs font-bold">KO</AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-sm font-bold text-slate-800 leading-none">Kolby (You)</p>
                      <p className="text-xs font-medium text-amber-600 mt-1">Baker • 7am - 3pm</p>
                    </div>
                  </div>
                </div>

                <div className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                  <div className="flex items-center gap-3">
                    <Avatar className="w-9 h-9 border border-amber-200">
                      <AvatarFallback className="bg-amber-100 text-amber-700 text-xs font-bold">AL</AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-sm font-bold text-slate-800 leading-none">Alex</p>
                      <p className="text-xs font-medium text-slate-500 mt-1">Baker • 4am - 12pm</p>
                    </div>
                  </div>
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-blue-600 hover:bg-blue-50">
                    <MessageSquare className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

        </div>
      </div>
    </div>
  );
}
