import { useState, useRef, useCallback } from "react";
import { useRoute } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, ChevronRight, CheckCircle2, User, FileText, ShieldCheck, Heart, Shield, Lock, Eye, Link2, ChevronDown, ChevronUp } from "lucide-react";
import bearLogoPath from "@assets/bear_logo_clean.png";

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD",
  "MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC",
  "SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC"
];

const STEPS = [
  { label: "Personal Info", icon: User },
  { label: "Employee Handbook", icon: FileText },
  { label: "Non-Compete", icon: ShieldCheck },
  { label: "Welcome", icon: Heart },
];

function ProgressBar({ step }: { step: number }) {
  return (
    <div className="flex items-center justify-center gap-2 mb-8" data-testid="progress-bar">
      {STEPS.map((s, i) => {
        const Icon = s.icon;
        const isActive = i === step;
        const isComplete = i < step;
        return (
          <div key={i} className="flex items-center gap-2">
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
              isActive ? "bg-amber-600 text-white" : isComplete ? "bg-green-600 text-white" : "bg-gray-200 text-gray-500"
            }`}>
              {isComplete ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Icon className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">{s.label}</span>
              <span className="sm:hidden">{i + 1}</span>
            </div>
            {i < STEPS.length - 1 && <div className={`w-6 h-0.5 ${i < step ? "bg-green-400" : "bg-gray-300"}`} />}
          </div>
        );
      })}
    </div>
  );
}

const HANDBOOK_CONTENT = `
BEAR'S CUP BAKEHOUSE — EMPLOYEE HANDBOOK

SECTION 1: WELCOME & MISSION
Welcome to Bear's Cup Bakehouse! Our mission is to craft exceptional baked goods and beverages while fostering a warm, inclusive environment for our team and community. Every team member plays a vital role in delivering on this promise.

SECTION 2: EMPLOYMENT POLICIES
2.1 Equal Opportunity Employment
Bear's Cup Bakehouse is an equal opportunity employer. We do not discriminate based on race, color, religion, sex, national origin, age, disability, or any other protected characteristic.

2.2 At-Will Employment
Employment at Bear's Cup Bakehouse is at-will, meaning either the employee or the company may end the employment relationship at any time, with or without cause or notice.

2.3 Introductory Period
New employees undergo a 90-day introductory period during which performance, attendance, and cultural fit will be evaluated. This period may be extended at management's discretion.

SECTION 3: WORKPLACE CONDUCT
3.1 Professional Standards
All team members are expected to maintain professional conduct at all times. This includes treating coworkers, customers, and vendors with respect and courtesy.

3.2 Anti-Harassment Policy
Bear's Cup Bakehouse maintains a zero-tolerance policy toward harassment of any kind. Any incidents should be reported immediately to a manager or owner.

3.3 Conflict Resolution
Disputes between team members should be addressed respectfully and directly. If resolution cannot be reached, management will mediate.

SECTION 4: ATTENDANCE & SCHEDULING
4.1 Punctuality
Team members are expected to arrive on time for all scheduled shifts. Repeated tardiness may result in disciplinary action.

4.2 Absences
If you are unable to work a scheduled shift, notify your manager as far in advance as possible. Unexcused absences may result in disciplinary action.

4.3 Schedule Changes
Schedule change requests should be submitted through the scheduling system at least 48 hours in advance when possible.

SECTION 5: DRESS CODE & APPEARANCE
5.1 Uniform Requirements
All team members must wear the provided Bear's Cup Bakehouse uniform (apron and hat/cap) during shifts. Closed-toe, non-slip shoes are required.

5.2 Personal Hygiene
Due to the nature of food service, strict personal hygiene standards must be maintained. Hair must be restrained, nails must be short and clean, and excessive jewelry is not permitted in production areas.

SECTION 6: FOOD SAFETY & SANITATION
6.1 Food Handler Certification
All team members must obtain and maintain a valid food handler's card within 30 days of hire.

6.2 Handwashing
Proper handwashing must be performed before handling food, after using the restroom, after touching face/hair, and after handling raw ingredients.

6.3 Allergen Awareness
All team members must be trained on common food allergens and cross-contamination prevention. Allergen inquiries from customers must be taken seriously and escalated to a manager if uncertain.

6.4 Temperature Control
All perishable items must be stored at proper temperatures. Cold items at 41°F or below, hot items at 135°F or above. Temperature logs must be completed as scheduled.

SECTION 7: COMPENSATION & BENEFITS
7.1 Pay Periods
Employees are paid bi-weekly. Direct deposit is available and encouraged.

7.2 Overtime
Non-exempt employees will receive overtime pay (1.5x regular rate) for hours worked beyond 40 in a workweek, in compliance with applicable laws.

7.3 Breaks
Team members working shifts of 6 hours or more are entitled to a 30-minute unpaid meal break and two 10-minute paid rest breaks.

SECTION 8: TIME OFF
8.1 Paid Time Off (PTO)
PTO accrues based on length of employment. Requests must be submitted through the scheduling system and approved by management.

8.2 Sick Leave
Sick leave is provided in accordance with applicable state and local laws.

SECTION 9: SOCIAL MEDIA & CONFIDENTIALITY
9.1 Social Media
Team members may not post negative content about the company, coworkers, or customers on social media. Photos of proprietary recipes or production processes are prohibited without authorization.

9.2 Confidentiality
Recipes, business processes, financial information, and customer data are confidential and must not be disclosed to outside parties.

SECTION 10: DISCIPLINE & TERMINATION
10.1 Progressive Discipline
Bear's Cup Bakehouse follows a progressive discipline approach: verbal warning, written warning, final warning, and termination. Severe violations may result in immediate termination.

10.2 Grounds for Immediate Termination
Theft, violence, intoxication on the job, willful destruction of property, or egregious safety violations are grounds for immediate termination.

SECTION 11: SAFETY & EMERGENCY PROCEDURES
11.1 Workplace Safety
All team members are responsible for maintaining a safe work environment. Report any hazards, injuries, or near-misses to management immediately.

11.2 Emergency Procedures
Familiarize yourself with the location of fire extinguishers, first aid kits, and emergency exits. In case of fire or emergency, follow the posted evacuation procedures.

ACKNOWLEDGMENT
By acknowledging below, I confirm that I have read and understand all policies outlined in this Employee Handbook. I understand that this handbook is not a contract and that Bear's Cup Bakehouse may modify these policies at any time.
`.trim();

const NONCOMPETE_CONTENT = `
BEAR'S CUP BAKEHOUSE — NON-COMPETE & CONFIDENTIALITY AGREEMENT

This Non-Compete and Confidentiality Agreement ("Agreement") is entered into between Bear's Cup Bakehouse ("Company") and the undersigned employee ("Employee").

1. CONFIDENTIAL INFORMATION
Employee acknowledges that during employment, they may have access to confidential and proprietary information including but not limited to:
• Recipes, formulas, and production methods
• Customer lists and customer information
• Vendor relationships and pricing agreements
• Financial data and business strategies
• Marketing plans and promotional strategies
• Employee information and operational procedures

Employee agrees to keep all such information strictly confidential during and after employment.

2. NON-COMPETE COVENANT
For a period of twelve (12) months following the termination of employment (voluntarily or involuntarily), Employee agrees not to:

a) Directly or indirectly engage in, own, manage, operate, or be employed by any bakery, café, or similar food service establishment within a fifteen (15) mile radius of any Bear's Cup Bakehouse location.

b) Solicit, recruit, or attempt to hire any current employee of Bear's Cup Bakehouse.

c) Solicit or attempt to divert any customer, vendor, or supplier of Bear's Cup Bakehouse.

3. NON-DISCLOSURE
Employee agrees not to disclose, publish, or otherwise disseminate any confidential information of the Company to any third party, either during or after employment, without prior written consent from the Company.

4. RETURN OF MATERIALS
Upon termination of employment, Employee shall immediately return all Company property, documents, records, and materials (including digital copies) containing or relating to confidential information.

5. REMEDIES
Employee acknowledges that a breach of this Agreement may cause irreparable harm to the Company. In the event of a breach, the Company shall be entitled to seek injunctive relief in addition to any other remedies available at law.

6. SEVERABILITY
If any provision of this Agreement is found to be unenforceable, the remaining provisions shall continue in full force and effect.

7. GOVERNING LAW
This Agreement shall be governed by and construed in accordance with the laws of the state in which the Employee's primary work location is situated.

8. ENTIRE AGREEMENT
This Agreement constitutes the entire agreement between the parties regarding its subject matter and supersedes all prior agreements and understandings.

By signing below, Employee acknowledges that they have read, understand, and voluntarily agree to the terms of this Non-Compete and Confidentiality Agreement.
`.trim();

export default function Onboarding() {
  const [, params] = useRoute("/onboarding/:token");
  const token = params?.token || "";
  const [step, setStep] = useState(0);

  const { data: invite, isLoading, error } = useQuery({
    queryKey: ["/api/hr/onboarding", token],
    queryFn: async () => {
      const res = await fetch(`/api/hr/onboarding/${token}`);
      if (!res.ok) throw new Error("Onboarding link not found");
      return res.json();
    },
    enabled: !!token,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-amber-50">
        <Loader2 className="w-8 h-8 animate-spin text-amber-600" />
      </div>
    );
  }

  if (error || !invite) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-amber-50">
        <Card className="max-w-md w-full mx-4">
          <CardContent className="p-8 text-center">
            <div className="text-6xl mb-4">🔗</div>
            <h2 className="text-xl font-bold text-gray-800 mb-2">Link Not Found</h2>
            <p className="text-gray-600">This onboarding link is invalid or has expired. Please contact your manager for a new link.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (invite.status === "completed") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-amber-50">
        <Card className="max-w-md w-full mx-4">
          <CardContent className="p-8 text-center">
            <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-gray-800 mb-2">Already Completed</h2>
            <p className="text-gray-600">This onboarding has already been completed. If you need assistance, contact your manager.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-50 to-orange-50">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="text-center mb-6">
          <img src={bearLogoPath} alt="Bear's Cup Bakehouse" className="w-16 h-16 mx-auto mb-3 rounded-full" />
          <h1 className="text-2xl font-bold text-gray-800" data-testid="text-onboarding-title">
            Welcome, {invite.firstName}!
          </h1>
          <p className="text-gray-600 mt-1">Let's get you set up with Bear's Cup Bakehouse</p>
          {invite.position && <p className="text-amber-700 font-medium mt-1">Position: {invite.position}</p>}
        </div>

        <ProgressBar step={step} />

        {step === 0 && <PersonalInfoStep token={token} invite={invite} onNext={() => setStep(1)} />}
        {step === 1 && <HandbookStep token={token} onNext={() => setStep(2)} />}
        {step === 2 && <NonCompeteStep token={token} onNext={() => setStep(3)} />}
        {step === 3 && <WelcomeStep invite={invite} />}
      </div>
    </div>
  );
}

function OnboardingField({ label, field, type = "text", required = false, placeholder = "", inputMode, pattern, maxLength, autoComplete, value, error, onChange }: { label: string; field: string; type?: string; required?: boolean; placeholder?: string; inputMode?: "numeric" | "tel" | "text" | "decimal"; pattern?: string; maxLength?: number; autoComplete?: string; value: any; error?: string; onChange: (field: string, value: any) => void }) {
  return (
    <div>
      <Label className="text-sm font-medium text-gray-700">{label}{required && <span className="text-red-500 ml-0.5">*</span>}</Label>
      <Input
        type={type}
        value={value}
        onChange={(e) => onChange(field, type === "number" ? parseInt(e.target.value) || 0 : e.target.value)}
        placeholder={placeholder}
        className={`mt-1 ${error ? "border-red-400" : ""}`}
        data-testid={`input-${field}`}
        {...(inputMode ? { inputMode } : {})}
        {...(pattern ? { pattern } : {})}
        {...(maxLength ? { maxLength } : {})}
        {...(autoComplete ? { autoComplete } : {})}
      />
      {error && <p className="text-red-500 text-xs mt-0.5">{error}</p>}
    </div>
  );
}

function PersonalInfoStep({ token, invite, onNext }: { token: string; invite: any; onNext: () => void }) {
  const [form, setForm] = useState({
    legalFirstName: invite.firstName || "",
    legalLastName: invite.lastName || "",
    middleName: "",
    ssn: "",
    dateOfBirth: "",
    address: "",
    city: "",
    state: "",
    zipCode: "",
    phone: "",
    personalEmail: invite.email || "",
    emergencyContactName: "",
    emergencyContactPhone: "",
    emergencyContactRelation: "",
    federalFilingStatus: "single",
    stateFilingStatus: "",
    allowances: 0,
    bankName: "",
    routingNumber: "",
    accountNumber: "",
    accountType: "checking",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submitMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        ...form,
        ssn: form.ssn.replace(/[-\s]/g, ""),
      };
      const res = await apiRequest("POST", `/api/hr/onboarding/${token}/submit`, payload);
      return res.json();
    },
    onSuccess: () => onNext(),
  });

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.legalFirstName.trim()) e.legalFirstName = "Required";
    if (!form.legalLastName.trim()) e.legalLastName = "Required";
    if (!form.ssn.trim() || !/^\d{9}$/.test(form.ssn.replace(/[-\s]/g, ""))) e.ssn = "Enter 9-digit SSN";
    if (!form.dateOfBirth) e.dateOfBirth = "Required";
    if (!form.address.trim()) e.address = "Required";
    if (!form.city.trim()) e.city = "Required";
    if (!form.state) e.state = "Required";
    if (!form.zipCode.trim() || !/^\d{5}(-\d{4})?$/.test(form.zipCode)) e.zipCode = "Enter valid ZIP";
    if (!form.phone.trim()) e.phone = "Required";
    if (!form.personalEmail.trim()) e.personalEmail = "Required";
    if (!form.emergencyContactName.trim()) e.emergencyContactName = "Required";
    if (!form.emergencyContactPhone.trim()) e.emergencyContactPhone = "Required";
    if (!form.emergencyContactRelation.trim()) e.emergencyContactRelation = "Required";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = () => {
    if (validate()) {
      submitMutation.mutate();
    }
  };

  const update = (field: string, value: any) => {
    setForm(prev => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors(prev => { const n = { ...prev }; delete n[field]; return n; });
  };

  const [securityOpen, setSecurityOpen] = useState(false);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Personal Information</CardTitle>
        <p className="text-sm text-gray-500">Fields marked with * are required.</p>
        <button
          onClick={() => setSecurityOpen(!securityOpen)}
          className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 transition-colors w-fit"
          data-testid="badge-data-security"
        >
          <Shield className="w-3.5 h-3.5" />
          Your data is protected
          {securityOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
        {securityOpen && (
          <div className="mt-3 p-4 rounded-lg bg-green-50 border border-green-200 space-y-3" data-testid="security-details">
            <div className="flex items-start gap-2">
              <Lock className="w-4 h-4 text-green-700 mt-0.5 shrink-0" />
              <div>
                <div className="text-sm font-medium text-green-800">Encrypted Before Storage</div>
                <div className="text-xs text-green-700">Your SSN, routing number, and account number are encrypted using AES-256 military-grade encryption before being stored. They are never saved in plain text.</div>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Eye className="w-4 h-4 text-green-700 mt-0.5 shrink-0" />
              <div>
                <div className="text-sm font-medium text-green-800">Masked Display</div>
                <div className="text-xs text-green-700">Only the last 4 digits of sensitive numbers are kept for verification. Managers only ever see masked values (e.g., ***-**-1234).</div>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 text-green-700 mt-0.5 shrink-0" />
              <div>
                <div className="text-sm font-medium text-green-800">Access Control</div>
                <div className="text-xs text-green-700">Only authorized managers can view submissions, and all sensitive fields are always displayed in masked format.</div>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Link2 className="w-4 h-4 text-green-700 mt-0.5 shrink-0" />
              <div>
                <div className="text-sm font-medium text-green-800">Secure Links</div>
                <div className="text-xs text-green-700">Your onboarding link is unique and single-use. Once completed, it cannot be reused to access or edit your information.</div>
              </div>
            </div>
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <h3 className="font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <User className="w-4 h-4" /> Legal Name
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <OnboardingField label="First Name" field="legalFirstName" required value={form.legalFirstName} error={errors.legalFirstName} onChange={update} />
            <OnboardingField label="Middle Name" field="middleName" value={form.middleName} error={errors.middleName} onChange={update} />
            <OnboardingField label="Last Name" field="legalLastName" required value={form.legalLastName} error={errors.legalLastName} onChange={update} />
          </div>
        </div>

        <div>
          <h3 className="font-semibold text-gray-700 mb-3">Identification</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-sm font-medium text-gray-700">Social Security Number<span className="text-red-500 ml-0.5">*</span></Label>
              <Input
                type="text"
                inputMode="numeric"
                pattern="[0-9-]*"
                maxLength={11}
                autoComplete="off"
                value={(() => {
                  const raw = form.ssn.replace(/\D/g, "");
                  if (raw.length <= 3) return raw;
                  if (raw.length <= 5) return `${raw.slice(0, 3)}-${raw.slice(3)}`;
                  return `${raw.slice(0, 3)}-${raw.slice(3, 5)}-${raw.slice(5, 9)}`;
                })()}
                onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, "").slice(0, 9);
                  update("ssn", digits);
                }}
                placeholder="XXX-XX-XXXX"
                className={`mt-1 ${errors.ssn ? "border-red-400" : ""}`}
                data-testid="input-ssn"
              />
              {errors.ssn && <p className="text-red-500 text-xs mt-0.5">{errors.ssn}</p>}
            </div>
            <OnboardingField label="Date of Birth" field="dateOfBirth" type="date" required value={form.dateOfBirth} error={errors.dateOfBirth} onChange={update} />
          </div>
        </div>

        <div>
          <h3 className="font-semibold text-gray-700 mb-3">Home Address</h3>
          <div className="space-y-3">
            <OnboardingField label="Street Address" field="address" required placeholder="123 Main Street, Apt 4" value={form.address} error={errors.address} onChange={update} />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="col-span-2 sm:col-span-2">
                <OnboardingField label="City" field="city" required value={form.city} error={errors.city} onChange={update} />
              </div>
              <div>
                <Label className="text-sm font-medium text-gray-700">State<span className="text-red-500 ml-0.5">*</span></Label>
                <Select value={form.state} onValueChange={(v) => update("state", v)}>
                  <SelectTrigger className={`mt-1 ${errors.state ? "border-red-400" : ""}`} data-testid="select-state">
                    <SelectValue placeholder="State" />
                  </SelectTrigger>
                  <SelectContent>
                    {US_STATES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
                {errors.state && <p className="text-red-500 text-xs mt-0.5">{errors.state}</p>}
              </div>
              <OnboardingField label="ZIP Code" field="zipCode" required placeholder="12345" inputMode="numeric" pattern="[0-9-]*" maxLength={10} value={form.zipCode} error={errors.zipCode} onChange={update} />
            </div>
          </div>
        </div>

        <div>
          <h3 className="font-semibold text-gray-700 mb-3">Contact Information</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <OnboardingField label="Phone Number" field="phone" type="tel" required placeholder="(555) 123-4567" value={form.phone} error={errors.phone} onChange={update} />
            <OnboardingField label="Personal Email" field="personalEmail" type="email" required value={form.personalEmail} error={errors.personalEmail} onChange={update} />
          </div>
        </div>

        <div>
          <h3 className="font-semibold text-gray-700 mb-3">Emergency Contact</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <OnboardingField label="Full Name" field="emergencyContactName" required value={form.emergencyContactName} error={errors.emergencyContactName} onChange={update} />
            <OnboardingField label="Phone Number" field="emergencyContactPhone" type="tel" required value={form.emergencyContactPhone} error={errors.emergencyContactPhone} onChange={update} />
            <OnboardingField label="Relationship" field="emergencyContactRelation" required placeholder="e.g. Spouse, Parent" value={form.emergencyContactRelation} error={errors.emergencyContactRelation} onChange={update} />
          </div>
        </div>

        <div>
          <h3 className="font-semibold text-gray-700 mb-3">Tax Information</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <Label className="text-sm font-medium text-gray-700">Federal Filing Status</Label>
              <Select value={form.federalFilingStatus} onValueChange={(v) => update("federalFilingStatus", v)}>
                <SelectTrigger className="mt-1" data-testid="select-federal-filing">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="single">Single</SelectItem>
                  <SelectItem value="married_filing_jointly">Married Filing Jointly</SelectItem>
                  <SelectItem value="married_filing_separately">Married Filing Separately</SelectItem>
                  <SelectItem value="head_of_household">Head of Household</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm font-medium text-gray-700">State Filing Status</Label>
              <Select value={form.stateFilingStatus || "same"} onValueChange={(v) => update("stateFilingStatus", v === "same" ? "" : v)}>
                <SelectTrigger className="mt-1" data-testid="select-state-filing">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="same">Same as Federal</SelectItem>
                  <SelectItem value="single">Single</SelectItem>
                  <SelectItem value="married">Married</SelectItem>
                  <SelectItem value="head_of_household">Head of Household</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <OnboardingField label="Allowances" field="allowances" type="number" placeholder="0" value={form.allowances} error={errors.allowances} onChange={update} />
          </div>
        </div>

        <div>
          <h3 className="font-semibold text-gray-700 mb-3">Direct Deposit <span className="text-gray-400 font-normal text-sm">(Optional)</span></h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <OnboardingField label="Bank Name" field="bankName" placeholder="First National Bank" value={form.bankName} error={errors.bankName} onChange={update} />
            <div>
              <Label className="text-sm font-medium text-gray-700">Account Type</Label>
              <Select value={form.accountType} onValueChange={(v) => update("accountType", v)}>
                <SelectTrigger className="mt-1" data-testid="select-account-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="checking">Checking</SelectItem>
                  <SelectItem value="savings">Savings</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm font-medium text-gray-700">Routing Number</Label>
              <Input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={9}
                autoComplete="off"
                value={form.routingNumber}
                onChange={(e) => update("routingNumber", e.target.value.replace(/\D/g, "").slice(0, 9))}
                placeholder="9-digit routing number"
                className={`mt-1 ${errors.routingNumber ? "border-red-400" : ""}`}
                data-testid="input-routingNumber"
              />
              {errors.routingNumber && <p className="text-red-500 text-xs mt-0.5">{errors.routingNumber}</p>}
            </div>
            <div>
              <Label className="text-sm font-medium text-gray-700">Account Number</Label>
              <Input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="off"
                value={form.accountNumber}
                onChange={(e) => update("accountNumber", e.target.value.replace(/\D/g, ""))}
                placeholder="Account number"
                className={`mt-1 ${errors.accountNumber ? "border-red-400" : ""}`}
                data-testid="input-accountNumber"
              />
              {errors.accountNumber && <p className="text-red-500 text-xs mt-0.5">{errors.accountNumber}</p>}
            </div>
          </div>
        </div>

        <div className="flex justify-end pt-4 border-t">
          <Button
            onClick={handleSubmit}
            disabled={submitMutation.isPending}
            className="bg-amber-600 hover:bg-amber-700 text-white px-8"
            data-testid="button-next-personal"
          >
            {submitMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Save & Continue <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function HandbookStep({ token, onNext }: { token: string; onNext: () => void }) {
  const [scrolledToBottom, setScrolledToBottom] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: customDoc } = useQuery({
    queryKey: ["/api/hr/onboarding/documents", "handbook"],
    queryFn: async () => {
      const res = await fetch("/api/hr/onboarding/documents/handbook");
      if (!res.ok) return null;
      return res.json();
    },
  });

  const handbookText = customDoc?.content || HANDBOOK_CONTENT;

  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    if (scrollTop + clientHeight >= scrollHeight - 20) {
      setScrolledToBottom(true);
    }
  }, []);

  const acknowledgeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/hr/onboarding/${token}/handbook`);
      return res.json();
    },
    onSuccess: () => onNext(),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <FileText className="w-5 h-5" /> Employee Handbook
        </CardTitle>
        <p className="text-sm text-gray-500">Please read the entire handbook below. You must scroll to the bottom before acknowledging.</p>
      </CardHeader>
      <CardContent>
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="h-96 overflow-y-auto border rounded-lg p-4 bg-white text-sm leading-relaxed whitespace-pre-wrap font-mono mb-4"
          data-testid="handbook-content"
        >
          {handbookText}
        </div>

        {!scrolledToBottom && (
          <p className="text-amber-600 text-sm text-center mb-4">
            Please scroll to the bottom of the handbook to continue
          </p>
        )}

        <div className="flex items-start gap-3 mb-4">
          <Checkbox
            id="handbook-ack"
            checked={acknowledged}
            onCheckedChange={(v) => setAcknowledged(!!v)}
            disabled={!scrolledToBottom}
            data-testid="checkbox-handbook-ack"
          />
          <Label htmlFor="handbook-ack" className={`text-sm leading-relaxed ${!scrolledToBottom ? "text-gray-400" : "text-gray-700"}`}>
            I have read and understand the Bear's Cup Bakehouse Employee Handbook. I agree to abide by all policies and procedures outlined above.
          </Label>
        </div>

        <div className="flex justify-end pt-4 border-t">
          <Button
            onClick={() => acknowledgeMutation.mutate()}
            disabled={!acknowledged || acknowledgeMutation.isPending}
            className="bg-amber-600 hover:bg-amber-700 text-white px-8"
            data-testid="button-next-handbook"
          >
            {acknowledgeMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Acknowledge & Continue <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function NonCompeteStep({ token, onNext }: { token: string; onNext: () => void }) {
  const [acknowledged, setAcknowledged] = useState(false);
  const [signature, setSignature] = useState("");

  const { data: customDoc } = useQuery({
    queryKey: ["/api/hr/onboarding/documents", "noncompete"],
    queryFn: async () => {
      const res = await fetch("/api/hr/onboarding/documents/noncompete");
      if (!res.ok) return null;
      return res.json();
    },
  });

  const nonCompeteText = customDoc?.content || NONCOMPETE_CONTENT;

  const submitMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/hr/onboarding/${token}/noncompete`, {
        digitalSignature: signature.trim(),
      });
      return res.json();
    },
    onSuccess: () => onNext(),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <ShieldCheck className="w-5 h-5" /> Non-Compete & Confidentiality Agreement
        </CardTitle>
        <p className="text-sm text-gray-500">Please read carefully and provide your digital signature.</p>
      </CardHeader>
      <CardContent>
        <div className="h-80 overflow-y-auto border rounded-lg p-4 bg-white text-sm leading-relaxed whitespace-pre-wrap font-mono mb-4" data-testid="noncompete-content">
          {nonCompeteText}
        </div>

        <div className="flex items-start gap-3 mb-4">
          <Checkbox
            id="noncompete-ack"
            checked={acknowledged}
            onCheckedChange={(v) => setAcknowledged(!!v)}
            data-testid="checkbox-noncompete-ack"
          />
          <Label htmlFor="noncompete-ack" className="text-sm leading-relaxed text-gray-700">
            I have read, understand, and voluntarily agree to the terms of the Non-Compete and Confidentiality Agreement.
          </Label>
        </div>

        <div className="mb-4">
          <Label className="text-sm font-medium text-gray-700">Digital Signature (Type your full legal name)</Label>
          <Input
            value={signature}
            onChange={(e) => setSignature(e.target.value)}
            placeholder="e.g. John Michael Smith"
            className="mt-1 font-serif italic text-lg"
            data-testid="input-signature"
          />
        </div>

        <div className="flex justify-end pt-4 border-t">
          <Button
            onClick={() => submitMutation.mutate()}
            disabled={!acknowledged || !signature.trim() || submitMutation.isPending}
            className="bg-green-600 hover:bg-green-700 text-white px-8"
            data-testid="button-submit-noncompete"
          >
            {submitMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Sign & Complete
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function WelcomeStep({ invite }: { invite: any }) {
  return (
    <Card className="border-0 shadow-lg bg-gradient-to-b from-white to-amber-50">
      <CardContent className="p-8 sm:p-12 text-center">
        <img src={bearLogoPath} alt="Bear's Cup Bakehouse" className="w-24 h-24 mx-auto mb-6 rounded-full shadow-md" />

        <h2 className="text-3xl font-bold text-gray-800 mb-2" data-testid="text-welcome-title">
          Welcome to the Family, {invite.firstName}!
        </h2>

        <div className="max-w-lg mx-auto mt-6 space-y-4 text-gray-600 leading-relaxed">
          <p>
            We're thrilled to have you join the Bear's Cup Bakehouse team.
            {invite.position && <> Your role as <strong className="text-amber-700">{invite.position}</strong> is an important part of what we do.</>}
          </p>
          <p>
            At Bear's Cup, we believe in crafting not just exceptional baked goods, but exceptional experiences — for our customers and for each other. You're now part of a team that values quality, creativity, and warmth.
          </p>
          <p>
            Your onboarding paperwork is complete! Your manager will be in touch with details about your first day, including your schedule, training plan, and everything you need to hit the ground running.
          </p>
        </div>

        <div className="mt-8 p-4 bg-amber-100/50 rounded-xl inline-block">
          <p className="text-amber-800 font-medium italic">
            "Every great loaf starts with the first fold."
          </p>
          <p className="text-amber-600 text-sm mt-1">— Bear's Cup Bakehouse</p>
        </div>

        <div className="mt-8">
          <CheckCircle2 className="w-8 h-8 text-green-500 mx-auto" />
          <p className="text-green-600 font-medium mt-2" data-testid="text-onboarding-complete">Onboarding Complete</p>
        </div>
      </CardContent>
    </Card>
  );
}
