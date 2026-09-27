import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

import dotenv from 'dotenv';
dotenv.config();

const firebaseConfig = {
    apiKey: process.env.VITE_FIREBASE_API_KEY,
    authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.VITE_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function runAudit() {
    try {
        console.log("Fetching daily_footfall...");
        const snapshot = await getDocs(collection(db, 'daily_footfall'));
        const records = [];
        snapshot.forEach(doc => records.push({ id: doc.id, ...doc.data() }));

        const phcs = {};
        let duplicateCount = 0;
        let invalidCount = 0;
        let outliers = 0;
        
        let minDate = new Date('2999-01-01');
        let maxDate = new Date('1970-01-01');

        records.forEach(r => {
            const phcId = r.phc_id;
            let dateStr = r.date;
            const footfall = r.patient_count;

            if (r.date && typeof r.date.toDate === 'function') {
                dateStr = r.date.toDate().toISOString().split('T')[0];
            } else if (r.date instanceof Date) {
                dateStr = r.date.toISOString().split('T')[0];
            }

            if (!phcId) {
                console.log("Missing PHC ID in doc:", r.id);
                invalidCount++;
                return;
            }

            if (!phcs[phcId]) {
                phcs[phcId] = { records: [], dates: new Set() };
            }

            if (typeof footfall !== 'number' || isNaN(footfall) || footfall < 0) {
                console.log("Invalid footfall in doc:", r.id, footfall);
                invalidCount++;
            }
            if (footfall > 1000) {
                console.log("Outlier footfall in doc:", r.id, footfall);
                outliers++;
            }

            if (phcs[phcId].dates.has(dateStr)) {
                console.log("Duplicate date in PHC:", phcId, dateStr);
                duplicateCount++;
            }
            phcs[phcId].dates.add(dateStr);
            phcs[phcId].records.push(r);

            if (dateStr) {
                const d = new Date(dateStr);
                if (d < minDate) minDate = d;
                if (d > maxDate) maxDate = d;
            }
        });

        console.log(`Duplicates: ${duplicateCount}`);
        console.log(`Invalid/Missing fields: ${invalidCount}`);
        console.log(`Outliers (>1000): ${outliers}`);
        
        // Find date gaps for the first PHC as sample
        const p1 = Object.keys(phcs)[0];
        const p1Dates = Array.from(phcs[p1].dates).sort();
        let gaps = 0;
        for (let i = 1; i < p1Dates.length; i++) {
            const d1 = new Date(p1Dates[i-1]);
            const d2 = new Date(p1Dates[i]);
            const diffDays = Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
            if (diffDays > 1) {
                gaps++;
            }
        }
        console.log(`Sample PHC ${p1} - Gaps: ${gaps}`);

    } catch (e) {
        console.error(e);
    }
}

runAudit();
