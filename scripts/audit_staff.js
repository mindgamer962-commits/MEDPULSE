import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });
import { collection, getDocs, limit } from 'firebase/firestore';
import { db } from '../src/firebase.js';

const collectionsToCheck = [
  'staff', 'personnel', 'doctors', 'nurses', 'medical_officers',
  'employees', 'attendance', 'shifts', 'workforce', 'staff_availability'
];

async function checkCollections() {
  console.log("Checking Firestore collections for personnel data...\n");
  for (const collName of collectionsToCheck) {
    try {
      const q = collection(db, collName);
      const snapshot = await getDocs(q);
      console.log(`Collection '${collName}': ${snapshot.empty ? 'EMPTY / NOT FOUND' : `FOUND (${snapshot.size} docs)`}`);
    } catch (e) {
      console.log(`Collection '${collName}': ERROR (${e.code})`);
    }
  }
  process.exit(0);
}

checkCollections();
