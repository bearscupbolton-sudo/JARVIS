import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage } from "pdf-lib";
import type { OnboardingSubmission, OnboardingInvite } from "@shared/schema";

const MARGIN = 50;
const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const CONTENT_WIDTH = PAGE_WIDTH - 2 * MARGIN;

function drawText(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  font: PDFFont,
  size: number,
  color = rgb(0, 0, 0),
) {
  page.drawText(text, { x, y, size, font, color });
}

function drawBox(
  page: PDFPage,
  x: number,
  y: number,
  w: number,
  h: number,
  filled = false,
) {
  page.drawRectangle({
    x,
    y,
    width: w,
    height: h,
    borderColor: rgb(0, 0, 0),
    borderWidth: 0.5,
    color: filled ? rgb(0, 0, 0) : undefined,
  });
}

function drawLine(page: PDFPage, x1: number, y1: number, x2: number, y2: number) {
  page.drawLine({
    start: { x: x1, y: y1 },
    end: { x: x2, y: y2 },
    thickness: 0.5,
    color: rgb(0.4, 0.4, 0.4),
  });
}

function formatCurrency(amount: number | null | undefined): string {
  if (!amount) return "$0";
  return `$${amount.toLocaleString()}`;
}

function formatSSN(ssn: string | null): string {
  if (!ssn) return "___-__-____";
  const digits = ssn.replace(/\D/g, "");
  if (digits.length === 9) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
  }
  return ssn;
}

export async function generateW4PDF(
  submission: OnboardingSubmission,
  invite: OnboardingInvite,
  decryptedSSN: string | null,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const fontItalic = await doc.embedFont(StandardFonts.HelveticaOblique);

  const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  const headerColor = rgb(0.1, 0.1, 0.4);
  const labelColor = rgb(0.3, 0.3, 0.3);
  const valueColor = rgb(0, 0, 0);

  drawText(page, "Form W-4", MARGIN, y, fontBold, 20, headerColor);
  drawText(page, "Employee's Withholding Certificate", MARGIN + 130, y + 2, font, 12, headerColor);
  y -= 16;
  drawText(page, "Department of the Treasury — Internal Revenue Service", MARGIN, y, fontItalic, 8, labelColor);
  drawText(page, "2024", PAGE_WIDTH - MARGIN - 30, y + 14, fontBold, 14, headerColor);
  y -= 8;
  drawLine(page, MARGIN, y, PAGE_WIDTH - MARGIN, y);
  y -= 20;

  drawText(page, "Step 1:", MARGIN, y, fontBold, 10, headerColor);
  drawText(page, "Enter Personal Information", MARGIN + 45, y, fontBold, 10, headerColor);
  y -= 18;

  const fieldLabelSize = 8;
  const fieldValueSize = 10;

  const drawFieldRow = (label: string, value: string, yPos: number, width?: number) => {
    drawText(page, label, MARGIN, yPos + 2, font, fieldLabelSize, labelColor);
    drawText(page, value || "", MARGIN + (width || 140), yPos, font, fieldValueSize, valueColor);
    drawLine(page, MARGIN + (width || 140), yPos - 2, PAGE_WIDTH - MARGIN, yPos - 2);
    return yPos - 22;
  };

  const fullName = [submission.legalFirstName, submission.middleName, submission.legalLastName]
    .filter(Boolean)
    .join(" ");
  y = drawFieldRow("(a) Full name:", fullName, y);

  const fullAddress = [submission.address, submission.city, submission.state, submission.zipCode]
    .filter(Boolean)
    .join(", ");
  y = drawFieldRow("(b) Address:", fullAddress, y);

  y = drawFieldRow("(c) SSN:", formatSSN(decryptedSSN), y, 80);

  y -= 6;
  drawText(page, "(d) Filing status:", MARGIN, y, font, fieldLabelSize, labelColor);
  const filingStatuses = [
    { label: "Single or Married filing separately", value: "single" },
    { label: "Married filing jointly", value: "married" },
    { label: "Head of household", value: "head_of_household" },
  ];
  let statusX = MARGIN + 100;
  for (const fs of filingStatuses) {
    const isChecked =
      submission.federalFilingStatus?.toLowerCase() === fs.value ||
      submission.federalFilingStatus?.toLowerCase().replace(/_/g, " ") === fs.label.toLowerCase();
    drawBox(page, statusX, y - 2, 10, 10, isChecked);
    drawText(page, fs.label, statusX + 14, y, font, 8, valueColor);
    statusX += font.widthOfTextAtSize(fs.label, 8) + 28;
  }
  y -= 30;

  drawLine(page, MARGIN, y, PAGE_WIDTH - MARGIN, y);
  y -= 20;

  drawText(page, "Step 2:", MARGIN, y, fontBold, 10, headerColor);
  drawText(page, "Multiple Jobs or Spouse Works", MARGIN + 45, y, fontBold, 10, headerColor);
  y -= 18;

  drawBox(page, MARGIN + 10, y - 2, 10, 10, !!submission.multipleJobs);
  drawText(
    page,
    "Check here if you hold more than one job at a time, or are married filing jointly and your spouse also works.",
    MARGIN + 26,
    y,
    font,
    8,
    valueColor,
  );
  y -= 30;

  drawLine(page, MARGIN, y, PAGE_WIDTH - MARGIN, y);
  y -= 20;

  drawText(page, "Step 3:", MARGIN, y, fontBold, 10, headerColor);
  drawText(page, "Claim Dependents", MARGIN + 45, y, fontBold, 10, headerColor);
  y -= 18;

  drawText(page, "Qualifying children under 17 (× $2,000 each):", MARGIN + 10, y, font, 9, valueColor);
  drawText(
    page,
    formatCurrency(submission.dependentsChildAmount),
    PAGE_WIDTH - MARGIN - 80,
    y,
    font,
    10,
    valueColor,
  );
  y -= 18;

  drawText(page, "Other dependents (× $500 each):", MARGIN + 10, y, font, 9, valueColor);
  drawText(
    page,
    formatCurrency(submission.dependentsOtherAmount),
    PAGE_WIDTH - MARGIN - 80,
    y,
    font,
    10,
    valueColor,
  );
  y -= 18;

  const totalDependents = (submission.dependentsChildAmount ?? 0) + (submission.dependentsOtherAmount ?? 0);
  drawText(page, "Total amount from dependents:", MARGIN + 10, y, fontBold, 9, valueColor);
  drawText(page, formatCurrency(totalDependents), PAGE_WIDTH - MARGIN - 80, y, fontBold, 10, valueColor);
  y -= 26;

  drawLine(page, MARGIN, y, PAGE_WIDTH - MARGIN, y);
  y -= 20;

  drawText(page, "Step 4:", MARGIN, y, fontBold, 10, headerColor);
  drawText(page, "Other Adjustments (Optional)", MARGIN + 45, y, fontBold, 10, headerColor);
  y -= 20;

  drawText(page, "(a) Other income (not from jobs):", MARGIN + 10, y, font, 9, valueColor);
  drawText(
    page,
    formatCurrency(submission.otherIncome),
    PAGE_WIDTH - MARGIN - 80,
    y,
    font,
    10,
    valueColor,
  );
  y -= 18;

  drawText(page, "(b) Deductions (beyond standard deduction):", MARGIN + 10, y, font, 9, valueColor);
  drawText(
    page,
    formatCurrency(submission.deductions),
    PAGE_WIDTH - MARGIN - 80,
    y,
    font,
    10,
    valueColor,
  );
  y -= 18;

  drawText(page, "(c) Extra withholding per pay period:", MARGIN + 10, y, font, 9, valueColor);
  drawText(
    page,
    formatCurrency(submission.extraWithholding),
    PAGE_WIDTH - MARGIN - 80,
    y,
    font,
    10,
    valueColor,
  );
  y -= 30;

  drawLine(page, MARGIN, y, PAGE_WIDTH - MARGIN, y);
  y -= 20;

  drawText(page, "Step 5:", MARGIN, y, fontBold, 10, headerColor);
  drawText(page, "Sign Here", MARGIN + 45, y, fontBold, 10, headerColor);
  y -= 16;
  drawText(
    page,
    "Under penalties of perjury, I declare that this certificate, to the best of my knowledge and belief, is true, correct, and complete.",
    MARGIN + 10,
    y,
    fontItalic,
    7,
    labelColor,
  );
  y -= 22;

  drawText(page, "Employee Signature:", MARGIN, y + 2, font, fieldLabelSize, labelColor);
  if (submission.digitalSignature) {
    drawText(page, submission.digitalSignature, MARGIN + 110, y, fontItalic, 11, valueColor);
  }
  drawLine(page, MARGIN + 110, y - 2, PAGE_WIDTH / 2 + 30, y - 2);

  drawText(page, "Date:", PAGE_WIDTH / 2 + 60, y + 2, font, fieldLabelSize, labelColor);
  const signDate = submission.w4SignedAt
    ? new Date(submission.w4SignedAt).toLocaleDateString("en-US")
    : submission.completedAt
      ? new Date(submission.completedAt).toLocaleDateString("en-US")
      : "";
  drawText(page, signDate, PAGE_WIDTH / 2 + 90, y, font, fieldValueSize, valueColor);
  drawLine(page, PAGE_WIDTH / 2 + 90, y - 2, PAGE_WIDTH - MARGIN, y - 2);
  y -= 34;

  drawLine(page, MARGIN, y, PAGE_WIDTH - MARGIN, y);
  y -= 20;

  drawText(page, "Employers Only", MARGIN, y, fontBold, 10, headerColor);
  y -= 18;

  drawText(page, "Employer name and address:", MARGIN, y + 2, font, fieldLabelSize, labelColor);
  drawText(page, "Bear's Cup Bakehouse", MARGIN + 150, y, font, fieldValueSize, valueColor);
  y -= 20;

  drawText(page, "First date of employment:", MARGIN, y + 2, font, fieldLabelSize, labelColor);
  const hireDate = invite.createdAt ? new Date(invite.createdAt).toLocaleDateString("en-US") : "";
  drawText(page, hireDate, MARGIN + 150, y, font, fieldValueSize, valueColor);
  y -= 20;

  if (invite.hourlyWage) {
    drawText(page, "Hourly wage:", MARGIN, y + 2, font, fieldLabelSize, labelColor);
    drawText(page, `$${invite.hourlyWage}/hr`, MARGIN + 150, y, font, fieldValueSize, valueColor);
    y -= 20;
  }

  drawText(page, "EIN:", MARGIN, y + 2, font, fieldLabelSize, labelColor);
  drawText(page, "[To be filled by employer]", MARGIN + 150, y, fontItalic, 9, labelColor);
  y -= 30;

  drawText(
    page,
    `Generated by Jarvis Bakery OS on ${new Date().toLocaleDateString("en-US")} — For employer records only`,
    MARGIN,
    MARGIN - 10,
    fontItalic,
    7,
    labelColor,
  );

  return await doc.save();
}
