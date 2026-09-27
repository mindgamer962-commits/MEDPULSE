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

// Simple pseudo-random generator
function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function seedDemoBeds() {
  console.log("Starting Demo Bed Data Seeding...");

  try {
    // 1. Fetch all PHCs
    const phcsCol = collection(db, "phcs");
    const snapshot = await getDocs(phcsCol);
    
    if (snapshot.size === 0) {
      console.log("No PHCs found in the database. Ensure seed scripts have run.");
      return;
    }

    console.log(`Found ${snapshot.size} PHCs. Preparing demo_beds...`);
    const batch = writeBatch(db);

    // 2. Generate and Queue Demo Beds
    for (const phcDoc of snapshot.docs) {
      const phcData = phcDoc.data();
      const phcId = phcDoc.id;

      // Ensure reasonable integer values for demo
      // Total beds between 2000 and 12000 for realistic simulation 
      const totalBeds = getRandomInt(2000, 12000);
      
      // Occupancy between 50% and 98%
      const occupancyPercentage = getRandomInt(50, 98) / 100;
      const occupiedBeds = Math.floor(totalBeds * occupancyPercentage);
      const availableBeds = totalBeds - occupiedBeds;

      // Emergency and ICU beds are subset of total beds
      const emergencyBeds = Math.floor(totalBeds * 0.1);
      const icuBeds = Math.floor(totalBeds * 0.05);

      const demoBedData = {
        phc_id: phcId,
        total_beds: totalBeds,
        occupied_beds: occupiedBeds,
        available_beds: availableBeds,
        emergency_beds: emergencyBeds,
        icu_beds: icuBeds,
        
        // Demo specific fields
        is_demo: true,
        data_source: "DEMO_SIMULATION",
        demo_note: "Simulated data for hackathon demonstration only. Not authoritative PHC capacity.",
        
        last_updated: serverTimestamp()
      };

      const demoBedRef = doc(db, "demo_beds", phcId);
      batch.set(demoBedRef, demoBedData);
      
      console.log(`Prepared demo data for ${phcData.name} (${phcId}): ${totalBeds} total, ${availableBeds} available.`);
    }

    // 3. Commit batch
    console.log(`Committing batch of ${snapshot.size} demo_beds records...`);
    await batch.commit();
    console.log("Demo bed data successfully seeded into 'demo_beds' collection.");

  } catch (error) {
    console.error("Seeding failed:", error);
  }
}

seedDemoBeds().then(() => process.exit(0));
