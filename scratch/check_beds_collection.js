import { db } from '../src/firebase.js';
import { collection, getDocs } from 'firebase/firestore';

async function checkBeds() {
  console.log('Checking beds collection in Firestore...');
  const snap = await getDocs(collection(db, 'beds'));
  console.log(`Current beds collection size: ${snap.size}`);
  snap.forEach(doc => {
    console.log(`Doc ID: ${doc.id}, Data:`, doc.data());
  });
}

checkBeds().catch(err => console.error(err));
