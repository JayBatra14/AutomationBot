import { NextRequest, NextResponse, after } from "next/server";
import { google } from "googleapis";

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

// ====================================================================
// 📊 GOOGLE SHEETS STATE ENGINE HELPERS
// ====================================================================
async function getOrCreateCustomerState(phone: string, name: string): Promise<string> {
    const sheets = await getSheetsClient();
    const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: "Customers!A2:E",
    });
    const rows = response.data.values || [];
    const rowIndex = rows.findIndex((row: any[]) => row[0] === phone);

    if (rowIndex === -1) {
        await sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID,
            range: "Customers!A2:E",
            valueInputOption: "USER_ENTERED",
            requestBody: { values: [[phone, name, "0", "", "START"]] },
        });
        return "START";
    }
    return rows[rowIndex][4] || "START";
}

async function updateCustomerState(phone: string, newState: string) {
    const sheets = await getSheetsClient();
    const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: "Customers!A2:E",
    });
    const rows = response.data.values || [];
    const rowIndex = rows.findIndex((row: any[]) => row[0] === phone);

    if (rowIndex !== -1) {
        await sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,
            range: `Customers!E${rowIndex + 2}`,
            valueInputOption: "USER_ENTERED",
            requestBody: { values: [[newState]] },
        });
    }
}

async function getAvailableSlots(targetDate: string): Promise<string[]> {
    const sheets = await getSheetsClient();
    const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: "Appointments!A2:E",
    });
    const rows = response.data.values || [];

    // All available business hours slots
    const allSlots = ["10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00"];

    const bookedSlots = rows
        .filter((row: any[]) => row[0] === targetDate && row[3] !== "Cancelled")
        .map((row: any[]) => row[1]);

    // Return slots that are NOT booked yet
    return allSlots.filter(slot => !bookedSlots.includes(slot));
}

async function saveNewAppointment(date: string, time: string, phone: string, service: string) {
    const sheets = await getSheetsClient();
    await sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: "Appointments!A2:E",
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [[date, time, phone, service, "Confirmed"]] },
    });
}

// ====================================================================
// 🚀 META WHATSAPP INTERACTIVE OBJECT SENDERS
// ====================================================================
async function sendWhatsappText(to: string, text: string) {
    await fetch(`https://graph.facebook.com/v25.0/${process.env.PHONE_NUMBER_ID}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body: text } }),
    });
}

async function sendServicesMenu(to: string, name: string) {
    // Replace this with your actual hosted salon banner image URL (PNG or JPEG)
    const bannerImageUrl = "https://images.unsplash.com/photo-1560066984-138dadb4c035?auto=format&fit=crop&w=800&q=80";

    await fetch(`https://graph.facebook.com/v25.0/${process.env.PHONE_NUMBER_ID}/messages`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            messaging_product: "whatsapp",
            to,
            type: "interactive",
            interactive: {
                type: "list",
                // 1. ADDING AN IMAGE HEADER (Just like enterprise brands do)
                header: {
                    type: "image",
                    image: {
                        url: bannerImageUrl
                    }
                },
                // 2. COOL TEXT FORMATTING IN BODY USING EMOHIS & NATIVE BOLDING
                body: {
                    text: `✨ *Welcome to Batra's Salon Store* ✨\n\n` +
                        `Hello *${name}*, let's get you pampered! 🌟\n\n` +
                        `Please tap the button below to browse our signature premium services and select what you need today.`
                },
                // 3. CLEAN SUB-FOOTER
                footer: {
                    text: "⏱️ Takes less than 2 minutes to lock your spot"
                },
                action: {
                    button: "💇‍♂️ Select Service",
                    sections: [{
                        title: "💈 POPULAR SERVICES",
                        rows: [
                            {
                                id: "srv_haircut",
                                title: "Classic Haircut",
                                description: "✂️ Style, wash & hot towel finish — 100 INR"
                            },
                            {
                                id: "srv_facial",
                                title: "Premium Facial",
                                description: "💆‍♂️ Deep skin detox & hydration massage — 200 INR"
                            },
                            {
                                id: "srv_shave",
                                title: "Royal Beard Shave",
                                description: "🪒 Straight-razor precision shave — 70 INR"
                            }
                        ]
                    }]
                }
            }
        }),
    });
}

async function sendAvailableSlotsMenu(to: string, targetDate: string, availableSlots: string[]) {
    if (availableSlots.length === 0) {
        await sendWhatsappText(to, "Sorry, all slots are booked for this date. Please enter another date (YYYY-MM-DD):");
        return;
    }

    const rows = availableSlots.map(slot => ({
        id: `slot_${slot}`,
        title: slot,
        description: "Available for booking"
    }));

    await fetch(`https://graph.facebook.com/v25.0/${process.env.PHONE_NUMBER_ID}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify({
            messaging_product: "whatsapp",
            to,
            type: "interactive",
            interactive: {
                type: "list",
                header: { type: "text", text: "Available Timings" },
                body: { text: `Here are the open slots for ${targetDate}. Tap below to choose your time.` },
                footer: { text: "Select a timing slot" },
                action: {
                    button: "Choose Time",
                    sections: [{ title: "Timings", rows: rows.slice(0, 10) }] // Max 10 rows per interactive list
                }
            }
        }),
    });
}

async function sendConfirmationButtons(to: string, service: string, date: string, time: string) {
    await fetch(`https://graph.facebook.com/v25.0/${process.env.PHONE_NUMBER_ID}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify({
            messaging_product: "whatsapp",
            to,
            type: "interactive",
            interactive: {
                type: "button",
                body: { text: `Please confirm your details:\n\n💇‍♂️ *Service:* ${service}\n📅 *Date:* ${date}\n⏰ *Time:* ${time}\n\nWould you like to finalize this reservation request?` },
                action: {
                    buttons: [
                        { type: "reply", reply: { id: "btn_confirm", title: "Yes, Confirm" } },
                        { type: "reply", reply: { id: "btn_cancel", title: "No, Cancel" } }
                    ]
                }
            }
        }),
    });
}

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

// ====================================================================
// 📥 WEBHOOK INBOUND TRAFFIC HANDLER
// ====================================================================
export async function POST(req: Request) {
    const body = await req.json();
    const message = body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

    if (!message) return NextResponse.json({ status: "Ignored" });

    const senderPhone = message.from;
    const customerName = body?.entry?.[0]?.changes?.[0]?.value?.contacts?.[0]?.profile?.name || "Customer";

    // Parse input whether it's a raw text message, a list selection, or a button click
    let userResponseText = "";
    if (message.type === "text") {
        userResponseText = message.text.body.trim();
    } else if (message.type === "interactive") {
        const interactiveType = message.interactive.type;
        if (interactiveType === "list_reply") {
            userResponseText = message.interactive.list_reply.id; // e.g. "srv_haircut" or "slot_14:00"
        } else if (interactiveType === "button_reply") {
            userResponseText = message.interactive.button_reply.id; // e.g. "btn_confirm"
        }
    }

    if (userResponseText) {
        after(async () => {
            await handleStateFlow(senderPhone, userResponseText, customerName);
        });
    }

    return NextResponse.json({ success: true });
}

// ====================================================================
// ⚙️ THE WEBHOOK STATE ENGINE
// ====================================================================
async function handleStateFlow(phone: string, userInput: string, name: string) {
    try {
        const currentState = await getOrCreateCustomerState(phone, name);

        // Reset check if client restarts conversation explicitly
        if (userInput.toLowerCase() === "hi" || userInput.toLowerCase() === "hello" || userInput === "btn_cancel") {
            await sendServicesMenu(phone, name);
            await updateCustomerState(phone, "AWAITING_SERVICE");
            return;
        }

        // STEP 1: SERVICE SELECTION
        if (currentState === "AWAITING_SERVICE" && userInput.startsWith("srv_")) {
            const serviceChosen = userInput.replace("srv_", "").toUpperCase(); // HAIRCUT, FACIAL, SHAVE
            await sendWhatsappText(phone, `Great choice! Please enter your preferred date in YYYY-MM-DD format (Example: 2026-07-15):`);
            await updateCustomerState(phone, `AWAITING_DATE|${serviceChosen}`);
        }

        // STEP 2: DATE PICKER & SLOT EXTRACTION
        else if (currentState.startsWith("AWAITING_DATE")) {
            const selectedService = currentState.split("|");
            const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

            if (dateRegex.test(userInput)) {
                const availableSlots = await getAvailableSlots(userInput);
                await sendAvailableSlotsMenu(phone, userInput, availableSlots);
                await updateCustomerState(phone, `AWAITING_TIME|${selectedService}|${userInput}`);
            } else {
                await sendWhatsappText(phone, "Invalid date format. Please send the date exactly like this: YYYY-MM-DD");
            }
        }

        // STEP 3: TIME SLOT SELECTION
        else if (currentState.startsWith("AWAITING_TIME") && userInput.startsWith("slot_")) {
            const [_, selectedService, selectedDate] = currentState.split("|");
            const timeChosen = userInput.replace("slot_", ""); // e.g. "14:00"

            await sendConfirmationButtons(phone, selectedService, selectedDate, timeChosen);
            await updateCustomerState(phone, `AWAITING_CONFIRM|${selectedService}|${selectedDate}|${timeChosen}`);
        }

        // STEP 4: FINAL TRANSACTION VERIFICATION & GOOGLE SHEETS WRITE
        else if (currentState.startsWith("AWAITING_CONFIRM")) {
            const [_, service, date, time] = currentState.split("|");

            if (userInput === "btn_confirm") {
                await saveNewAppointment(date, time, phone, service);
                await sendWhatsappText(phone, `🎉 Booking Confirmed!\n\nThank you ${name}, your appointment for a ${service} on ${date} at ${time} has been registered in our system. See you at the salon!`);
                await updateCustomerState(phone, "START");
            } else {
                await sendServicesMenu(phone, name);
                await updateCustomerState(phone, "AWAITING_SERVICE");
            }
        }

        // FALLBACK FOR OUT OF ROUTE ENCOUNTERS
        else {
            await sendServicesMenu(phone, name);
            await updateCustomerState(phone, "AWAITING_SERVICE");
        }

    } catch (e) {
        console.error("Critical State Machine Runtime failure: ", e);
    }
}