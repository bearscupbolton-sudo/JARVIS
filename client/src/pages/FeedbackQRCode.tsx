import { useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Printer, QrCode, Star, MessageSquare, ArrowLeft, Download, MapPin } from "lucide-react";
import { useLocation } from "wouter";
import type { CustomerFeedback, Location } from "@shared/schema";
import { format } from "date-fns";

export default function FeedbackQRCode() {
  const [, setLocation] = useLocation();
  const printRef = useRef<HTMLDivElement>(null);
  const [selectedLocationId, setSelectedLocationId] = useState<string>("all");

  const { data: locationsList = [] } = useQuery<Location[]>({
    queryKey: ["/api/locations"],
  });

  const feedbackUrl = selectedLocationId !== "all"
    ? `${window.location.origin}/feedback?loc=${selectedLocationId}`
    : `${window.location.origin}/feedback`;

  const selectedLocationName = selectedLocationId !== "all"
    ? locationsList.find(l => l.id === Number(selectedLocationId))?.name || ""
    : "";

  const { data: feedback = [] } = useQuery<CustomerFeedback[]>({
    queryKey: ["/api/feedback"],
  });

  const avgRating = feedback.length > 0
    ? (feedback.reduce((sum, f) => sum + f.rating, 0) / feedback.length).toFixed(1)
    : "—";

  const ratingCounts = [5, 4, 3, 2, 1].map((r) => ({
    rating: r,
    count: feedback.filter((f) => f.rating === r).length,
  }));

  const handlePrint = () => {
    const printContent = printRef.current;
    if (!printContent) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    const locationLine = selectedLocationName ? `<div class="location">${selectedLocationName}</div>` : "";
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Feedback QR Code - Bear's Cup Bakehouse</title>
          <style>
            @page { size: 4in 6in; margin: 0.25in; }
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; background: white; }
            .card { text-align: center; padding: 24px; max-width: 360px; }
            .title { font-size: 22px; font-weight: 700; margin-bottom: 4px; color: #1a1a1a; }
            .location { font-size: 14px; color: #555; margin-bottom: 4px; }
            .subtitle { font-size: 13px; color: #666; margin-bottom: 20px; }
            .qr-wrap { display: inline-block; padding: 12px; border: 2px solid #e5e5e5; border-radius: 12px; margin-bottom: 16px; }
            .prompt { font-size: 15px; font-weight: 600; color: #333; margin-bottom: 4px; }
            .desc { font-size: 11px; color: #999; }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="title">Bear's Cup Bakehouse</div>
            ${locationLine}
            <div class="subtitle">We'd love your feedback!</div>
            <div class="qr-wrap">${printContent.querySelector('.qr-container')?.innerHTML || ''}</div>
            <div class="prompt">Scan to share your experience</div>
            <div class="desc">It takes less than 30 seconds</div>
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.onload = () => {
      printWindow.print();
      printWindow.close();
    };
  };

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/")} data-testid="button-back-home">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-qr-title">Customer Feedback</h1>
          <p className="text-sm text-muted-foreground">QR code for tables & feedback overview</p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <QrCode className="w-5 h-5" />
              Table QR Code
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {locationsList.length > 0 && (
              <div className="space-y-1.5">
                <label className="text-sm font-medium flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5" />
                  Generate QR for location
                </label>
                <Select value={selectedLocationId} onValueChange={setSelectedLocationId}>
                  <SelectTrigger data-testid="select-qr-location">
                    <SelectValue placeholder="Select location" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Locations (generic)</SelectItem>
                    {locationsList.map(loc => (
                      <SelectItem key={loc.id} value={String(loc.id)} data-testid={`option-location-${loc.id}`}>
                        {loc.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div ref={printRef} className="flex flex-col items-center space-y-4 p-6 bg-white dark:bg-neutral-950 rounded-xl border">
              <p className="font-semibold text-lg text-neutral-800 dark:text-neutral-100">Bear's Cup Bakehouse</p>
              {selectedLocationName && (
                <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400 -mt-2" data-testid="text-qr-location-name">{selectedLocationName}</p>
              )}
              <p className="text-sm text-neutral-500">We'd love your feedback!</p>
              <div className="qr-container p-3 bg-white rounded-lg">
                <QRCodeSVG
                  value={feedbackUrl}
                  size={200}
                  level="H"
                  includeMargin={false}
                  data-testid="qr-code-svg"
                />
              </div>
              <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Scan to share your experience</p>
              <p className="text-xs text-neutral-400">It takes less than 30 seconds</p>
            </div>

            <div className="flex gap-2">
              <Button className="flex-1" onClick={handlePrint} data-testid="button-print-qr">
                <Printer className="w-4 h-4 mr-2" />
                Print QR Code
              </Button>
              <Button variant="outline" className="flex-1" onClick={() => {
                const svg = printRef.current?.querySelector('.qr-container svg');
                if (!svg) return;
                const svgData = new XMLSerializer().serializeToString(svg);
                const blob = new Blob([svgData], { type: 'image/svg+xml' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'bears-cup-feedback-qr.svg';
                a.click();
                URL.revokeObjectURL(url);
              }} data-testid="button-download-qr">
                <Download className="w-4 h-4 mr-2" />
                Download SVG
              </Button>
            </div>

            <div className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-3">
              <p className="font-medium mb-1">Feedback page URL:</p>
              <code className="text-xs break-all" data-testid="text-feedback-url">{feedbackUrl}</code>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Star className="w-5 h-5" />
                Overview
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-6 mb-4">
                <div className="text-center">
                  <div className="text-4xl font-bold" data-testid="text-avg-rating">{avgRating}</div>
                  <div className="flex gap-0.5 justify-center mt-1">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <Star key={s} className={`w-4 h-4 ${s <= Math.round(Number(avgRating)) ? 'fill-amber-400 text-amber-400' : 'text-neutral-300'}`} />
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{feedback.length} reviews</p>
                </div>
                <div className="flex-1 space-y-1.5">
                  {ratingCounts.map(({ rating: r, count }) => (
                    <div key={r} className="flex items-center gap-2 text-sm">
                      <span className="w-3 text-right text-muted-foreground">{r}</span>
                      <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-amber-400 rounded-full transition-all"
                          style={{ width: feedback.length > 0 ? `${(count / feedback.length) * 100}%` : '0%' }}
                        />
                      </div>
                      <span className="w-6 text-right text-xs text-muted-foreground">{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="w-5 h-5" />
                Recent Feedback
              </CardTitle>
            </CardHeader>
            <CardContent>
              {feedback.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No feedback yet. Put the QR code on your tables to start collecting!
                </p>
              ) : (
                <div className="space-y-3 max-h-[400px] overflow-y-auto">
                  {feedback.slice(0, 20).map((f) => (
                    <div key={f.id} className="border rounded-lg p-3 space-y-1.5" data-testid={`card-feedback-${f.id}`}>
                      <div className="flex items-center justify-between">
                        <div className="flex gap-0.5">
                          {[1, 2, 3, 4, 5].map((s) => (
                            <Star key={s} className={`w-3.5 h-3.5 ${s <= f.rating ? 'fill-amber-400 text-amber-400' : 'text-neutral-300'}`} />
                          ))}
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {f.createdAt ? format(new Date(f.createdAt), "MMM d, h:mm a") : ""}
                        </span>
                      </div>
                      {f.comment && <p className="text-sm text-foreground">{f.comment}</p>}
                      {f.name && (
                        <p className="text-xs text-muted-foreground">— {f.name}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
