// // src/app/api/trial-balance/[fileId]/route.js

// import { NextResponse } from "next/server";
// import { client } from "@/app/lib/cosmosClient";

// const DATABASE_ID = process.env.COSMOS_DB_NAME;
// const CONTAINER_ID = "trial-balance";

// export async function PUT(req, { params }) {
//   try {
//     const { fileId } = params;

//     // Parse incoming data from frontend
//     const body = await req.json();
//     const { rowsFlat, updatedAt, updatedBy } = body;

//     // Get the container
//     const container = client
//       .database(DATABASE_ID)
//       .container(CONTAINER_ID);

//     // Find the document by fileId and sheetName
//     const { resource: doc } = await container
//       .item(fileId, `CLIENT#${body.clientId}`)
//       .read();

//     if (!doc) {
//       return NextResponse.json(
//         { error: "Document not found" },
//         { status: 404 }
//       );
//     }

//     // Update the document with new data
//     doc.rowsFlat = rowsFlat;
//     doc.updatedAt = updatedAt;
//     doc.updatedBy = updatedBy;

//     // Save the updated document back to Cosmos DB
//     const updatedDoc = await container
//       .item(fileId, `CLIENT#${body.clientId}`)
//       .replace(doc);

//     return NextResponse.json(updatedDoc);
//   } catch (err) {
//     console.error("Error updating trial balance document:", err);
//     return NextResponse.json(
//       { error: "Failed to save document" },
//       { status: 500 }
//     );
//   }
// }




import { NextResponse } from "next/server";
import { client } from "@/app/lib/cosmosClient";

const DATABASE_ID = process.env.COSMOS_DB_NAME;
const CONTAINER_ID = "trial-balance";

// PUT Request Handler to update the Trial Balance document
export async function PUT(req, { params }) {
  try {
    // Ensure that params are resolved asynchronously
    const { fileId } = await params;

    // Parse incoming data from frontend
    const body = await req.json();
    const { rowsFlat, updatedAt, updatedBy, clientId } = body;
          
    // Ensure required fields are provided in the request body
    if (!fileId || !clientId || !rowsFlat || !updatedAt || !updatedBy) {
      return NextResponse.json(
        { error: "Missing required fields", fields: { fileId, clientId, rowsFlat, updatedAt, updatedBy } },
        { status: 400 }
      );
    }

    // Log for debugging
    console.log("Updating document:", { fileId, clientId });

    // Get the Cosmos DB container
    const container = client
      .database(DATABASE_ID)
      .container(CONTAINER_ID);

    // Fetch the document using fileId and clientId
    const { resource: doc } = await container
      .item(fileId, `CLIENT#${clientId}`)
      .read();
      console.log("Retrieved document:", doc);


    // If the document is not found, return a 404 error
    if (!doc) {
      return NextResponse.json(
        { error: "Document not found", fileId, clientId },
        { status: 404 }
      );
    }

    // Update the document fields
    doc.rowsFlat = rowsFlat;
    doc.updatedAt = updatedAt;
    doc.updatedBy = updatedBy;

    // Replace the document in Cosmos DB with the updated data
    const updatedDoc = await container
      .item(fileId, `CLIENT#${clientId}`)
      .replace(doc);
        console.log("Retrieved document:", doc);

    // Return the updated document as the response
    return NextResponse.json(updatedDoc);
  } catch (err) {
    // Log any errors for debugging purposes
    console.error("Error updating trial balance document:", err);

    // Return a 500 error if something goes wrong
    return NextResponse.json(
      { error: "Failed to save document", details: err.message },
      { status: 500 }
    );
  }
}
