// import { NextResponse } from "next/server";
// import { getCosmosContainer,usersContainerId,} from "@/app/lib/cosmosClient";

// export async function POST(req) {
//   try {
//     const { username, password } = await req.json();

//     if (!username || !password) {
//       return NextResponse.json(
//         { message: "Username and password required" },
//         { status: 400 }
//       );
//     }

//     const container = getCosmosContainer(usersContainerId);

//     const query = {
//       query: "SELECT * FROM c WHERE c.username = @username AND c.status = 'Active'",
//       parameters: [{ name: "@username", value: username }],
//     };

//     const { resources } = await container.items
//       .query(query)
//       .fetchAll();

//     if (!resources.length) {
//       return NextResponse.json(
//         { message: "User not found" },
//         { status: 401 }
//       );
//     }

//     const user = resources[0];

//     if (user.password !== password) {
//       return NextResponse.json(
//         { message: "Invalid password" },
//         { status: 401 }
//       );
//     }

//     // ✅ IMPORTANT: role mapping
//     return NextResponse.json({
//       id: user.id,
//       username: user.username,
//       role: user.appRole, // ← this must match ROLE_HOME
//       tenantId: user.tenantId,
//     });
//   } catch (err) {
//     console.error("Login error:", err);
//     return NextResponse.json(
//       { message: "Login failed" },
//       { status: 500 }
//     );
//   }
// }





import { NextResponse } from "next/server";
import {
  getCosmosContainer,
  usersContainerId,
} from "@/app/lib/cosmosClient";

export async function POST(req) {
  try {
    const { username, password } = await req.json();

    if (!username || !password) {
      return NextResponse.json(
        { message: "Username and password required" },
        { status: 400 }
      );
    }

    const container = getCosmosContainer(usersContainerId);

    const query = {
      query: "SELECT * FROM c WHERE c.username = @username AND c.status = 'Active'",
      parameters: [{ name: "@username", value: username }],
    };

    const { resources } = await container.items
      .query(query)
      .fetchAll();

    if (!resources.length) {
      return NextResponse.json(
        { message: "User not found" },
        { status: 401 }
      );
    }

    const user = resources[0];

    if (user.password !== password) {
      return NextResponse.json(
        { message: "Invalid password" },
        { status: 401 }
      );
    }

    // ✅ IMPORTANT: role mapping
    return NextResponse.json({
      id: user.id,
      username: user.username,
      role: user.appRole, // ← this must match ROLE_HOME
      tenantId: user.tenantId,
    });
  } catch (err) {
    console.error("Login error:", err);
    return NextResponse.json(
      { message: "Login failed" },
      { status: 500 }
    );
  }
}
