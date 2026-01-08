// import { NextResponse } from "next/server";
// import { client } from "@/app/lib/cosmosClient";

// const DB_ID = process.env.COSMOS_DB_NAME;
// const CONTAINER_ID = "trial-balance";

// export async function GET(req, { params }) {
//   const { docId } = params;

//   const container = client.database(DB_ID).container(CONTAINER_ID);
//   const { resource } = await container.item(docId, undefined).read();

//   if (!resource) {
//     return NextResponse.json({ error: "Not found" }, { status: 404 });
//   }

//   return NextResponse.json(resource);
// }

// export async function PUT(req, { params }) {
//   const { docId } = params;
//   const body = await req.json();

//   const container = client.database(DB_ID).container(CONTAINER_ID);
//   const { resource: existing } = await container.item(docId, undefined).read();

//   if (!existing) {
//     return NextResponse.json({ error: "Not found" }, { status: 404 });
//   }

//   const updated = {
//     ...existing,
//     ...body,
//     updatedAt: new Date().toISOString(),
//   };

//   await container.items.upsert(updated);
//   return NextResponse.json({ success: true });
// }




// src/app/api/trial-balance/doc/[docId]/route.js
import { NextResponse } from "next/server";
import { client } from "@/app/lib/cosmosClient";

const DATABASE_ID = process.env.COSMOS_DB_NAME;
const CONTAINER_ID = "trial-balance";

export async function GET(req, { params }) {
  try {
    const { docId } = await params;

    const container = client
      .database(DATABASE_ID)
      .container(CONTAINER_ID);

    // ✅ QUERY instead of item.read
    const { resources } = await container.items
      .query({
        query: "SELECT * FROM c WHERE c.id = @id",
        parameters: [{ name: "@id", value: docId }],
      })
      .fetchAll();

    if (!resources || resources.length === 0) {
      return NextResponse.json(
        { error: "Document not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(resources[0]);
  } catch (err) {
    console.error("TB doc fetch error:", err);
    return NextResponse.json(
      { error: "Failed to load document" },
      { status: 500 }
    );
  }
}
