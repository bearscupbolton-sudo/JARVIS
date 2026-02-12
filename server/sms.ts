export async function sendSms(to: string, body: string): Promise<boolean> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !authToken || !fromNumber) {
    console.log(`[SMS stub] Would send to ${to}: ${body}`);
    return false;
  }

  try {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": "Basic " + Buffer.from(`${accountSid}:${authToken}`).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: to, From: fromNumber, Body: body }).toString(),
    });
    if (!resp.ok) {
      console.error(`[SMS] Failed to send: ${resp.status}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[SMS] Error sending:", err);
    return false;
  }
}

export async function notifyScheduleChange(
  phone: string,
  memberName: string,
  changeType: "created" | "updated" | "deleted",
  shiftDate: string,
  department: string
): Promise<boolean> {
  const messages: Record<string, string> = {
    created: `Hi ${memberName}! A new ${department} shift has been scheduled for you on ${shiftDate}. -Bear's Cup Bakehouse`,
    updated: `Hi ${memberName}! Your ${department} shift on ${shiftDate} has been updated. -Bear's Cup Bakehouse`,
    deleted: `Hi ${memberName}! Your ${department} shift on ${shiftDate} has been removed. -Bear's Cup Bakehouse`,
  };
  return sendSms(phone, messages[changeType]);
}
