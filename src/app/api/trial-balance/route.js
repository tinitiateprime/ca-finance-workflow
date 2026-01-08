import { NextResponse } from "next/server";
import { client, databaseId } from "../../lib/cosmosClient";

const CONTAINER_ID = "trial-balance";

export async function POST(req) {
  try {
    const body = await req.json();

    if (!body.fileId || !body.documentName || !body.clientId) {
      return NextResponse.json(
        { message: "Missing required fields" },
        { status: 400 }
      );
    }

    const container = client
      .database(databaseId)
      .container(CONTAINER_ID);

    // Ensure partition key exists
    const doc = {
      ...body,
      pk: `CLIENT#${body.clientId}`, // 🔑 partition key
      createdAt: body.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await container.items.create(doc);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("POST /trial-balance error", err);
    return NextResponse.json(
      { message: "Server error" },
      { status: 500 }
    );
  }
}
