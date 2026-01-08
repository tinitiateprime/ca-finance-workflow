// import { NextResponse } from "next/server";
// import { client, databaseId } from "@/app/lib/cosmosClient";

// const containerId = "trial-balance";

// export async function PUT(req) {
//   try {
//     const body = await req.json();

//     const {
//       id,
//       tenantId,
//       rowsFlat,
//       meta,
//       docName,
//       tags,
//       notes,
//       user
//     } = body;

//     if (!id || !tenantId) {
//       return NextResponse.json(
//         { error: "Document id and tenantId required" },
//         { status: 400 }
//       );
//     }

//     const container = client
//       .database(databaseId)
//       .container(containerId);

//     const { resource } = await container.item(id, tenantId).read();

//     if (!resource) {
//       return NextResponse.json(
//         { error: "Document not found" },
//         { status: 404 }
//       );
//     }

//     const updatedDoc = {
//       ...resource,
//       docName: docName ?? resource.docName,
//       tags: tags ?? resource.tags,
//       notes: notes ?? resource.notes,
//       meta: meta ?? resource.meta,
//       rowsFlat: rowsFlat ?? resource.rowsFlat,

//       updatedAt: new Date().toISOString(),
//       lastEditedBy: {
//         userId: user?.id,
//         username: user?.username,
//         role: user?.role
//       }
//     };

//     await container
//       .item(id, tenantId)
//       .replace(updatedDoc);

//     return NextResponse.json({ success: true });
//   } catch (err) {
//     console.error("SAVE TB ERROR:", err);
//     return NextResponse.json(
//       { error: "Failed to save trial balance" },
//       { status: 500 }
//     );
//   }
// }
