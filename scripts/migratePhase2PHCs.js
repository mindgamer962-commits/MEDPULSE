import "dotenv/config";
import { initializeApp } from "firebase/app";
import {
  getFirestore,
  collection,
  doc,
  writeBatch,
  getDocs,
  serverTimestamp
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID,
};

if (!firebaseConfig.projectId) {
  console.error("Error: Firebase Project ID is missing. Check your .env file.");
  process.exit(1);
}

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// New states required for Phase 2 expansion
const STATES = [
  { state_id: "MH", name: "Maharashtra", code: "MH", active: true },
  { state_id: "RJ", name: "Rajasthan", code: "RJ", active: true },
  { state_id: "UP", name: "Uttar Pradesh", code: "UP", active: true }
];

// New districts mapping to the Phase 2 states
const DISTRICTS = [
  // Maharashtra Districts
  { district_id: "PUN", name: "Pune", state_id: "MH", state_name: "Maharashtra", active: true },
  { district_id: "SAT", name: "Satara", state_id: "MH", state_name: "Maharashtra", active: true },
  { district_id: "PAL", name: "Palghar", state_id: "MH", state_name: "Maharashtra", active: true },
  { district_id: "AUR", name: "Aurangabad", state_id: "MH", state_name: "Maharashtra", active: true },

  // Rajasthan Districts
  { district_id: "JAI", name: "Jaipur", state_id: "RJ", state_name: "Rajasthan", active: true },
  { district_id: "JOD", name: "Jodhpur", state_id: "RJ", state_name: "Rajasthan", active: true },
  { district_id: "PLI", name: "Pali", state_id: "RJ", state_name: "Rajasthan", active: true },

  // Uttar Pradesh Districts
  { district_id: "LKO", name: "Lucknow", state_id: "UP", state_name: "Uttar Pradesh", active: true },
  { district_id: "BAR", name: "Barabanki", state_id: "UP", state_name: "Uttar Pradesh", active: true }
];

// 15 New PHCs (Delhi explicitly excluded as per requirements)
// Lat/Lng are omitted as verified data was not provided in the source requirement
const NEW_PHCS = [
  // Maharashtra
  { phc_id: "phc-nimgaon", name: "PHC Nimgaon", district: "Pune", state_id: "MH", state_name: "Maharashtra", district_id: "PUN", district_name: "Pune" },
  { phc_id: "phc-kumathe", name: "PHC Kumathe", district: "Satara", state_id: "MH", state_name: "Maharashtra", district_id: "SAT", district_name: "Satara" },
  { phc_id: "phc-jamsar", name: "PHC Jamsar", district: "Palghar", state_id: "MH", state_name: "Maharashtra", district_id: "PAL", district_name: "Palghar" },
  { phc_id: "phc-kaman", name: "PHC Kaman", district: "Palghar", state_id: "MH", state_name: "Maharashtra", district_id: "PAL", district_name: "Palghar" },
  { phc_id: "phc-borsar", name: "PHC Borsar", district: "Aurangabad", state_id: "MH", state_name: "Maharashtra", district_id: "AUR", district_name: "Aurangabad" },

  // Rajasthan
  { phc_id: "phc-bhankrota", name: "PHC Bhankrota", district: "Jaipur", state_id: "RJ", state_name: "Rajasthan", district_id: "JAI", district_name: "Jaipur" },
  { phc_id: "phc-achrol", name: "PHC Achrol", district: "Jaipur", state_id: "RJ", state_name: "Rajasthan", district_id: "JAI", district_name: "Jaipur" },
  { phc_id: "phc-boraj", name: "PHC Boraj", district: "Jaipur", state_id: "RJ", state_name: "Rajasthan", district_id: "JAI", district_name: "Jaipur" },
  { phc_id: "phc-mandore", name: "PHC Mandore", district: "Jodhpur", state_id: "RJ", state_name: "Rajasthan", district_id: "JOD", district_name: "Jodhpur" },
  { phc_id: "phc-netra", name: "PHC Netra", district: "Pali", state_id: "RJ", state_name: "Rajasthan", district_id: "PLI", district_name: "Pali" },

  // Uttar Pradesh
  { phc_id: "phc-chinhat", name: "PHC Chinhat", district: "Lucknow", state_id: "UP", state_name: "Uttar Pradesh", district_id: "LKO", district_name: "Lucknow" },
  { phc_id: "phc-mohanlalganj", name: "PHC Mohanlalganj", district: "Lucknow", state_id: "UP", state_name: "Uttar Pradesh", district_id: "LKO", district_name: "Lucknow" },
  { phc_id: "phc-kakori", name: "PHC Kakori", district: "Lucknow", state_id: "UP", state_name: "Uttar Pradesh", district_id: "LKO", district_name: "Lucknow" },
  { phc_id: "phc-malihabad", name: "PHC Malihabad", district: "Lucknow", state_id: "UP", state_name: "Uttar Pradesh", district_id: "LKO", district_name: "Lucknow" },
  { phc_id: "phc-barabanki-rural", name: "PHC Barabanki Rural", district: "Barabanki", state_id: "UP", state_name: "Uttar Pradesh", district_id: "BAR", district_name: "Barabanki" }
];

async function migratePhase2PHCs() {
  console.log("Starting Phase 2 PHC Additions Migration...");

  try {
    const batch = writeBatch(db);

    // 1. Create/Update States
    console.log("Queueing States...");
    for (const state of STATES) {
      const stateRef = doc(db, "states", state.state_id);
      batch.set(stateRef, state, { merge: true });
    }

    // 2. Create/Update Districts
    console.log("Queueing Districts...");
    for (const district of DISTRICTS) {
      const districtRef = doc(db, "districts", district.district_id);
      batch.set(districtRef, district, { merge: true });
    }

    // 3. Create/Update PHCs
    console.log("Queueing PHCs (Merge/Upsert to prevent overwrites)...");
    for (const phc of NEW_PHCS) {
      const phcRef = doc(db, "phcs", phc.phc_id);
      
      // Use merge: true to ensure we only insert/update the explicit fields
      // and preserve any existing data (like latitude/longitude if it exists)
      batch.set(phcRef, {
        ...phc,
        last_updated: serverTimestamp() // Add updated timestamp
      }, { merge: true });
      
      console.log(`Prepared upsert for PHC: ${phc.phc_id} (${phc.name})`);
    }

    console.log(`Committing batch with ${STATES.length} States, ${DISTRICTS.length} Districts, and ${NEW_PHCS.length} PHCs...`);
    await batch.commit();
    console.log("Migration completed successfully.");

  } catch (error) {
    console.error("Migration failed:", error);
  }
}

migratePhase2PHCs().then(() => process.exit(0));
