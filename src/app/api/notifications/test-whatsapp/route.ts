import { NextResponse } from "next/server";
import { whatsappService } from "@/services/whatsapp/whatsapp.service";

export async function POST(request: Request) {
  try {
    const { phone } = await request.json();
    const result = await whatsappService.sendVisitorInvitation({
      phone: phone || "+91 98765 00000",
      visitorName: "Test Guest",
      hostName: "Marcus Vance",
      date: "Today",
      time: "11:00 AM",
      location: "Boardroom Alpha",
      qrPassUrl: "http://localhost:3000/pass/ENTRIVO-INV-APEX-101",
    });

    return NextResponse.json({ success: true, result });
  } catch (error) {
    return NextResponse.json({ error: "Failed to send test WhatsApp message" }, { status: 500 });
  }
}
