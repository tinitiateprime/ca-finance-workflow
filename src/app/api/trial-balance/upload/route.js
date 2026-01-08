// import { NextResponse } from "next/server";
// import { client, databaseId } from "@/app/lib/cosmosClient";

// const containerId = "trial-balance";

// export async function POST(req) {
//   try {
//     const body = await req.json();

//     const {
//       tenantId,
//       docName,
//       clientId,
//       tags = [],
//       notes = "",
//       fileName,
//       sheetName,
//       meta,
//       rowsFlat,
//       user
//     } = body;

//     if (!tenantId || !docName || !rowsFlat || !sheetName) {
//       return NextResponse.json(
//         { error: "Missing required fields" },
//         { status: 400 }
//       );
//     }

//     const container = client
//       .database(databaseId)
//       .container(containerId);

//     const doc = {
//       id: `TB-${Date.now()}`,
//       tenantId,

//       docName,
//       clientId,
//       tags,
//       notes,

//       fileName,
//       sheetName,
//       meta,
//       rowsFlat,

//       status: "DRAFT",

//       createdBy: {
//         userId: user?.id,
//         username: user?.username,
//         role: user?.role
//       },

//       createdAt: new Date().toISOString(),
//       updatedAt: new Date().toISOString()
//     };

//     await container.items.create(doc);

//     return NextResponse.json(
//       { success: true, id: doc.id },
//       { status: 201 }
//     );
//   } catch (err) {
//     console.error("UPLOAD TB ERROR:", err);
//     return NextResponse.json(
//       { error: "Failed to upload trial balance" },
//       { status: 500 }
//     );
//   }
// }
