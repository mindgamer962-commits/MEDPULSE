import "dotenv/config";
import { doc, setDoc } from "firebase/firestore";
import { db } from "../src/firebase.js";
import { getPHCs } from "../src/services/db.js";

const PHASE2_PHC_UPDATES = [
  // Maharashtra
  { phc_id: "phc-nimgaon", latitude: 19.1105, longitude: 73.9875, address: "Nimgaon Sawa, Pune, Maharashtra" },
  { phc_id: "phc-kumathe", latitude: 17.6015, longitude: 73.9658, address: "Kumathe, Satara, Maharashtra" },
  { phc_id: "phc-jamsar", latitude: 19.9712, longitude: 73.2381, address: "Jamsar, Palghar, Maharashtra" },
  { phc_id: "phc-kaman", latitude: 19.3856, longitude: 72.8879, address: "Kaman, Palghar, Maharashtra" },
  { phc_id: "phc-borsar", latitude: 20.2598, longitude: 75.1424, address: "Borsar, Chhatrapati Sambhajinagar, Maharashtra" }, // Assuming Aurangabad/Sambhajinagar district based on coords

  // Rajasthan
  { phc_id: "phc-bhankrota", latitude: 26.8532, longitude: 75.6941, address: "Bhankrota, Jaipur, Rajasthan" },
  { phc_id: "phc-achrol", latitude: 27.1331, longitude: 75.9598, address: "Achrol, Jaipur, Rajasthan" },
  { phc_id: "phc-boraj", latitude: 26.9006, longitude: 75.4244, address: "Boraj, Jaipur, Rajasthan" },
  { phc_id: "phc-mandore", latitude: 26.3409, longitude: 73.0441, address: "Mandore, Jodhpur, Rajasthan" },
  { phc_id: "phc-netra", latitude: 26.4601, longitude: 73.1114, address: "Netra, Jodhpur, Rajasthan" },

  // Uttar Pradesh
  { phc_id: "phc-chinhat", latitude: 26.8901, longitude: 81.0534, address: "Chinhat, Lucknow, Uttar Pradesh" },
  { phc_id: "phc-mohanlalganj", latitude: 26.6912, longitude: 80.9841, address: "Mohanlalganj, Lucknow, Uttar Pradesh" },
  { phc_id: "phc-kakori", latitude: 26.8715, longitude: 80.7932, address: "Kakori, Lucknow, Uttar Pradesh" },
  { phc_id: "phc-malihabad", latitude: 26.9211, longitude: 80.7104, address: "Malihabad, Lucknow, Uttar Pradesh" },
  { phc_id: "phc-barabanki-rural", latitude: 26.9242, longitude: 81.1831, address: "Barabanki Rural, Barabanki, Uttar Pradesh" }
];

async function verifyAndMigrate(execute = false) {
  console.log("=== Phase 2 PHC Coordinate & Address Migration ===");
  console.log(`Mode: ${execute ? "EXECUTE (WRITING TO DB)" : "DRY RUN (READ ONLY)"}\n`);

  try {
    const existingPhcs = await getPHCs();
    let missingPhcs = 0;
    let verifiedUpdates = [];

    console.log("--- Verification Phase ---");
    for (const update of PHASE2_PHC_UPDATES) {
      const phc = existingPhcs.find(p => p.phc_id === update.phc_id);
      
      if (!phc) {
        console.error(`❌ ERROR: Target PHC ${update.phc_id} does not exist in DB.`);
        missingPhcs++;
        continue;
      }

      if (typeof update.latitude !== 'number' || typeof update.longitude !== 'number' || isNaN(update.latitude) || isNaN(update.longitude) || update.latitude < -90 || update.latitude > 90 || update.longitude < -180 || update.longitude > 180) {
        console.error(`❌ ERROR: Invalid coordinates for ${update.phc_id}: ${update.latitude}, ${update.longitude}`);
        continue;
      }
      
      if (!update.address || update.address.length < 5) {
        console.error(`❌ ERROR: Invalid address for ${update.phc_id}: ${update.address}`);
        continue;
      }

      verifiedUpdates.push(update);
      console.log(`✅ Verified ${update.phc_id}:`);
      console.log(`   - Name: ${phc.name}`);
      console.log(`   - Address: ${update.address}`);
      console.log(`   - Coords: [${update.latitude}, ${update.longitude}]`);
    }

    console.log(`\n--- Verification Summary ---`);
    console.log(`Target updates: ${PHASE2_PHC_UPDATES.length}`);
    console.log(`Verified valid: ${verifiedUpdates.length}`);
    console.log(`Missing/Invalid: ${PHASE2_PHC_UPDATES.length - verifiedUpdates.length}`);

    if (missingPhcs > 0) {
      console.error("\n❌ MIGRATION ABORTED: Missing PHC documents detected.");
      process.exit(1);
    }

    if (!execute) {
      console.log("\nDry run completed successfully. No Firestore writes performed.");
      return;
    }

    console.log("\n--- Execution Phase ---");
    let successCount = 0;
    for (const update of verifiedUpdates) {
      try {
        const phcRef = doc(db, "phcs", update.phc_id);
        await setDoc(phcRef, {
          latitude: update.latitude,
          longitude: update.longitude,
          address: update.address
        }, { merge: true });
        
        console.log(`[SUCCESS] Updated ${update.phc_id}`);
        successCount++;
      } catch (err) {
        console.error(`[FAILED] Error updating ${update.phc_id}:`, err);
      }
    }

    console.log(`\nMigration completed! Successfully updated ${successCount}/${verifiedUpdates.length} PHCs.`);

  } catch (error) {
    console.error("Migration script failed:", error);
    process.exit(1);
  }
}

const isExecutionMode = process.argv.includes('--execute');
verifyAndMigrate(isExecutionMode).then(() => process.exit(0)).catch(() => process.exit(1));
