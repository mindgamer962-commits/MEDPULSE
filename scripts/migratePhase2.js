import "dotenv/config";
import { initializeApp } from "firebase/app";
import {
  getFirestore,
  collection,
  doc,
  writeBatch,
  getDocs
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

const STATE_GJ = {
  state_id: "GJ",
  name: "Gujarat",
  code: "GJ",
  active: true
};

const DISTRICTS = [
  { district_id: "AHM", name: "Ahmedabad", state_id: "GJ", state_name: "Gujarat", active: true },
  { district_id: "GAN", name: "Gandhinagar", state_id: "GJ", state_name: "Gujarat", active: true },
  { district_id: "NAV", name: "Navsari", state_id: "GJ", state_name: "Gujarat", active: true },
  { district_id: "VAD", name: "Vadodara", state_id: "GJ", state_name: "Gujarat", active: true },
  { district_id: "JUN", name: "Junagadh", state_id: "GJ", state_name: "Gujarat", active: true },
  { district_id: "SUR", name: "Surendranagar", state_id: "GJ", state_name: "Gujarat", active: true }
];

async function migratePhase2() {
  console.log("Starting Phase 2 Migration...");

  try {
    const batch = writeBatch(db);

    // 1. Create/Update State
    console.log(`Setting state: ${STATE_GJ.name}`);
    const stateRef = doc(db, "states", STATE_GJ.state_id);
    batch.set(stateRef, STATE_GJ, { merge: true });

    // 2. Create/Update Districts
    for (const d of DISTRICTS) {
      console.log(`Setting district: ${d.name}`);
      const districtRef = doc(db, "districts", d.district_id);
      batch.set(districtRef, d, { merge: true });
    }

    // 3. Update PHCs
    console.log("Fetching existing PHCs...");
    const phcSnapshot = await getDocs(collection(db, "phcs"));
    
    let updatedCount = 0;
    phcSnapshot.forEach((phcDoc) => {
      const phc = phcDoc.data();
      const existingDistrictName = phc.district;
      
      const matchedDistrict = DISTRICTS.find(d => d.name === existingDistrictName);
      
      if (matchedDistrict) {
        const phcRef = doc(db, "phcs", phcDoc.id);
        const updates = {
          state_id: STATE_GJ.state_id,
          state_name: STATE_GJ.name,
          district_id: matchedDistrict.district_id,
          district_name: matchedDistrict.name
        };
        batch.set(phcRef, updates, { merge: true });
        console.log(`Queueing update for PHC: ${phc.name} (${phcDoc.id}) -> ${updates.district_name}, ${updates.state_name}`);
        updatedCount++;
      } else {
        console.warn(`WARNING: No matching district found for PHC: ${phc.name} (District: ${existingDistrictName})`);
      }
    });

    console.log(`Committing batch with State, ${DISTRICTS.length} Districts, and ${updatedCount} PHC updates...`);
    await batch.commit();
    console.log("Phase 2 Migration completed successfully.");

  } catch (error) {
    console.error("Migration failed:", error);
  }
}

migratePhase2().then(() => process.exit(0));
