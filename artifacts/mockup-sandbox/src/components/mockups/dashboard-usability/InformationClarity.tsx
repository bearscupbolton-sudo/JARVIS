import React from "react";
import { 
  Sun, AlertCircle, AlertTriangle, CheckCircle2,
  Calendar, Clock, CheckSquare, Package, 
  MessageSquare, Settings, Users, ChefHat, Coffee,
  MapPin, BellRing
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";

export function InformationClarity() {
  return (
    <div className="min-h-screen bg-[#FDFBF7] text-stone-900 pb-12 font-sans">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-[#FDFBF7]/90 backdrop-blur-md border-b border-stone-200 px-6 py-4 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-stone-900">Good morning, Kolby</h1>
          <div className="flex items-center text-stone-500 text-sm mt-1 gap-3">
            <span className="flex items-center gap-1"><Calendar className="w-4 h-4" /> Tuesday, Oct 24</span>
            <span className="flex items-center gap-1"><MapPin className="w-4 h-4" /> Bear's Cup - Downtown</span>
          </div>
        </div>
        <Button variant="ghost" size="icon" className="text-stone-500">
          <Settings className="w-5 h-5" />
        </Button>
      </header>

      <main className="max-w-5xl mx-auto px-6 mt-6 space-y-8">
        
        {/* TOP ZONE: Priority Strip & Jarvis Briefing */}
        <section className="space-y-4">
          {/* Pinned Announcements */}
          <div className="bg-amber-100 border-l-4 border-amber-500 p-4 rounded-r-lg flex items-start gap-3 shadow-sm">
            <BellRing className="w-5 h-5 text-amber-700 mt-0.5 shrink-0" />
            <div>
              <h4 className="font-semibold text-amber-900 text-sm">Pinned Announcement</h4>
              <p className="text-amber-800 text-sm mt-1">New menu items — updated espresso drinks available starting today. Check the updated SOPs.</p>
            </div>
          </div>

          {/* Jarvis Briefing */}
          <Card className="bg-stone-900 text-stone-50 border-none shadow-md overflow-hidden">
            <CardContent className="p-6">
              <div className="flex items-start gap-4">
                <Avatar className="w-12 h-12 border-2 border-stone-700 bg-stone-800 shrink-0">
                  <AvatarFallback className="bg-stone-800 text-2xl">🐻</AvatarFallback>
                </Avatar>
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-bold text-stone-100">Jarvis Briefing</h2>
                    <Badge variant="secondary" className="bg-amber-500/20 text-amber-200 hover:bg-amber-500/30 border-amber-500/30">AI Morning Summary</Badge>
                  </div>
                  <p className="text-stone-300 leading-relaxed text-lg">
                    Good morning, Kolby. It's 48°F and partly cloudy. Just a heads up — we've got a croissant dough proofing and another resting. There's an overdue lease payment to check on. <strong className="text-white">Bagels &amp; Barks</strong> event this morning, <strong className="text-white">Spaghetti Dinner Donation</strong> at 2 PM. Tomorrow: 3 dozen cookies for Mel at 10 AM.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Pre-Shift Notes */}
          <div className="bg-stone-100 border border-stone-200 p-4 rounded-xl">
            <h4 className="font-semibold text-stone-900 text-sm mb-1">Pre-Shift Notes from Manager</h4>
            <p className="text-stone-700 text-sm">Please make sure to double check the espresso machine calibration this morning, it was running a bit fast yesterday afternoon.</p>
          </div>

          {/* Priority Alerts */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-red-50 border border-red-200 p-4 rounded-xl flex items-center gap-4">
              <div className="bg-red-100 p-3 rounded-full shrink-0">
                <AlertCircle className="w-6 h-6 text-red-600" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-red-900 text-lg">Critical Issue</h3>
                  <Badge variant="destructive" className="bg-red-500">Action Required</Badge>
                </div>
                <p className="text-red-700 text-sm font-medium mt-1">Espresso Machine Leak - Main Bar</p>
              </div>
              <Button size="sm" variant="outline" className="ml-auto bg-white border-red-200 text-red-700 hover:bg-red-50">View</Button>
            </div>
            
            <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl flex items-center gap-4">
              <div className="bg-amber-100 p-3 rounded-full shrink-0">
                <AlertTriangle className="w-6 h-6 text-amber-600" />
              </div>
              <div>
                <h3 className="font-bold text-amber-900 text-lg">Needs Attention</h3>
                <p className="text-amber-800 text-sm font-medium mt-1">3 Unread Messages • 1 Pending Time Off</p>
              </div>
              <Button size="sm" variant="outline" className="ml-auto bg-white border-amber-200 text-amber-700 hover:bg-amber-50">Resolve</Button>
            </div>
          </div>
        </section>


        {/* MIDDLE ZONE: 3-Column Card Grid */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
          
          {/* My Schedule */}
          <Card className="border-stone-200 shadow-sm bg-white flex flex-col">
            <CardHeader className="pb-3 border-b border-stone-100">
              <CardTitle className="text-lg flex items-center gap-2">
                <Clock className="w-5 h-5 text-stone-400" />
                My Schedule
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 flex-1">
              <div className="divide-y divide-stone-100">
                <div className="p-4 flex flex-col gap-1 hover:bg-stone-50 transition-colors">
                  <span className="text-xs font-semibold text-amber-600 uppercase tracking-wider">Today</span>
                  <div className="flex justify-between items-center">
                    <span className="font-medium text-stone-900 text-base">6:00 AM - 2:00 PM</span>
                    <Badge variant="outline" className="bg-stone-100 text-stone-600">Lamination</Badge>
                  </div>
                </div>
                <div className="p-4 flex flex-col gap-1 hover:bg-stone-50 transition-colors">
                  <span className="text-xs font-semibold text-stone-500 uppercase tracking-wider">Tomorrow</span>
                  <div className="flex justify-between items-center">
                    <span className="font-medium text-stone-900 text-base">6:00 AM - 2:00 PM</span>
                    <Badge variant="outline" className="bg-stone-100 text-stone-600">Lamination</Badge>
                  </div>
                </div>
                <div className="p-4 flex flex-col gap-1 hover:bg-stone-50 transition-colors">
                  <span className="text-xs font-semibold text-stone-500 uppercase tracking-wider">Thursday</span>
                  <div className="flex justify-between items-center">
                    <span className="font-medium text-stone-900 text-base">8:00 AM - 4:00 PM</span>
                    <Badge variant="outline" className="bg-stone-100 text-stone-600">Prep</Badge>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Production Progress */}
          <Card className="border-stone-200 shadow-sm bg-white flex flex-col">
            <CardHeader className="pb-3 border-b border-stone-100 flex flex-row items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <ChefHat className="w-5 h-5 text-stone-400" />
                Production Today
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-5 flex-1">
              <div>
                <div className="flex justify-between text-sm mb-1.5">
                  <span className="font-medium text-stone-700">Croissants</span>
                  <span className="text-stone-500 font-medium">48 / 60</span>
                </div>
                <div className="h-2.5 w-full bg-stone-100 rounded-full overflow-hidden">
                  <div className="h-full bg-amber-500 rounded-full" style={{ width: '80%' }}></div>
                </div>
              </div>
              
              <div>
                <div className="flex justify-between text-sm mb-1.5">
                  <span className="font-medium text-stone-700">Sourdough</span>
                  <span className="text-emerald-600 font-bold flex items-center gap-1">12 / 12 <CheckCircle2 className="w-3.5 h-3.5" /></span>
                </div>
                <div className="h-2.5 w-full bg-stone-100 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500 rounded-full" style={{ width: '100%' }}></div>
                </div>
              </div>
              
              <div>
                <div className="flex justify-between text-sm mb-1.5">
                  <span className="font-medium text-stone-700">Bagels</span>
                  <span className="text-stone-500 font-medium">24 / 36</span>
                </div>
                <div className="h-2.5 w-full bg-stone-100 rounded-full overflow-hidden">
                  <div className="h-full bg-amber-500 rounded-full" style={{ width: '66%' }}></div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Staff on Today */}
          <Card className="border-stone-200 shadow-sm bg-white flex flex-col">
            <CardHeader className="pb-3 border-b border-stone-100">
              <CardTitle className="text-lg flex items-center gap-2">
                <Users className="w-5 h-5 text-stone-400" />
                Who's On Today
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-4 flex-1">
              <div className="space-y-3">
                <h4 className="text-xs font-semibold text-stone-500 uppercase tracking-wider">FOH / Cafe</h4>
                <div className="flex items-center gap-3">
                  <Avatar className="w-8 h-8 border border-stone-200"><AvatarFallback className="bg-stone-100 text-stone-600 text-xs">SJ</AvatarFallback></Avatar>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-stone-900">Sarah J.</p>
                    <p className="text-xs text-stone-500">6:00 AM - 2:00 PM</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Avatar className="w-8 h-8 border border-stone-200"><AvatarFallback className="bg-stone-100 text-stone-600 text-xs">MK</AvatarFallback></Avatar>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-stone-900">Mike K.</p>
                    <p className="text-xs text-stone-500">7:00 AM - 3:00 PM</p>
                  </div>
                </div>
              </div>
              
              <div className="space-y-3 pt-2">
                <h4 className="text-xs font-semibold text-stone-500 uppercase tracking-wider">BOH / Kitchen</h4>
                <div className="flex items-center gap-3">
                  <Avatar className="w-8 h-8 border border-stone-200 bg-amber-100"><AvatarFallback className="bg-amber-100 text-amber-800 text-xs">KB</AvatarFallback></Avatar>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-stone-900">Kolby (You)</p>
                    <p className="text-xs text-stone-500">6:00 AM - 2:00 PM</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

        </section>


        {/* BOTTOM ZONE: Collapsible Secondary Info */}
        <section>
          <Card className="border-stone-200 shadow-sm bg-white overflow-hidden">
            <Accordion type="single" collapsible className="w-full" defaultValue="forward-look">
              
              <AccordionItem value="forward-look" className="border-b border-stone-100 px-4">
                <AccordionTrigger className="hover:no-underline py-4 text-stone-700 hover:text-stone-900">
                  <div className="flex items-center gap-3">
                    <Calendar className="w-5 h-5 text-stone-400" />
                    <span className="font-semibold text-base">Forward Look &amp; Events</span>
                    <Badge variant="secondary" className="ml-2 bg-stone-100 text-stone-600 font-normal">Next 5 Days</Badge>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="pb-4 pt-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
                    {/* Mock Calendar Days */}
                    <div className="bg-stone-50 rounded-lg p-3 border border-stone-100">
                      <p className="text-xs font-medium text-stone-500 uppercase mb-2">Today</p>
                      <div className="space-y-2">
                        <div className="text-xs p-2 bg-white border border-stone-200 rounded text-stone-800 font-medium">Bagels &amp; Barks Event</div>
                        <div className="text-xs p-2 bg-white border border-stone-200 rounded text-stone-800 font-medium">Spaghetti Dinner (2 PM)</div>
                      </div>
                    </div>
                    <div className="bg-stone-50 rounded-lg p-3 border border-stone-100">
                      <p className="text-xs font-medium text-stone-500 uppercase mb-2">Wed</p>
                      <div className="space-y-2">
                        <div className="text-xs p-2 bg-white border border-stone-200 rounded text-stone-800 font-medium">Cookie Order - Mel (10 AM)</div>
                      </div>
                    </div>
                    <div className="bg-stone-50 rounded-lg p-3 border border-stone-100">
                      <p className="text-xs font-medium text-stone-500 uppercase mb-2">Thu</p>
                      <div className="space-y-2">
                        <div className="text-xs p-2 bg-amber-50 border border-amber-200 text-amber-800 rounded font-medium flex items-center gap-1.5"><Sun className="w-3 h-3"/> Sarah's Bday</div>
                      </div>
                    </div>
                    <div className="bg-stone-50 rounded-lg p-3 border border-stone-100">
                      <p className="text-xs font-medium text-stone-500 uppercase mb-2">Fri</p>
                      <p className="text-xs text-stone-400 italic">No events</p>
                    </div>
                    <div className="bg-stone-50 rounded-lg p-3 border border-stone-100">
                      <p className="text-xs font-medium text-stone-500 uppercase mb-2">Sat</p>
                      <div className="space-y-2">
                        <div className="text-xs p-2 bg-white border border-stone-200 rounded text-stone-800 font-medium">Farmers Market Prep</div>
                      </div>
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="tasks" className="border-b border-stone-100 px-4">
                <AccordionTrigger className="hover:no-underline py-4 text-stone-700 hover:text-stone-900">
                  <div className="flex items-center gap-3">
                    <CheckSquare className="w-5 h-5 text-stone-400" />
                    <span className="font-semibold text-base">Task Lists</span>
                    <Badge variant="secondary" className="ml-2 bg-stone-100 text-stone-600 font-normal">2 Assigned</Badge>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="pb-4 pt-2">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="border border-stone-200 rounded-lg p-4 bg-stone-50 flex justify-between items-center">
                      <div>
                        <h4 className="font-medium text-stone-900">Opening Checklist - Kitchen</h4>
                        <p className="text-sm text-stone-500 mt-0.5">8 of 12 tasks completed</p>
                      </div>
                      <Button variant="outline" size="sm">Resume</Button>
                    </div>
                    <div className="border border-stone-200 rounded-lg p-4 bg-stone-50 flex justify-between items-center">
                      <div>
                        <h4 className="font-medium text-stone-900">Lamination Station Cleaning</h4>
                        <p className="text-sm text-stone-500 mt-0.5">0 of 5 tasks completed</p>
                      </div>
                      <Button variant="outline" size="sm">Start</Button>
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="orders" className="border-b border-stone-100 px-4">
                <AccordionTrigger className="hover:no-underline py-4 text-stone-700 hover:text-stone-900">
                  <div className="flex items-center gap-3">
                    <Package className="w-5 h-5 text-stone-400" />
                    <span className="font-semibold text-base">Today's Orders &amp; Deliveries</span>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="pb-4 pt-2">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 bg-white border border-stone-200 rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="bg-stone-100 p-2 rounded-md"><Coffee className="w-4 h-4 text-stone-600"/></div>
                        <div>
                          <p className="font-medium text-stone-900 text-sm">US Foods Delivery</p>
                          <p className="text-xs text-stone-500">Expected between 8:00 AM - 11:00 AM</p>
                        </div>
                      </div>
                      <Badge variant="outline" className="text-amber-600 border-amber-200 bg-amber-50">Pending</Badge>
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="messages" className="px-4 border-none">
                <AccordionTrigger className="hover:no-underline py-4 text-stone-700 hover:text-stone-900">
                  <div className="flex items-center gap-3">
                    <MessageSquare className="w-5 h-5 text-stone-400" />
                    <span className="font-semibold text-base">Messages</span>
                    <Badge className="ml-2 bg-amber-500 text-white border-none font-medium">3 Unread</Badge>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="pb-4 pt-2">
                  <div className="space-y-2">
                    <div className="p-3 bg-stone-50 border border-stone-200 rounded-lg flex items-start gap-3">
                      <Avatar className="w-8 h-8 border border-stone-200"><AvatarFallback className="bg-stone-200 text-stone-700 text-xs">MG</AvatarFallback></Avatar>
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-sm text-stone-900">Manager Group</span>
                          <span className="text-xs text-stone-400">9:41 AM</span>
                        </div>
                        <p className="text-sm text-stone-700">Don't forget to count the pastry case before shift change.</p>
                      </div>
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>

            </Accordion>
          </Card>
        </section>

      </main>

      {/* Floating Quick Actions Mobile (Optional Desktop Footer) */}
      <div className="fixed bottom-6 right-6">
        <Button className="bg-stone-900 hover:bg-stone-800 text-white shadow-lg rounded-full px-6 py-6 h-auto text-base font-semibold flex items-center gap-2">
          <Clock className="w-5 h-5" />
          Clock In
        </Button>
      </div>

    </div>
  );
}
