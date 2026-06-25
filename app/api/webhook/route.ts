import { NextRequest, NextResponse, after } from "next/server";
import { GoogleGenAI, Type, FunctionDeclaration } from "@google/genai";
import { google } from "googleapis";

// ==========================================
// 1. GOOGLE SHEETS SETUP
// ==========================================
async function getSheetsClient() {
    return google.sheets({
        version: "v4",
        auth: await google.auth.getClient({
            projectId: process.env.GOOGLE_PROJECT_ID,
            credentials: {
                type: "service_account",
                private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
                client_email: process.env.GOOGLE_CLIENT_EMAIL,
            },
            scopes: ["https://www.googleapis.com/auth/spreadsheets"],
        }),
    });
}

const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID!;

// TOOL A: Fetch booked slots for a date
async function getBookedSlots(args: { date: string }) {
    try {
        const sheets = await getSheetsClient();
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: "Appointments!A2:D",
        });
        const rows = response.data.values || [];
        // Filter out by requested date and ensure appointment wasn't Cancelled
        const booked = rows
            .filter((row: any[]) => row[0] === args.date && row[3] !== "Cancelled")
            .map((row: any[]) => row[1]); // returns times: ["11:00", "14:30"]
        return { bookedSlots: booked };
    } catch (e: any) {
        return { error: e.message };
    }
}

// TOOL B: Save appointment row
async function saveAppointment(args: { date: string; time: string; phone: string; service: string }) {
    try {
        const sheets = await getSheetsClient();
        await sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID,
            range: "Appointments!A2:D",
            valueInputOption: "USER_ENTERED",
            requestBody: {
                values: [[args.date, args.time, args.phone, "Confirmed"]],
            },
        });
        return { success: true, message: "Appointment Booked successfully" };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

// TOOL C: Check customer history and loyalty metric status
async function evaluateLoyaltyStatus(args: { phone: string }) {
    try {
        const sheets = await getSheetsClient();
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: "Customers!A2:D",
        });
        const rows = response.data.values || [];
        const customerRow = rows.find((row: any[]) => row[0] === args.phone);
        const pastHaircuts = customerRow ? parseInt(customerRow[2]) || 0 : 0;

        const currentStreak = pastHaircuts % 7;
        const isNextHaircutFree = currentStreak === 6;

        return {
            totalPastHaircuts: pastHaircuts,
            isNextHaircutFree,
            stampsRemainingBeforeFreebie: 6 - currentStreak,
        };
    } catch (e: any) {
        return { error: e.message };
    }
}

// ==========================================
// 2. GEMINI TOOL DECLARATIONS
// ==========================================
const getBookedSlotsDeclaration: FunctionDeclaration = {
    name: "getBookedSlots",
    description: "Retrieves a list of currently occupied time slots for a specific date at the salon.",
    parametersJsonSchema: {
        type: Type.OBJECT,
        properties: {
            date: { type: Type.STRING, description: "The target date in YYYY-MM-DD format." },
        },
        required: ["date"],
    },
};

const saveAppointmentDeclaration: FunctionDeclaration = {
    name: "saveAppointment",
    description: "Books and logs a new appointment slot into the sheet system.",
    parametersJsonSchema: {
        type: Type.OBJECT,
        properties: {
            date: { type: Type.STRING, description: "Date in YYYY-MM-DD format" },
            time: { type: Type.STRING, description: "Time in 24hr format, e.g., 14:30" },
            phone: { type: Type.STRING, description: "The customer's mobile phone string" },
            service: { type: Type.STRING, description: "Type of service requested, e.g., 'Haircut', 'Facial'" },
        },
        required: ["date", "time", "phone", "service"],
    },
};

const evaluateLoyaltyStatusDeclaration: FunctionDeclaration = {
    name: "evaluateLoyaltyStatus",
    description: "Checks how many completed past haircuts this phone number has to calculate rewards.",
    parametersJsonSchema: {
        type: Type.OBJECT,
        properties: {
            phone: { type: Type.STRING, description: "The customer's phone number" },
        },
        required: ["phone"],
    },
};

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

// ==========================================
// 3. MAIN WEBHOOK LOGIC
// ==========================================
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

export async function POST(req: Request) {
    const body = await req.json();

    const message = body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

    if (!message || !message.text?.body) {
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

    const senderPhone = message.from;
    const customerName = body?.entry?.[0]?.changes?.[0]?.value?.contacts?.[0]?.profile?.name || "Customer";

    // Launch background execution loop safely on Vercel
    after(async () => {
        await processAgentExecution(senderPhone, userText, customerName);
    });

    return NextResponse.json({ success: true });
}

// ==========================================
// 4. THE INTELLIGENT RECEPTIONIST LOOP
// ==========================================
async function processAgentExecution(phone: string, incomingText: string, name: string) {
    try {
        const todayDate = new Date().toISOString().split("T")[0];

        // Create an automated context chat session with injected rules
        const chat = ai.chats.create({
            model: "gemini-2.5-flash",
            config: {
                systemInstruction: `You are an expert, polite Salon Receptionist for Kainchi Salon Store. 
                Today's date is strictly ${todayDate}. The customer chatting with you is named ${name}, phone: ${phone}.
                Our salon operational hours are 10:00 to 20:00.
                Available Services: Haircut (100 INR), Facial (200 INR), Shave (70 INR).
                
                CRITICAL INSTRUCTIONS:
                1. If the customer wants to check availability, you MUST call 'getBookedSlots' for that date first.
                2. If they want to book a Haircut, always call 'evaluateLoyaltyStatus' to check if they earned a freebie (7th free)!
                3. Once a slot is confirmed clear by you, call 'saveAppointment' to write it down.
                4. Always respond back to the user in short, friendly sentences (max 3 sentences).`,
                // Pass all function definitions directly to Gemini as tools
                tools: [{ functionDeclarations: [getBookedSlotsDeclaration, saveAppointmentDeclaration, evaluateLoyaltyStatusDeclaration] }]
            }
        });

        // First message pass
        let response = await chat.sendMessage({ message: incomingText });

        // Loop handling in case Gemini chain-calls multiple functions sequentially
        let loopCount = 0;
        while (response.functionCalls && response.functionCalls.length > 0 && loopCount < 5) {
            loopCount++;
            const call = response.functionCalls[0];
            let functionResult: any = {};

            console.log(`Gemini is executing tool: ${call.name}`);

            if (call.name === "getBookedSlots") {
                functionResult = await getBookedSlots(call.args as any);
            } else if (call.name === "saveAppointment") {
                functionResult = await saveAppointment(call.args as any);
            } else if (call.name === "evaluateLoyaltyStatus") {
                functionResult = await evaluateLoyaltyStatus(call.args as any);
            }

            // Send tool outputs back into the conversation thread
            response = await chat.sendMessage({
                message: [
                    {
                        functionResponse: {
                            name: call.name,
                            response: functionResult,
                        },
                    },
                ],
            });
        }

        // Send final text answer compiled by Gemini to the user's phone line
        if (response.text) {
            await sendWhatsappMessage(phone, response.text);
        }

    } catch (error) {
        console.error("Agent Loop Breakdown: ", error);
    }
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
