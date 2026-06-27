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

// Helper utility to pause execution thread for explicit millisecond counts
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function sendServicesMenu(to: string, name: string) {
    // Hosted salon banner image URL
    const bannerImageUrl = "https://i.imgur.com/LhXm44B.jpeg";

    try {
        // STAGE 1: Send the eye-catching image banner as its own message
        const imageResponse = await fetch(`https://graph.facebook.com/v25.0/${process.env.PHONE_NUMBER_ID}/messages`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                messaging_product: "whatsapp",
                to,
                type: "image",
                image: {
                    link: bannerImageUrl,
                    caption: "✨ *Welcome to Kainchi Salon Store* ✨"
                }
            }),
        });

        // FIX: Force the code to wait for Meta to reply and finish processing the image payload completely
        if (imageResponse.ok) {
            await imageResponse.json();
            await sleep(1500);
        } else {
            const imgErrorData = await imageResponse.json();
            console.error("❌ Meta API Stage 1 (Image) Error Details:", JSON.stringify(imgErrorData, null, 2));
        }

        // STAGE 2: Deliver the actual Interactive Option Selection Menu right after
        const response = await fetch(`https://graph.facebook.com/v25.0/${process.env.PHONE_NUMBER_ID}/messages`, {
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
                    header: {
                        type: "text",
                        text: "💇‍♂️ PREMIUM SERVICES"
                    },
                    body: {
                        text: `Hello *${name}*, let's get you pampered! 🌟\n\nPlease tap the button below to browse our signature services and pick what you need today.`
                    },
                    footer: {
                        text: "⏱️ Takes less than 2 minutes"
                    },
                    action: {
                        // FIX: Kept under 20 characters and removed complex emoji bytes
                        button: "Select Service",
                        sections: [{
                            title: "💈 POPULAR SERVICES",
                            rows: [
                                { id: "srv_haircut", title: "Haircut", description: "✂️ Professional style, wash & towel finish" },
                                { id: "srv_hair_spa", title: "Hair Spa", description: "💆‍♀️ Deep conditioning & nourishing therapy" },
                                { id: "srv_straightening", title: "Hair Straightening", description: "✨ Ultra-sleek, smooth & frizz-free permanent shine" },
                                { id: "srv_oiling_massage", title: "Hair Oiling & Massage", description: "🌿 Relaxing hot oil scalp massage" },
                                { id: "srv_body_spa", title: "Premium Body Spa", description: "🧘‍♂️ Full body rejuvenation & stress relief" },
                                { id: "srv_bleaching", title: "Bleaching", description: "🌟 Safe skin brightening & glow treatment" },
                                { id: "srv_facial", title: "Facial", description: "🌸 Deep skin detox & hydration care" },
                                { id: "srv_waxing", title: "Waxing", description: "🍯 Smooth, premium skin hair removal" }
                            ]
                        }]
                    }
                }
            }),
        });

        // New safety logging to catch API errors immediately in your console
        if (!response.ok) {
            const errorData = await response.json();
            console.error("❌ Meta API Error Details:", JSON.stringify(errorData, null, 2));
        }
    } catch (err) {
        console.error("Failed to run sendServicesMenu sequence: ", err);
    }
}

async function sendAvailableSlotsMenu(to: string, targetDate: string, availableSlots: string[]) {
    if (availableSlots.length === 0) {
        await sendWhatsappText(to, "⚠️ *Fully Booked!* \n\nAll slots are taken for this day. Please try entering a different date format (`YYYY-MM-DD`):");
        return;
    }

    // Map time slots into a premium-looking action row
    const rows = availableSlots.map(slot => {
        // Formats time look: e.g. "14:00" -> "🕒 14:00"
        return {
            id: `slot_${slot}`,
            title: `${slot}`,
            description: "⚡ Click to lock this session timing"
        };
    });

    // Parse friendly date presentation for the header (e.g. 2026-07-15)
    const formattedHeaderDate = targetDate;

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
                // 1. STYLED BOLD TEXT HEADER
                header: {
                    type: "text",
                    text: `📆 TIMINGS FOR ${formattedHeaderDate}`
                },
                // 2. CLEAR STEP INSTRUCTIONS WITH CLEAN EMICONS
                body: {
                    text: `✂️ *Open Sessions Found!*\n\n` +
                        `We found open reservation slots for your visit on *${formattedHeaderDate}*.\n\n` +
                        `Please tap the button below to pick your exact preferred arrival hour.`
                },
                footer: {
                    text: "🔒 Slots are dynamic and held for 10 mins"
                },
                action: {
                    button: "🕒 Select a Slot",
                    sections: [{
                        title: "AVAILABLE TIME SLOTS",
                        rows: rows.slice(0, 10) // Meta Interactive list max cap limit safety check
                    }]
                }
            }
        }),
    });
}

async function sendConfirmationButtons(to: string, service: string, date: string, time: string) {
    // Dynamically match pricing for the review card display
    let price = "150 INR";
    if (service.toLowerCase() === "haircut") price = "300 INR";
    if (service.toLowerCase() === "facial") price = "800 INR";

    await fetch(`https://graph.facebook.com/v25.0/${process.env.PHONE_NUMBER_ID}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify({
            messaging_product: "whatsapp",
            to,
            type: "interactive",
            interactive: {
                type: "button",
                // UPGRADED: Structured review layout profile card using native WhatsApp typography
                body: {
                    text: `💳 *REVIEW YOUR BOOKING*\n\n` +
                        `You're almost done! Please double-check your appointment breakdown below:\n\n` +
                        `💇‍♂️ *Service:* ${service.charAt(0) + service.slice(1).toLowerCase()}\n` +
                        `📅 *Date:* ${date}\n` +
                        `⏰ *Time:* ${time} HRS\n` +
                        `💵 *Estimated Price:* ${price}\n\n` +
                        `🚨 _Tap *Yes, Confirm* below to write this into our sheet and lock your seat!_`
                },
                action: {
                    buttons: [
                        { type: "reply", reply: { id: "btn_confirm", title: "Yes, Confirm" } },
                        { type: "reply", reply: { id: "btn_cancel", title: "No, Restart" } }
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

        // STEP 1 COMPLETE -> TRIGGER DATE PROMPT WITH PREMIUM TYPOGRAPHY
        if (currentState === "AWAITING_SERVICE" && userInput.startsWith("srv_")) {
            const serviceChosen = userInput.replace("srv_", "").toUpperCase(); // HAIRCUT, FACIAL, SHAVE

            const datePromptText =
                `📅 *SELECT YOUR DATE* \n\n` +
                `Please enter your preferred appointment date below.\n\n` +
                `👉 *Format:* YYYY-MM-DD\n` +
                `💡 *Example:* 2026-07-15\n\n` +
                `_Once you send the date, we'll instantly look up our live available master-stylist slots for you!_`;

            await sendWhatsappText(phone, datePromptText);
            await updateCustomerState(phone, `AWAITING_DATE|${serviceChosen}`);
        }

        // STEP 2: DATE PICKER & SLOT EXTRACTION
        else if (currentState.startsWith("AWAITING_DATE")) {
            const stateParts = currentState.split("|");
            const selectedService = stateParts[1];
            const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

            if (dateRegex.test(userInput)) {
                const availableSlots = await getAvailableSlots(userInput);
                await sendAvailableSlotsMenu(phone, userInput, availableSlots);
                await updateCustomerState(phone, `AWAITING_TIME|${selectedService}|${userInput}`);
            } else {
                await sendWhatsappText(phone, "❌ *Invalid Date Format.* Please send the date exactly like this: `YYYY-MM-DD` (e.g., `2026-07-20`)");
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
                const cleanService = service.charAt(0) + service.slice(1).toLowerCase();

                // 2. Build a high-end, structured digital receipt message layout
                const premiumSuccessMessage =
                    `🎉 *APPOINTMENT SECURED!* 🎉\n\n` +
                    `Thank you *${name}*! Your booking at *Kainchi Salon Store* has been officially confirmed and registered in our system. 👑\n\n` +
                    `┌──────────────────────────────┐\n` +
                    `│      *RESERVATION RECEIPT*   \n` +
                    `├──────────────────────────────┤\n` +
                    `│ 💇‍♂️ *Service:* ${cleanService}\n` +
                    `│ 📅 *Date:*    ${date}\n` +
                    `│ 🕒 *Time:*    ${time} HRS\n` +
                    `│ 📍 *Status:*  🟢 Confirmed\n` +
                    `└──────────────────────────────┘\n\n` +
                    `✨ *Important Information:* \n` +
                    `• Please try to arrive *5-10 minutes* prior to your scheduled slot.\n` +
                    `• If you need to reschedule or change your services, simply type *'Hi'* at any time to manage or restart your session.\n\n` +
                    `_We look forward to giving you a brand new look! See you soon!_ 👋🏼`;

                await sendWhatsappText(phone, premiumSuccessMessage);
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