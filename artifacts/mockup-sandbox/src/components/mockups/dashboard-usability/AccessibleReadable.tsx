import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Settings, Info, AlertTriangle, AlertCircle, CheckCircle } from 'lucide-react';

export function AccessibleReadable() {
  return (
    <div className="min-h-screen bg-gray-50 text-black font-sans pb-20">
      <div className="max-w-2xl mx-auto p-4 sm:p-6 space-y-12">
        {/* Header */}
        <header className="flex justify-between items-start pt-4 border-b-2 border-black pb-6">
          <div>
            <h1 className="text-[28px] font-bold leading-tight">Good morning, Kolby</h1>
            <p className="text-[18px] mt-2 text-gray-800">Thursday, October 24 • Flagship Location</p>
          </div>
          <Button variant="outline" className="text-[16px] h-auto py-3 px-4 border-2 border-black font-bold">
            <Settings className="w-5 h-5 mr-2" />
            Settings
          </Button>
        </header>

        {/* Pinned Announcements */}
        <section aria-label="Announcements">
          <div className="bg-amber-100 border-l-8 border-amber-500 p-6 rounded-r-lg shadow-sm">
            <div className="flex items-start gap-4">
              <Info className="w-8 h-8 text-amber-900 shrink-0" aria-hidden="true" />
              <div>
                <h2 className="text-[20px] font-bold text-amber-900 mb-2">Important Notice</h2>
                <p className="text-[18px] text-amber-950 leading-relaxed">
                  New menu items available today. Updated espresso drinks are now in the register system. Please review the new build cards before your shift.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Jarvis Briefing */}
        <section aria-labelledby="jarvis-briefing">
          <h2 id="jarvis-briefing" className="text-[20px] font-bold tracking-wider uppercase text-gray-600 mb-4 border-b border-gray-300 pb-2">
            DAILY BRIEFING
          </h2>
          <Card className="border-4 border-black shadow-none bg-white">
            <CardContent className="p-6 sm:p-8">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-16 h-16 bg-black rounded-full flex items-center justify-center text-white shrink-0" aria-hidden="true">
                  <span className="text-2xl font-bold">J</span>
                </div>
                <h3 className="text-[24px] font-bold">Jarvis OS Assistant</h3>
              </div>
              <p className="text-[20px] leading-relaxed text-black">
                Good morning, Kolby. It's 48°F and partly cloudy.
              </p>
              <ul className="mt-4 space-y-4 text-[18px] leading-relaxed list-disc list-inside pl-2">
                <li>We have one croissant dough proofing and another resting.</li>
                <li>There is an overdue lease payment to check on.</li>
                <li><strong>Today's Events:</strong> Bagels & Barks event this morning, Spaghetti Dinner Donation at 2 PM.</li>
                <li><strong>Tomorrow:</strong> 3 dozen cookies for Mel at 10 AM.</li>
              </ul>
            </CardContent>
          </Card>
        </section>

        {/* Quick Actions */}
        <section aria-labelledby="quick-actions">
          <h2 id="quick-actions" className="text-[20px] font-bold tracking-wider uppercase text-gray-600 mb-4 border-b border-gray-300 pb-2">
            QUICK ACTIONS
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Button size="lg" className="h-auto py-6 text-[18px] font-bold bg-black text-white hover:bg-gray-800">
              Clock In
            </Button>
            <Button size="lg" variant="outline" className="h-auto py-6 text-[18px] font-bold border-2 border-black hover:bg-gray-100">
              View Schedule
            </Button>
            <Button size="lg" variant="outline" className="h-auto py-6 text-[18px] font-bold border-2 border-black hover:bg-gray-100">
              Recipe Book
            </Button>
            <Button size="lg" variant="outline" className="h-auto py-6 text-[18px] font-bold border-2 border-black hover:bg-gray-100">
              Submit Request
            </Button>
          </div>
        </section>

        {/* Quick Stats */}
        <section aria-labelledby="quick-stats">
          <h2 id="quick-stats" className="text-[20px] font-bold tracking-wider uppercase text-gray-600 mb-4 border-b border-gray-300 pb-2">
            YOUR OVERVIEW
          </h2>
          <div className="grid grid-cols-2 gap-4">
            <Card className="border-2 border-black rounded-lg shadow-none text-center p-6 bg-white">
              <p className="text-[36px] font-black leading-none mb-2">3</p>
              <h3 className="text-[16px] font-bold uppercase text-gray-700">Unread Messages</h3>
            </Card>
            <Card className="border-2 border-black rounded-lg shadow-none text-center p-6 bg-white">
              <p className="text-[36px] font-black leading-none mb-2">2</p>
              <h3 className="text-[16px] font-bold uppercase text-gray-700">Upcoming Shifts</h3>
            </Card>
            <Card className="border-2 border-black rounded-lg shadow-none text-center p-6 bg-white">
              <p className="text-[36px] font-black leading-none mb-2">1</p>
              <h3 className="text-[16px] font-bold uppercase text-gray-700">Pending Time Off</h3>
            </Card>
            <Card className="border-2 border-red-700 bg-red-50 rounded-lg shadow-none text-center p-6">
              <p className="text-[36px] font-black leading-none mb-2 text-red-800">1</p>
              <h3 className="text-[16px] font-bold uppercase text-red-900">Active Problem</h3>
            </Card>
          </div>
        </section>

        {/* Pre-Shift Notes */}
        <section aria-labelledby="pre-shift-notes">
          <h2 id="pre-shift-notes" className="text-[20px] font-bold tracking-wider uppercase text-gray-600 mb-4 border-b border-gray-300 pb-2">
            MANAGER NOTES
          </h2>
          <Card className="border-2 border-black shadow-none bg-white">
            <CardContent className="p-6">
              <h3 className="text-[18px] font-bold mb-3 border-b pb-2">Read Before Shift</h3>
              <p className="text-[18px] leading-relaxed">
                Please make sure all display cases are fully restocked by 10 AM. We are expecting a large group from the local school around 10:30 AM.
              </p>
            </CardContent>
          </Card>
        </section>

        {/* Problems Tracker */}
        <section aria-labelledby="problems-tracker">
          <h2 id="problems-tracker" className="text-[20px] font-bold tracking-wider uppercase text-gray-600 mb-4 border-b border-gray-300 pb-2">
            ISSUES & PROBLEMS
          </h2>
          <div className="space-y-4">
            <Card className="border-2 border-red-700 bg-white shadow-none">
              <CardContent className="p-6 flex items-start gap-4">
                <AlertTriangle className="w-8 h-8 text-red-700 shrink-0" aria-hidden="true" />
                <div>
                  <h3 className="text-[20px] font-bold text-red-800 mb-1">Espresso Machine Leak</h3>
                  <p className="text-[16px] text-gray-800 font-bold uppercase tracking-wide bg-red-100 inline-block px-2 py-1 rounded">Critical Priority</p>
                  <p className="text-[18px] mt-3 text-black">
                    Water pooling under the right group head. Do not use right side until serviced. Technician called.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Production Today */}
        <section aria-labelledby="production-status">
          <h2 id="production-status" className="text-[20px] font-bold tracking-wider uppercase text-gray-600 mb-4 border-b border-gray-300 pb-2">
            PRODUCTION STATUS
          </h2>
          <Card className="border-2 border-black shadow-none bg-white">
            <CardContent className="p-0 divide-y-2 divide-gray-200">
              <div className="p-6 flex justify-between items-center bg-gray-50">
                <div className="text-[20px] font-bold">Croissants</div>
                <div className="text-right">
                  <div className="text-[24px] font-bold">48 / 60</div>
                  <div className="text-[16px] text-amber-700 font-bold uppercase">In Progress</div>
                </div>
              </div>
              <div className="p-6 flex justify-between items-center bg-green-50">
                <div className="text-[20px] font-bold text-green-900">Sourdough</div>
                <div className="text-right">
                  <div className="text-[24px] font-bold text-green-900">12 / 12</div>
                  <div className="text-[16px] text-green-800 font-bold uppercase">Completed</div>
                </div>
              </div>
              <div className="p-6 flex justify-between items-center bg-gray-50">
                <div className="text-[20px] font-bold">Bagels</div>
                <div className="text-right">
                  <div className="text-[24px] font-bold">24 / 36</div>
                  <div className="text-[16px] text-amber-700 font-bold uppercase">In Progress</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* My Schedule */}
        <section aria-labelledby="your-schedule">
          <h2 id="your-schedule" className="text-[20px] font-bold tracking-wider uppercase text-gray-600 mb-4 border-b border-gray-300 pb-2">
            YOUR SCHEDULE
          </h2>
          <Card className="border-2 border-black shadow-none bg-white">
            <CardContent className="p-0 divide-y-2 divide-gray-200">
              <div className="p-6">
                <p className="text-[16px] font-bold uppercase text-gray-600 mb-1">Today</p>
                <p className="text-[22px] font-bold">6:00 AM – 2:00 PM</p>
                <p className="text-[18px] text-gray-800 mt-1">Baking Team</p>
              </div>
              <div className="p-6">
                <p className="text-[16px] font-bold uppercase text-gray-600 mb-1">Tomorrow, Oct 25</p>
                <p className="text-[22px] font-bold">5:00 AM – 1:00 PM</p>
                <p className="text-[18px] text-gray-800 mt-1">Baking Team</p>
              </div>
              <div className="p-6">
                <p className="text-[16px] font-bold uppercase text-gray-600 mb-1">Saturday, Oct 26</p>
                <p className="text-[22px] font-bold">6:00 AM – 2:00 PM</p>
                <p className="text-[18px] text-gray-800 mt-1">Baking Team</p>
              </div>
            </CardContent>
          </Card>
        </section>
        
        {/* Task Lists */}
        <section aria-labelledby="task-lists">
          <h2 id="task-lists" className="text-[20px] font-bold tracking-wider uppercase text-gray-600 mb-4 border-b border-gray-300 pb-2">
            YOUR TASKS
          </h2>
          <Card className="border-2 border-black shadow-none bg-white mb-4">
            <CardContent className="p-6">
              <h3 className="text-[20px] font-bold mb-4">Opening Checklist</h3>
              <div className="space-y-4">
                <label className="flex items-start gap-4 p-4 border-2 border-gray-200 rounded cursor-pointer hover:bg-gray-50">
                  <input type="checkbox" className="w-6 h-6 mt-1 border-2 border-black rounded-sm" />
                  <span className="text-[18px] font-medium pt-1">Turn on espresso machines</span>
                </label>
                <label className="flex items-start gap-4 p-4 border-2 border-gray-200 rounded cursor-pointer hover:bg-gray-50">
                  <input type="checkbox" className="w-6 h-6 mt-1 border-2 border-black rounded-sm" />
                  <span className="text-[18px] font-medium pt-1">Pre-heat main ovens to 450°F</span>
                </label>
                <label className="flex items-start gap-4 p-4 border-2 border-gray-200 rounded cursor-pointer hover:bg-gray-50">
                  <input type="checkbox" className="w-6 h-6 mt-1 border-2 border-black rounded-sm" defaultChecked />
                  <span className="text-[18px] font-medium pt-1 line-through text-gray-500">Check pastry case temperature</span>
                </label>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Who's On Today */}
        <section aria-labelledby="team-schedule">
          <h2 id="team-schedule" className="text-[20px] font-bold tracking-wider uppercase text-gray-600 mb-4 border-b border-gray-300 pb-2">
            TEAM ON DUTY TODAY
          </h2>
          <Card className="border-2 border-black shadow-none bg-white">
            <CardContent className="p-0 divide-y-2 divide-gray-200">
              <div className="p-6">
                <h3 className="text-[18px] font-bold uppercase text-gray-600 mb-4">Kitchen</h3>
                <div className="space-y-4">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-gray-200 border-2 border-black rounded-full flex items-center justify-center text-[18px] font-bold">K</div>
                    <div>
                      <p className="text-[20px] font-bold">Kolby (You)</p>
                      <p className="text-[16px] text-gray-800">6:00 AM – 2:00 PM</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-gray-200 border-2 border-black rounded-full flex items-center justify-center text-[18px] font-bold">M</div>
                    <div>
                      <p className="text-[20px] font-bold">Maria</p>
                      <p className="text-[16px] text-gray-800">5:00 AM – 1:00 PM</p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="p-6">
                <h3 className="text-[18px] font-bold uppercase text-gray-600 mb-4">Front of House</h3>
                <div className="space-y-4">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-gray-200 border-2 border-black rounded-full flex items-center justify-center text-[18px] font-bold">J</div>
                    <div>
                      <p className="text-[20px] font-bold">James</p>
                      <p className="text-[16px] text-gray-800">7:00 AM – 3:00 PM</p>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

      </div>
    </div>
  );
}
