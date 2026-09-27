import "dotenv/config";
import { doc, setDoc } from "firebase/firestore";
import { db } from "../src/firebase.js";
import { getPHCs } from "../src/services/db.js";

const NEW_PHC_COORDINATES = [
  // Maharashtra
  { phc_id: "phc-nimgaon", latitude: 19.1105, longitude: 73.9875 },
  { phc_id: "phc-kumathe", latitude: 17.6015, longitude: 73.9658 },
  { phc_id: "phc-jamsar", latitude: 19.9712, longitude: 73.2381 },
  { phc_id: "phc-kaman", latitude: 19.3856, longitude: 72.8879 },
  { phc_id: "phc-borsar", latitude: 20.2598, longitude: 75.1424 },

  // Rajasthan
  { phc_id: "phc-bhankrota", latitude: 26.8532, longitude: 75.6941 },
  { phc_id: "phc-achrol", latitude: 27.1331, longitude: 75.9598 },
  { phc_id: "phc-boraj", latitude: 26.9006, longitude: 75.4244 },
  { phc_id: "phc-mandore", latitude: 26.3409, longitude: 73.0441 },
  { phc_id: "phc-netra", latitude: 26.4601, longitude: 73.1114 },

  // Uttar Pradesh
  { phc_id: "phc-chinhat", latitude: 26.8901, longitude: 81.0534 },
  { phc_id: "phc-mohanlalganj", latitude: 26.6912, longitude: 80.9841 },
  { phc_id: "phc-kakori", latitude: 26.8715, longitude: 80.7932 },
  { phc_id: "phc-malihabad", latitude: 26.9211, longitude: 80.7104 },
  { phc_id: "phc-barabanki-rural", latitude: 26.9242, longitude: 81.1831 }
];

async function verifyAndMigrateCoordinates(execute = false) {
  console.log("=== Phase 2 PHC Coordinate Migration Script ===");
  console.log(`Mode: ${execute ? "EXECUTE (WRITING TO DB)" : "DRY RUN (NO WRITES)"}\n`);

  try {
    const existingPhcs = await getPHCs();
    let missingPhcs = 0;
    let validUpdates = 0;

    console.log("Verification Phase:");
    for (const update of NEW_PHC_COORDINATES) {
      const exists = existingPhcs.some(p => p.phc_id === update.phc_id);
      
      if (!exists) {
        console.error(`❌ ERROR: Target PHC ${update.phc_id} does not exist in the database.`);
        missingPhcs++;
        continue;
      }

      if (typeof update.latitude !== 'number' || typeof update.longitude !== 'number') {
        console.error(`❌ ERROR: Invalid coordinates for ${update.phc_id}: ${update.latitude}, ${update.longitude}`);
        continue;
      }

      validUpdates++;
      console.log(`✅ Verified ${update.phc_id} -> [${update.latitude}, ${update.longitude}]`);
    }

    console.log(`\nSummary:`);
    console.log(`- Target updates: ${NEW_PHC_COORDINATES.length}`);
    console.log(`- Validated for migration: ${validUpdates}`);
    console.log(`- Missing PHCs: ${missingPhcs}`);

    if (missingPhcs > 0) {
      console.error("\n❌ MIGRATION ABORTED: Not all target PHCs exist in the database. Ensure Phase 2 PHCs are added before running this script.");
      process.exit(1);
    }

    if (!execute) {
      console.log("\nDry run completed successfully. No writes were performed.");
      return;
    }

    console.log("\nExecution Phase:");
    let successCount = 0;
    for (const update of NEW_PHC_COORDINATES) {
      try {
        const phcRef = doc(db, "phcs", update.phc_id);
        await setDoc(phcRef, {
          latitude: update.latitude,
          longitude: update.longitude
        }, { merge: true });
        
        console.log(`[SUCCESS] Updated ${update.phc_id}`);
        successCount++;
      } catch (err) {
        console.error(`[FAILED] Error updating ${update.phc_id}:`, err);
      }
    }

    console.log(`\nMigration completed! Successfully updated ${successCount}/${NEW_PHC_COORDINATES.length} PHCs.`);

  } catch (error) {
    console.error("Migration script failed catastrophically:", error);
    process.exit(1);
  }
}

// Ensure safe default: NO execution unless explicitly instructed via args
const isExecutionMode = process.argv.includes('--execute');
verifyAndMigrateCoordinates(isExecutionMode).then(() => process.exit(0)).catch(() => process.exit(1));
