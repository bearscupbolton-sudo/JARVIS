import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Bot, Sparkles, Calendar, Shield, Check, X, Plus, Lock, Users, Heart } from "lucide-react";
import type { User } from "@shared/models/auth";

const SUGGESTED_INTERESTS = [
  "Sports", "Cooking", "Music", "Travel", "Fitness",
  "Movies", "Reading", "Gaming", "Photography", "Gardening",
  "Hiking", "Art", "Yoga", "Pets", "Tech",
  "Football", "Basketball", "Baseball", "Soccer", "Hockey",
  "Baking", "Wine", "Coffee", "Board Games", "Crafts",
];

export default function InterestCollectionOverlay({ user }: { user: User }) {
  const [visible, setVisible] = useState(false);
  const [fadeIn, setFadeIn] = useState(false);
  const [step, setStep] = useState(1);
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
  const [customInterest, setCustomInterest] = useState("");

  useEffect(() => {
    if (!user.interestsCollected && user.seenJarvisIntro && !user.globalAckRequired) {
      setVisible(true);
      requestAnimationFrame(() => setFadeIn(true));
    }
  }, [user.interestsCollected, user.seenJarvisIntro, user.globalAckRequired]);

  const submitMutation = useMutation({
    mutationFn: async (data: { interests: string[]; personalizedGreetingsEnabled: boolean }) => {
      await apiRequest("POST", "/api/user/interests-collected", data);
    },
    onSuccess: () => {
      setFadeIn(false);
      setTimeout(() => {
        setVisible(false);
        queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      }, 300);
    },
  });

  const skipMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/user/interests-collected", {
        interests: [],
        personalizedGreetingsEnabled: false,
        skipped: true,
      });
    },
    onSuccess: () => {
      setFadeIn(false);
      setTimeout(() => {
        setVisible(false);
        queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      }, 300);
    },
  });

  if (!visible) return null;

  const toggleInterest = (interest: string) => {
    setSelectedInterests(prev =>
      prev.includes(interest)
        ? prev.filter(i => i !== interest)
        : [...prev, interest]
    );
  };

  const addCustomInterest = () => {
    const trimmed = customInterest.trim();
    if (trimmed && !selectedInterests.includes(trimmed)) {
      setSelectedInterests(prev => [...prev, trimmed]);
      setCustomInterest("");
    }
  };

  const totalSteps = 4;

  return (
    <div
      className={`fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm transition-opacity duration-300 ${fadeIn ? "opacity-100" : "opacity-0"}`}
      data-testid="interest-collection-overlay"
    >
      <div className={`w-full max-w-lg mx-4 transition-all duration-500 ${fadeIn ? "translate-y-0 scale-100" : "translate-y-4 scale-95"}`}>
        <div className="bg-neutral-900 rounded-2xl shadow-2xl border border-neutral-700/50 overflow-hidden">
          <div className="px-6 pt-6 pb-4 flex items-center justify-between border-b border-neutral-800">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center">
                <Bot className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white" data-testid="text-interest-title">
                  {step === 1 && "Personalize Your Experience"}
                  {step === 2 && "Your Personal Calendar"}
                  {step === 3 && "Your Data is Safe"}
                  {step === 4 && "You're All Set!"}
                </h2>
                <p className="text-xs text-neutral-400">Step {step} of {totalSteps}</p>
              </div>
            </div>
            <button
              onClick={() => skipMutation.mutate()}
              disabled={skipMutation.isPending}
              className="text-neutral-500 hover:text-neutral-300 transition-colors"
              data-testid="button-interest-skip"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="w-full bg-neutral-800 h-1">
            <div
              className="bg-amber-500 h-1 transition-all duration-500"
              style={{ width: `${(step / totalSteps) * 100}%` }}
            />
          </div>

          <div className="px-6 py-5 max-h-[60vh] overflow-y-auto">
            {step === 1 && (
              <div className="space-y-4">
                <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                  <Sparkles className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-neutral-300 leading-relaxed" data-testid="text-interest-intro">
                    Jarvis can give you a personalized greeting each day based on your interests outside of work — things like sports scores, hobby updates, or topics you care about. It's completely optional!
                  </p>
                </div>

                <div>
                  <p className="text-sm font-medium text-neutral-200 mb-3">Select interests that matter to you:</p>
                  <div className="flex flex-wrap gap-2" data-testid="container-interest-suggestions">
                    {SUGGESTED_INTERESTS.map(interest => (
                      <button
                        key={interest}
                        onClick={() => toggleInterest(interest)}
                        className={`px-3 py-1.5 rounded-full text-sm transition-all ${
                          selectedInterests.includes(interest)
                            ? "bg-amber-500 text-black font-medium"
                            : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
                        }`}
                        data-testid={`button-interest-${interest.toLowerCase().replace(/\s+/g, '-')}`}
                      >
                        {selectedInterests.includes(interest) && <Check className="w-3 h-3 inline mr-1" />}
                        {interest}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex gap-2">
                  <Input
                    value={customInterest}
                    onChange={e => setCustomInterest(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && addCustomInterest()}
                    placeholder="Add your own..."
                    className="bg-neutral-800 border-neutral-700 text-white placeholder:text-neutral-500"
                    data-testid="input-custom-interest"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={addCustomInterest}
                    disabled={!customInterest.trim()}
                    className="border-neutral-700 text-neutral-300 hover:bg-neutral-800"
                    data-testid="button-add-custom-interest"
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>

                {selectedInterests.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs text-neutral-400">Your selections ({selectedInterests.length}):</p>
                    <div className="flex flex-wrap gap-1.5" data-testid="container-selected-interests">
                      {selectedInterests.map(interest => (
                        <Badge
                          key={interest}
                          variant="secondary"
                          className="bg-amber-500/20 text-amber-300 border-amber-500/30 cursor-pointer hover:bg-amber-500/30"
                          onClick={() => toggleInterest(interest)}
                          data-testid={`badge-selected-${interest.toLowerCase().replace(/\s+/g, '-')}`}
                        >
                          {interest}
                          <X className="w-3 h-3 ml-1" />
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4">
                <div className="flex items-start gap-3 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                  <Calendar className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-neutral-300 leading-relaxed" data-testid="text-calendar-intro">
                    The Jarvis Calendar supports personal events alongside team events. Here's how it works:
                  </p>
                </div>

                <div className="space-y-3">
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-neutral-800/50">
                    <Lock className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-neutral-200">Private Events</p>
                      <p className="text-xs text-neutral-400 mt-0.5">
                        Mark events as personal with the lock icon. Only you can see the details — the team just sees that you're unavailable.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 p-3 rounded-lg bg-neutral-800/50">
                    <Users className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-neutral-200">Department & Individual Invitations</p>
                      <p className="text-xs text-neutral-400 mt-0.5">
                        Invite entire departments or specific team members to events. Everyone tagged gets a notification.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 p-3 rounded-lg bg-neutral-800/50">
                    <Heart className="w-4 h-4 text-pink-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-neutral-200">Birthdays & Celebrations</p>
                      <p className="text-xs text-neutral-400 mt-0.5">
                        Add your birthday in your Profile and it'll automatically show up on the team calendar.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-4">
                <div className="flex items-start gap-3 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                  <Shield className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-neutral-300 leading-relaxed" data-testid="text-security-intro">
                    Your personal data is handled with care. Here's how Jarvis protects your information:
                  </p>
                </div>

                <div className="space-y-3">
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-neutral-800/50">
                    <Shield className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-neutral-200">Encrypted & Secure</p>
                      <p className="text-xs text-neutral-400 mt-0.5">
                        All personal data is stored securely and encrypted in transit. Your interests are only used to personalize your experience.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 p-3 rounded-lg bg-neutral-800/50">
                    <Lock className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-neutral-200">You're in Control</p>
                      <p className="text-xs text-neutral-400 mt-0.5">
                        You can turn off personalized greetings, remove interests, or clear all personal data anytime from your Profile page.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 p-3 rounded-lg bg-neutral-800/50">
                    <Users className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-neutral-200">Private & Secure</p>
                      <p className="text-xs text-neutral-400 mt-0.5">
                        Your interests are never shared with other team members. They are only used by Jarvis (via AI) to personalize your greetings.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {step === 4 && (
              <div className="space-y-4 text-center">
                <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto">
                  <Check className="w-8 h-8 text-emerald-400" />
                </div>
                <div>
                  <p className="text-lg font-semibold text-white" data-testid="text-interest-confirmation">
                    {selectedInterests.length > 0
                      ? "Personalized greetings are ready!"
                      : "You're all set!"}
                  </p>
                  <p className="text-sm text-neutral-400 mt-2 leading-relaxed" data-testid="text-interest-confirmation-detail">
                    {selectedInterests.length > 0
                      ? "Jarvis will weave your interests into your daily briefing. You can update your interests or turn off personalized greetings anytime from your Profile page."
                      : "No interests selected — that's totally fine! If you change your mind, you can add interests and enable personalized greetings from your Profile page anytime."}
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="px-6 pb-6 flex gap-3">
            {step > 1 && step < 4 && (
              <Button
                variant="outline"
                className="flex-1 border-neutral-700 text-neutral-300 hover:bg-neutral-800"
                onClick={() => setStep(s => s - 1)}
                data-testid="button-interest-back"
              >
                Back
              </Button>
            )}

            {step < 4 && (
              <Button
                className="flex-1 bg-amber-500 hover:bg-amber-600 text-black font-semibold"
                onClick={() => setStep(s => s + 1)}
                data-testid="button-interest-next"
              >
                {step === 1 ? (selectedInterests.length > 0 ? "Next" : "Skip & Continue") : "Next"}
              </Button>
            )}

            {step === 4 && (
              <Button
                className="flex-1 bg-amber-500 hover:bg-amber-600 text-black font-semibold"
                onClick={() => submitMutation.mutate({
                  interests: selectedInterests,
                  personalizedGreetingsEnabled: selectedInterests.length > 0,
                })}
                disabled={submitMutation.isPending}
                data-testid="button-interest-finish"
              >
                {submitMutation.isPending ? "Saving..." : "Let's go!"}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
