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

// 15 New PHCs with assigned patterns
const NEW_PHCS = [
  // Maharashtra
  { phc_id: "phc-nimgaon", pattern: "HEALTHY" },
  { phc_id: "phc-kumathe", pattern: "HEALTHY" },
  { phc_id: "phc-jamsar", pattern: "GROWING_DEMAND" },
  { phc_id: "phc-kaman", pattern: "HEALTHY" },
  { phc_id: "phc-borsar", pattern: "EMERGENCY_RISK" },

  // Rajasthan
  { phc_id: "phc-bhankrota", pattern: "HEALTHY" },
  { phc_id: "phc-achrol", pattern: "GROWING_DEMAND" },
  { phc_id: "phc-boraj", pattern: "HEALTHY" },
  { phc_id: "phc-mandore", pattern: "EMERGENCY_RISK" },
  { phc_id: "phc-netra", pattern: "HEALTHY" },

  // Uttar Pradesh
  { phc_id: "phc-chinhat", pattern: "HEALTHY" },
  { phc_id: "phc-mohanlalganj", pattern: "GROWING_DEMAND" },
  { phc_id: "phc-kakori", pattern: "HEALTHY" },
  { phc_id: "phc-malihabad", pattern: "HEALTHY" },
  { phc_id: "phc-barabanki-rural", pattern: "HEALTHY" }
];

const MEDICINES = [
  { medicine_id: "med-ors", name: "ORS", unit: "Packets" },
  { medicine_id: "med-paracetamol", name: "Paracetamol", unit: "Tablets" },
  { medicine_id: "med-amoxicillin", name: "Amoxicillin", unit: "Capsules" },
  { medicine_id: "med-zinc", name: "Zinc", unit: "Tablets" },
  { medicine_id: "med-azithromycin", name: "Azithromycin", unit: "Tablets" }
];

async function seedPhase2Operational() {
  console.log("Generating 60 days of historical operational data for Phase 2 PHCs...");
  
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

  const stockTracker = {};
  for (const phc of NEW_PHCS) {
    stockTracker[phc.phc_id] = {};
  }

  // 1. Initial Stock
  for (const phc of NEW_PHCS) {
    const initialDate = new Date(startDate);
    initialDate.setDate(initialDate.getDate() - 1);

    for (const med of MEDICINES) {
      let initialQty = 2000;
      if (phc.pattern === "HEALTHY") {
        initialQty = 5000;
      } else if (phc.pattern === "GROWING_DEMAND") {
        initialQty = 2000;
      } else if (phc.pattern === "EMERGENCY_RISK") {
        initialQty = 3500;
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
      }, { merge: true });
      operationCount++;
      totalTxCount++;
      await commitBatchIfNeeded();
    }
  }

  // 2. Day-by-day operations
  for (let day = 0; day < daysLimit; day++) {
    const currentDate = new Date(startDate);
    currentDate.setDate(startDate.getDate() + day);

    for (const phc of NEW_PHCS) {
      let patientCount = 0;
      
      if (phc.pattern === "HEALTHY") {
        patientCount = Math.floor(30 + Math.random() * 15);
      } else if (phc.pattern === "GROWING_DEMAND") {
        const linearFactor = (day / daysLimit) * 90;
        patientCount = Math.floor(20 + linearFactor + Math.random() * 10);
      } else if (phc.pattern === "EMERGENCY_RISK") {
        if (day < daysLimit - 10) {
          patientCount = Math.floor(25 + Math.random() * 10);
        } else {
          const outbreakDay = day - (daysLimit - 10);
          const exponentialFactor = Math.pow(1.22, outbreakDay) * 25;
          patientCount = Math.floor(35 + exponentialFactor + Math.random() * 15);
        }
      }

      // Log footfall
      const footfallId = `ff-${phc.phc_id}-${day}`;
      const ffRef = doc(db, "daily_footfall", footfallId);
      batch.set(ffRef, {
        footfall_id: footfallId,
        phc_id: phc.phc_id,
        date: Timestamp.fromDate(currentDate),
        patient_count: patientCount
      }, { merge: true });
      operationCount++;
      totalFfCount++;
      await commitBatchIfNeeded();

      // Log consumption
      for (const med of MEDICINES) {
        let usageRate = 0.5;

        if (med.medicine_id === "med-paracetamol") {
          usageRate = 0.8;
        } else if (med.medicine_id === "med-ors") {
          usageRate = 0.4;
          if (phc.pattern === "EMERGENCY_RISK" && day >= daysLimit - 10) {
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
          }, { merge: true });
          operationCount++;
          totalTxCount++;
          await commitBatchIfNeeded();
        }
      }
    }
  }

  if (operationCount > 0) {
    await batch.commit();
  }

  console.log(`Generated ${totalTxCount} stock transactions and ${totalFfCount} daily footfall records.`);
  console.log("Phase 2 Operational Data seeding completed successfully!");
}

seedPhase2Operational().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
