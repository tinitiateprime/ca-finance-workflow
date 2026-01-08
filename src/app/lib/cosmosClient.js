// import { CosmosClient } from "@azure/cosmos";

// const endpoint = process.env.COSMOS_ENDPOINT;
// const key = process.env.COSMOS_KEY;
// const databaseId = process.env.COSMOS_DB_NAME;

// if (!endpoint || !key || !databaseId) {
//   throw new Error("Cosmos DB environment variables are missing");
// }

// /**
//  * Single Cosmos Client (singleton)
//  */
// export const client = new CosmosClient({
//   endpoint,
//   key,
// });

// /**
//  * Container IDs (logical tables)
//  */
// export const usersContainerId =
//   process.env.COSMOS_USERS_CONTAINER || "users";

// export const clientsContainerId =
//   process.env.COSMOS_CLIENTS_CONTAINER || "clients";

// /**
//  * ✅ THIS IS WHAT WAS MISSING
//  * Generic container getter
//  */
// export async function getCosmosContainer(containerId) {
//   const database = client.database(databaseId);

//   const { container } = await database.containers.createIfNotExists({
//     id: containerId,
//   });

//   return container;
// }





import { CosmosClient } from "@azure/cosmos";

const endpoint = process.env.COSMOS_ENDPOINT;
const key = process.env.COSMOS_KEY;

if (!endpoint || !key) {
  throw new Error("❌ Cosmos DB env vars missing");
}

export const client = new CosmosClient({ endpoint, key });

export const databaseId = process.env.COSMOS_DB_NAME;
export const usersContainerId = process.env.COSMOS_USERS_CONTAINER;
export const trialBalanceContainerId = "trial-balance";

/**
 * ✅ Generic helper to get any container
 */
export function getCosmosContainer(containerId) {
  if (!databaseId) throw new Error("COSMOS_DB_NAME missing");
  return client.database(databaseId).container(containerId);
}
