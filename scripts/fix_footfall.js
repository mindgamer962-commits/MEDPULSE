import 'dotenv/config';
import { db } from '../src/firebase.js';
import { collection, query, getDocs, updateDoc, doc, where } from 'firebase/firestore';

async function fixFootfall() {
  console.log('Finding high footfall records...');
  try {
    const ffRef = collection(db, 'daily_footfall');
    const q = query(ffRef, where('patient_count', '>=', 1000));
    
    const snapshot = await getDocs(q);
    
    if (snapshot.empty) {
      console.log('No high footfall records found.');
      return;
    }
    
    console.log(`Found ${snapshot.size} records. Updating...`);
    
    let updatedCount = 0;
    for (const document of snapshot.docs) {
      const data = document.data();
      if (data.patient_count >= 1000) {
        // Change to a random number between 30 and 100
        const newCount = Math.floor(Math.random() * 70) + 30;
        await updateDoc(doc(db, 'daily_footfall', document.id), {
          patient_count: newCount
        });
        console.log(`Updated doc ${document.id} for PHC ${data.phc_id} from ${data.patient_count} to ${newCount}`);
        updatedCount++;
      }
    }
    
    console.log(`Success! Updated ${updatedCount} records.`);
    process.exit(0);
  } catch (error) {
    console.error('Error fixing footfall:', error);
    process.exit(1);
  }
}

fixFootfall();
