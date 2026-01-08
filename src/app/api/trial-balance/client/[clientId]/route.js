// src\app\api\trial-balance\client\[clientId]\route.js
import { NextResponse } from "next/server";
import { client } from "@/app/lib/cosmosClient";

const DATABASE_ID = process.env.COSMOS_DB_NAME;
const CONTAINER_ID = "trial-balance";

export async function GET(req, { params }) {
  try {
    // ✅ REQUIRED IN NEXT 15/16
    const { clientId } = await params;

    const container = client
      .database(DATABASE_ID)
      .container(CONTAINER_ID);

    const query = {
      query: `
        SELECT * FROM c
        WHERE c.clientId = @clientId
        ORDER BY c.updatedAt DESC
      `,
      parameters: [{ name: "@clientId", value: clientId }],
    };

    const { resources } = await container.items
      .query(query)
      .fetchAll();

    return NextResponse.json({ items: resources });
  } catch (err) {
    console.error("Client TB fetch error:", err);
    return NextResponse.json(
      { error: "Failed to fetch trial balance list" },
      { status: 500 }
    );
  }
}
