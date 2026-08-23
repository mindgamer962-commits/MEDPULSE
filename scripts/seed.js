import "dotenv/config";
import { initializeApp } from "firebase/app";
import {
  getFirestore,
  collection,
  doc,
  writeBatch,
  getDocs,
  Timestamp
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

const PHC_FACILITIES = [
  // Ahmedabad District
  { phc_id: "phc-koth", name: "PHC Koth", district: "Ahmedabad", latitude: 22.5858, longitude: 72.3392, pattern: "HEALTHY" },
  { phc_id: "phc-sanathal", name: "PHC Sanathal", district: "Ahmedabad", latitude: 22.9567, longitude: 72.4839, pattern: "HEALTHY" },
  { phc_id: "phc-kuha", name: "PHC Kuha", district: "Ahmedabad", latitude: 23.0134, longitude: 72.7667, pattern: "HEALTHY" },
  { phc_id: "phc-vataman", name: "PHC Vataman", district: "Ahmedabad", latitude: 22.4347, longitude: 72.4497, pattern: "HEALTHY" },
  // Gandhinagar District
  { phc_id: "phc-mokhasan", name: "PHC Mokhasan", district: "Gandhinagar", latitude: 23.2355, longitude: 72.4631, pattern: "HEALTHY" },
  { phc_id: "phc-adalaj", name: "PHC Adalaj", district: "Gandhinagar", latitude: 23.1678, longitude: 72.5806, pattern: "GROWING_DEMAND" },
  // Navsari District
  { phc_id: "phc-alipore", name: "PHC Alipore", district: "Navsari", latitude: 20.8039, longitude: 72.9694, pattern: "HEALTHY" },
  { phc_id: "phc-gadat", name: "PHC Gadat", district: "Navsari", latitude: 20.8647, longitude: 73.0234, pattern: "HEALTHY" },
  { phc_id: "phc-hond", name: "PHC Hond", district: "Navsari", latitude: 20.7602, longitude: 73.0289, pattern: "GROWING_DEMAND" },
  // Vadodara District
  { phc_id: "phc-koyali", name: "PHC Koyali", district: "Vadodara", latitude: 22.3556, longitude: 73.1097, pattern: "HEALTHY" },
  // Junagadh District
  { phc_id: "phc-nakra", name: "PHC Nakra", district: "Junagadh", latitude: 21.6034, longitude: 70.3642, pattern: "EMERGENCY_RISK" },
  { phc_id: "phc-kevdra", name: "PHC Kevdra", district: "Junagadh", latitude: 21.5701, longitude: 70.5283, pattern: "EMERGENCY_RISK" },
  // Surendranagar District
  { phc_id: "phc-mojidad", name: "PHC Mojidad", district: "Surendranagar", latitude: 22.4286, longitude: 71.7456, pattern: "GROWING_DEMAND" }
];

const MEDICINES = [
  { medicine_id: "med-ors", name: "ORS", unit: "Packets" },
  { medicine_id: "med-paracetamol", name: "Paracetamol", unit: "Tablets" },
  { medicine_id: "med-amoxicillin", name: "Amoxicillin", unit: "Capsules" },
  { medicine_id: "med-zinc", name: "Zinc", unit: "Tablets" },
  { medicine_id: "med-azithromycin", name: "Azithromycin", unit: "Tablets" }
];

async function deleteCollection(collectionName) {
  const colRef = collection(db, collectionName);
  const snapshot = await getDocs(colRef);
  if (snapshot.size === 0) return;

  console.log(`Clearing ${snapshot.size} documents from ${collectionName}...`);
  let batch = writeBatch(db);
  let count = 0;

  for (const docSnap of snapshot.docs) {
    batch.delete(docSnap.ref);
    count++;
    if (count >= 400) { // Firestore batch limit is 500
      await batch.commit();
      batch = writeBatch(db);
      count = 0;
    }
  }
  if (count > 0) {
    await batch.commit();
  }
}

async function seed() {
  console.log("Starting database seeding...");

  // 1. Clear existing collections to ensure a clean state
  const collectionsToClear = ["phcs", "medicines", "stock_transactions", "daily_footfall"];
  for (const col of collectionsToClear) {
    await deleteCollection(col);
  }

  // 2. Seed Medicines
  console.log("Seeding medicines catalog...");
  const medBatch = writeBatch(db);
  for (const med of MEDICINES) {
    const docRef = doc(db, "medicines", med.medicine_id);
    medBatch.set(docRef, med);
  }
  await medBatch.commit();

  // 3. Seed PHCs
  console.log("Seeding PHC facilities...");
  const phcBatch = writeBatch(db);
  for (const phc of PHC_FACILITIES) {
    const docRef = doc(db, "phcs", phc.phc_id);
    const { pattern, ...metadata } = phc; // strip the pattern key before writing
    phcBatch.set(docRef, {
      ...metadata,
      last_updated: Timestamp.now()
    });
  }
  await phcBatch.commit();

  // 4. Generate 60 days of historical data
  console.log("Generating 60 days of historical operational data...");
  
  // Set up date range
  const daysLimit = 60;
  const now = new Date();
  const startDate = new Date();
  startDate.setDate(now.getDate() - daysLimit);

  let totalTxCount = 0;
  let totalFfCount = 0;
  let batch = writeBatch(db);
  let operationCount = 0;

  const commitBatchIfNeeded = async () => {
    if (operationCount >= 400) {
      await batch.commit();
      batch = writeBatch(db);
      operationCount = 0;
    }
  };

  // Seed initial stock transaction for each PHC-Medicine pair
  const stockTracker = {};
  for (const phc of PHC_FACILITIES) {
    stockTracker[phc.phc_id] = {};
  }

  for (const phc of PHC_FACILITIES) {
    const initialDate = new Date(startDate);
    // Adjust initial date to be 1 day before start date
    initialDate.setDate(initialDate.getDate() - 1);

    for (const med of MEDICINES) {
      let initialQty = 2000; // Default
      if (phc.pattern === "HEALTHY") {
        initialQty = 5000;
      } else if (phc.pattern === "GROWING_DEMAND") {
        initialQty = 2000;
      } else if (phc.pattern === "EMERGENCY_RISK") {
        initialQty = 3500; // Increased to ensure positive ending stock before spike depletion
      }

      stockTracker[phc.phc_id][med.medicine_id] = initialQty;

      const txId = `tx-init-${phc.phc_id}-${med.medicine_id}`;
      const txRef = doc(db, "stock_transactions", txId);
      batch.set(txRef, {
        transaction_id: txId,
        phc_id: phc.phc_id,
        medicine_id: med.medicine_id,
        transaction_type: "RECEIVED",
        quantity: initialQty,
        timestamp: Timestamp.fromDate(initialDate)
      });
      operationCount++;
      totalTxCount++;
      await commitBatchIfNeeded();
    }
  }

  // Iterate day by day
  for (let day = 0; day < daysLimit; day++) {
    const currentDate = new Date(startDate);
    currentDate.setDate(startDate.getDate() + day);

    for (const phc of PHC_FACILITIES) {
      let patientCount = 0;
      
      // Calculate daily patient footfall based on pattern
      if (phc.pattern === "HEALTHY") {
        // Stable baseline: ~30 to 45 patients/day
        patientCount = Math.floor(30 + Math.random() * 15);
      } else if (phc.pattern === "GROWING_DEMAND") {
        // Linearly increasing from ~20 to ~110 patients/day
        const linearFactor = (day / daysLimit) * 90;
        patientCount = Math.floor(20 + linearFactor + Math.random() * 10);
      } else if (phc.pattern === "EMERGENCY_RISK") {
        // Stable at 25-35, then spikes in the last 10 days
        if (day < daysLimit - 10) {
          patientCount = Math.floor(25 + Math.random() * 10);
        } else {
          // Outbreak exponential spike: e.g. day 50 -> 35, day 59 -> 180+
          const outbreakDay = day - (daysLimit - 10); // 0 to 9
          const exponentialFactor = Math.pow(1.22, outbreakDay) * 25;
          patientCount = Math.floor(35 + exponentialFactor + Math.random() * 15);
        }
      }

      // 4a. Log footfall
      const footfallId = `ff-${phc.phc_id}-${day}`;
      const ffRef = doc(db, "daily_footfall", footfallId);
      batch.set(ffRef, {
        footfall_id: footfallId,
        phc_id: phc.phc_id,
        date: Timestamp.fromDate(currentDate),
        patient_count: patientCount
      });
      operationCount++;
      totalFfCount++;
      await commitBatchIfNeeded();

      // 4b. Log medicine consumption (USED transaction)
      for (const med of MEDICINES) {
        let usageRate = 0.5; // default usage per patient

        // Apply distinct consumption rules per medicine & pattern
        if (med.medicine_id === "med-paracetamol") {
          usageRate = 0.8;
        } else if (med.medicine_id === "med-ors") {
          usageRate = 0.4;
          if (phc.pattern === "EMERGENCY_RISK" && day >= daysLimit - 10) {
            // ORS and Zinc demand spikes heavily in outbreak (e.g. cholera/diarrhea emergency)
            usageRate = 2.5; 
          }
        } else if (med.medicine_id === "med-zinc") {
          usageRate = 0.5;
          if (phc.pattern === "EMERGENCY_RISK" && day >= daysLimit - 10) {
            usageRate = 2.0;
          }
        } else if (med.medicine_id === "med-amoxicillin") {
          usageRate = 0.4;
        } else if (med.medicine_id === "med-azithromycin") {
          usageRate = 0.2;
        }

        const calculatedQtyUsed = Math.max(0, Math.floor(patientCount * usageRate + (Math.random() * 5 - 2)));
        const currentStock = stockTracker[phc.phc_id][med.medicine_id] || 0;
        
        // Clamp consumption to available physical stock to prevent negative stock values
        const quantityUsed = Math.min(currentStock, calculatedQtyUsed);
        
        if (quantityUsed > 0) {
          stockTracker[phc.phc_id][med.medicine_id] = currentStock - quantityUsed;

          const txId = `tx-used-${phc.phc_id}-${med.medicine_id}-${day}`;
          const txRef = doc(db, "stock_transactions", txId);
          batch.set(txRef, {
            transaction_id: txId,
            phc_id: phc.phc_id,
            medicine_id: med.medicine_id,
            transaction_type: "USED",
            quantity: quantityUsed,
            timestamp: Timestamp.fromDate(currentDate)
          });
          operationCount++;
          totalTxCount++;
          await commitBatchIfNeeded();
        }
      }

      // 4c. Log periodic stock replenishment (RECEIVED transaction)
      // HEALTHY PHCs get regular stock; GROWING_DEMAND get less; EMERGENCY_RISK get none in the last 20 days
      if (phc.pattern === "HEALTHY" && day > 0 && day % 15 === 0) {
        for (const med of MEDICINES) {
          const replenishmentQty = 1500;
          stockTracker[phc.phc_id][med.medicine_id] = (stockTracker[phc.phc_id][med.medicine_id] || 0) + replenishmentQty;

          const txId = `tx-recv-${phc.phc_id}-${med.medicine_id}-${day}`;
          const txRef = doc(db, "stock_transactions", txId);
          batch.set(txRef, {
            transaction_id: txId,
            phc_id: phc.phc_id,
            medicine_id: med.medicine_id,
            transaction_type: "RECEIVED",
            quantity: replenishmentQty,
            timestamp: Timestamp.fromDate(currentDate)
          });
          operationCount++;
          totalTxCount++;
          await commitBatchIfNeeded();
        }
      } else if (phc.pattern === "GROWING_DEMAND" && day > 0 && day % 20 === 0) {
        for (const med of MEDICINES) {
          const replenishmentQty = 800;
          stockTracker[phc.phc_id][med.medicine_id] = (stockTracker[phc.phc_id][med.medicine_id] || 0) + replenishmentQty;

          const txId = `tx-recv-${phc.phc_id}-${med.medicine_id}-${day}`;
          const txRef = doc(db, "stock_transactions", txId);
          batch.set(txRef, {
            transaction_id: txId,
            phc_id: phc.phc_id,
            medicine_id: med.medicine_id,
            transaction_type: "RECEIVED",
            quantity: replenishmentQty,
            timestamp: Timestamp.fromDate(currentDate)
          });
          operationCount++;
          totalTxCount++;
          await commitBatchIfNeeded();
        }
      }
    }
  }

  // Commit remaining items
  if (operationCount > 0) {
    await batch.commit();
  }

  console.log("\nDatabase Seeding Finished Successfully!");
  console.log(`- Seeded medicines count: ${MEDICINES.length}`);
  console.log(`- Seeded PHCs count: ${PHC_FACILITIES.length}`);
  console.log(`- Created daily footfall logs: ${totalFfCount}`);
  console.log(`- Created stock transactions: ${totalTxCount}`);
  process.exit(0);
}

seed().catch((err) => {
  console.error("Critical error seeding database:", err);
  process.exit(1);
});
