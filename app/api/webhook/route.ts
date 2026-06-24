import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

// 1. THE HANDSHAKE (Meta checks if your server is alive and matches the secret token)
export async function GET(req: NextRequest) {
    const searchParams = req.nextUrl.searchParams;

    const mode = searchParams.get("hub.mode");
    const token = searchParams.get("hub.verify_token");
    const challenge = searchParams.get("hub.challenge");

    if (
        mode === "subscribe" &&
        token === process.env.VERIFY_TOKEN
    ) {
        console.log("WEBHOOK_VERIFIED successfully");
        return new NextResponse(challenge, { status: 200 });
    }

    return NextResponse.json(
        { error: "Verification failed" },
        { status: 403 }
    );
}

// 2. INIT GENAI
const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY!,
});

export async function POST(req: Request) {
    const body = await req.json();

    const message =
        body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

    if (!message) {
        return NextResponse.json({
            status: "No Message",
        });
    }

    const userText = message.text.body;

    if (!userText) {
        return NextResponse.json({
            status: "No text message",
        });
    }

    const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: userText,
    });

    const aiReply = response.text;

    if (!aiReply) {
        return NextResponse.json({
            error: "No response from Gemini",
        });
    }

    const sender = message.from;

    await sendWhatsappMessage(sender, aiReply);

    return NextResponse.json({
        success: true,
    });
}

async function sendWhatsappMessage(
    to: string,
    text: string
) {
    await fetch(
        `https://graph.facebook.com/v25.0/${process.env.PHONE_NUMBER_ID}/messages`,
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                messaging_product: "whatsapp",
                to,
                type: "text",
                text: {
                    body: text,
                },
            }),
        }
    );
}