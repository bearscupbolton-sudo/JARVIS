import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Star, Send, CheckCircle2, Coffee, Heart, Mail, Loader2 } from "lucide-react";

export default function CustomerFeedback() {
  const [rating, setRating] = useState(0);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [comment, setComment] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [feedbackId, setFeedbackId] = useState<number | null>(null);
  const [jarvisResponse, setJarvisResponse] = useState<string | null>(null);
  const [submittedRating, setSubmittedRating] = useState(0);
  const [followUpEmail, setFollowUpEmail] = useState("");
  const [emailSent, setEmailSent] = useState(false);
  const [followUpToken, setFollowUpToken] = useState<string | null>(null);

  const locationId = (() => {
    const params = new URLSearchParams(window.location.search);
    const loc = params.get("loc");
    return loc ? Number(loc) : null;
  })();

  const submitMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/feedback", {
        rating,
        comment: comment.trim() || null,
        name: name.trim() || null,
        email: email.trim() || null,
        locationId,
      });
      return res.json();
    },
    onSuccess: (data: any) => {
      setFeedbackId(data.id);
      setJarvisResponse(data.jarvisResponse || null);
      setFollowUpToken(data.followUpToken || null);
      setSubmittedRating(rating);
      setSubmitted(true);
    },
  });

  const emailMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PATCH", `/api/feedback/${feedbackId}/email`, {
        email: followUpEmail.trim(),
        token: followUpToken,
      });
    },
    onSuccess: () => setEmailSent(true),
  });

  const fallbackMessage = "We truly appreciate you taking the time to share your thoughts with us. Your honesty means the world — it's how we get better. If you're still in the shop, please feel free to bring your item to the expo counter and we'll gladly make it fresh or offer a full refund, no questions asked. If you'd like us to follow up, just drop your email below and we'll personally reach out to make things right. Thank you for being part of the Bear's Cup family.";

  if (submitted) {
    if (submittedRating < 5) {
      const displayMessage = jarvisResponse || fallbackMessage;
      return (
        <div className="min-h-screen bg-gradient-to-b from-amber-50 to-orange-50 dark:from-neutral-950 dark:to-neutral-900 flex items-center justify-center p-4">
          <div className="w-full max-w-md space-y-6 animate-in fade-in duration-500">
            <div className="text-center space-y-2">
              <div className="w-16 h-16 rounded-full bg-amber-100 dark:bg-amber-900/30 mx-auto flex items-center justify-center">
                <Heart className="w-8 h-8 text-amber-700 dark:text-amber-400" />
              </div>
              <h1 className="text-xl font-bold text-neutral-800 dark:text-neutral-100" data-testid="text-jarvis-response-title">
                A message from Bear's Cup
              </h1>
            </div>

            <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-lg p-6 space-y-5 border border-neutral-200 dark:border-neutral-800">
              <p className="text-neutral-700 dark:text-neutral-300 text-[15px] leading-relaxed whitespace-pre-line" data-testid="text-jarvis-response">
                {displayMessage}
              </p>

              <div className="border-t border-neutral-100 dark:border-neutral-800 pt-4 space-y-3">
                {!emailSent ? (
                  <>
                    <div className="flex items-start gap-2">
                      <Mail className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                      <p className="text-sm text-neutral-600 dark:text-neutral-400">
                        Want us to follow up personally? Drop your email below and we'll reach out to make it right.
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Input
                        type="email"
                        placeholder="your@email.com"
                        value={followUpEmail}
                        onChange={(e) => setFollowUpEmail(e.target.value)}
                        className="flex-1"
                        data-testid="input-followup-email"
                      />
                      <Button
                        size="sm"
                        disabled={!followUpEmail.includes("@") || emailMutation.isPending}
                        onClick={() => emailMutation.mutate()}
                        data-testid="button-send-email"
                      >
                        {emailMutation.isPending ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Send className="w-4 h-4" />
                        )}
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className="flex items-center gap-2 text-green-600 dark:text-green-400" data-testid="text-email-confirmed">
                    <CheckCircle2 className="w-4 h-4" />
                    <p className="text-sm font-medium">Got it — we'll be in touch soon!</p>
                  </div>
                )}
              </div>
            </div>

            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                setSubmitted(false);
                setRating(0);
                setComment("");
                setName("");
                setEmail("");
                setFollowUpEmail("");
                setEmailSent(false);
                setJarvisResponse(null);
                setFeedbackId(null);
                setFollowUpToken(null);
              }}
              data-testid="button-submit-another"
            >
              Leave Another Review
            </Button>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-gradient-to-b from-amber-50 to-orange-50 dark:from-neutral-950 dark:to-neutral-900 flex items-center justify-center p-4">
        <div className="text-center max-w-md space-y-6 animate-in fade-in duration-500">
          <div className="w-20 h-20 rounded-full bg-green-100 dark:bg-green-900/30 mx-auto flex items-center justify-center">
            <CheckCircle2 className="w-10 h-10 text-green-600 dark:text-green-400" />
          </div>
          <h1 className="text-2xl font-bold text-neutral-800 dark:text-neutral-100" data-testid="text-feedback-thanks">
            Thank You!
          </h1>
          <p className="text-neutral-600 dark:text-neutral-400">
            We appreciate your feedback. It helps us make your experience even better.
          </p>
          <Button
            variant="outline"
            onClick={() => {
              setSubmitted(false);
              setRating(0);
              setComment("");
              setName("");
              setEmail("");
              setFollowUpEmail("");
              setEmailSent(false);
              setJarvisResponse(null);
              setFeedbackId(null);
              setFollowUpToken(null);
            }}
            data-testid="button-submit-another"
          >
            Leave Another Review
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-50 to-orange-50 dark:from-neutral-950 dark:to-neutral-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center space-y-2">
          <div className="w-16 h-16 rounded-full bg-amber-100 dark:bg-amber-900/30 mx-auto flex items-center justify-center">
            <Coffee className="w-8 h-8 text-amber-700 dark:text-amber-400" />
          </div>
          <h1 className="text-2xl font-bold text-neutral-800 dark:text-neutral-100" data-testid="text-feedback-title">
            Bear's Cup Bakehouse
          </h1>
          <p className="text-neutral-600 dark:text-neutral-400">
            How was your visit today?
          </p>
        </div>

        <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-lg p-6 space-y-6 border border-neutral-200 dark:border-neutral-800">
          <div className="space-y-3">
            <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300 block text-center">
              Tap a star to rate your experience
            </label>
            <div className="flex justify-center gap-2" data-testid="rating-stars">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(star)}
                  onMouseEnter={() => setHoveredRating(star)}
                  onMouseLeave={() => setHoveredRating(0)}
                  className="p-1 transition-transform hover:scale-110 active:scale-95"
                  data-testid={`button-star-${star}`}
                >
                  <Star
                    className={`w-10 h-10 transition-colors ${
                      star <= (hoveredRating || rating)
                        ? "fill-amber-400 text-amber-400"
                        : "text-neutral-300 dark:text-neutral-600"
                    }`}
                  />
                </button>
              ))}
            </div>
            {rating > 0 && (
              <p className="text-center text-sm text-neutral-500 dark:text-neutral-400">
                {rating === 1 && "We're sorry to hear that."}
                {rating === 2 && "We'll work to do better."}
                {rating === 3 && "Thanks for the honest feedback."}
                {rating === 4 && "Glad you enjoyed it!"}
                {rating === 5 && "Amazing! We're so happy!"}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Tell us more (optional)
            </label>
            <Textarea
              placeholder="What did you love? What could be better?"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
              className="resize-none"
              data-testid="input-feedback-comment"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Your name (optional)
            </label>
            <Input
              placeholder="First name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              data-testid="input-feedback-name"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Email address (optional)
            </label>
            <Input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              data-testid="input-feedback-email"
            />
          </div>

          <Button
            className="w-full"
            size="lg"
            disabled={rating === 0 || submitMutation.isPending}
            onClick={() => submitMutation.mutate()}
            data-testid="button-submit-feedback"
          >
            {submitMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Send className="w-4 h-4 mr-2" />
                Submit Feedback
              </>
            )}
          </Button>

          {submitMutation.isError && (
            <p className="text-sm text-red-500 text-center" data-testid="text-feedback-error">
              Something went wrong. Please try again.
            </p>
          )}
        </div>

        <p className="text-center text-xs text-neutral-400 dark:text-neutral-600">
          Your feedback is anonymous unless you choose to share your name.
        </p>
      </div>
    </div>
  );
}