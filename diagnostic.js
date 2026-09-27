import "dotenv/config";
import { getPHCs } from "./src/services/db.js";
import { findNearbyPHCs } from "./src/services/network.js";

async function runDiagnostic() {
  console.log("=== DIAGNOSTIC REPORT ===");
  try {
    const phcs = await getPHCs();
    const nimgaon = phcs.find(p => p.phc_id === "phc-nimgaon");
    const mohan = phcs.find(p => p.phc_id === "phc-mohanlalganj");

    console.log("\n--- Firestore raw data via getPHCs ---");
    console.log("Nimgaon keys:", nimgaon ? Object.keys(nimgaon).join(", ") : "NOT FOUND");
    console.log("Nimgaon location:", nimgaon ? `${nimgaon.latitude}, ${nimgaon.longitude}` : "N/A");
    console.log("Nimgaon lat type:", typeof nimgaon?.latitude);
    
    console.log("Mohanlalganj location:", mohan ? `${mohan.latitude}, ${mohan.longitude}` : "N/A");
    
    console.log("\n--- Network layer ---");
    const nearbyN = await findNearbyPHCs("phc-nimgaon", 50, phcs);
    console.log("Nimgaon nearby count:", nearbyN.length);
    const nearbyM = await findNearbyPHCs("phc-mohanlalganj", 50, phcs);
    console.log("Mohanlalganj nearby count:", nearbyM.length);
  } catch(e) {
    console.error(e);
  }
}
runDiagnostic().then(() => process.exit(0));
