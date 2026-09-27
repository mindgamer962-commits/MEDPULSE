import { db } from '../firebase.js';
import {
  collection,
  doc,
  getDocs,
  getDoc,
  query,
  where,
  writeBatch
} from 'firebase/firestore';

/**
 * Reads all staff records or filtered by phcId.
 * Pure read operation.
 * 
 * @param {string} [phcId] - Optional PHC ID
 * @returns {Promise<Array>} List of staff documents
 */
export async function getStaffRecords(phcId = null) {
  if (!db) return [];
  try {
    const staffCol = collection(db, 'staff');
    let q = staffCol;
    if (phcId) {
      q = query(staffCol, where('phc_id', '==', phcId));
    }
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ ...d.data(), id: d.id }));
  } catch (err) {
    console.error('Error fetching staff records:', err);
    return [];
  }
}

/**
 * Reads attendance records for a target date and optional phcId.
 * Pure read operation.
 * 
 * @param {string} targetDate - Date string YYYY-MM-DD
 * @param {string} [phcId] - Optional PHC ID
 * @returns {Promise<Array>} List of attendance documents
 */
export async function getAttendanceRecords(targetDate = '2026-09-14', phcId = null) {
  if (!db) return [];
  try {
    const attCol = collection(db, 'staff_attendance');
    let q;
    if (phcId && targetDate) {
      q = query(attCol, where('date', '==', targetDate), where('phc_id', '==', phcId));
    } else if (targetDate) {
      q = query(attCol, where('date', '==', targetDate));
    } else {
      q = attCol;
    }
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ ...d.data(), id: d.id }));
  } catch (err) {
    console.error('Error fetching attendance records:', err);
    return [];
  }
}

/**
 * Fetches the dataset metadata document.
 * 
 * @returns {Promise<Object|null>}
 */
export async function getWorkforceMetadata() {
  if (!db) return null;
  try {
    const docRef = doc(db, 'workforce_dataset_metadata', 'prototype_2026_09_14');
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return docSnap.data();
    }
    return null;
  } catch (err) {
    console.error('Error fetching workforce metadata:', err);
    return null;
  }
}

/**
 * Executes a controlled, idempotent batch write of prototype workforce data.
 * Writes ONLY to `staff`, `staff_attendance`, and `workforce_dataset_metadata`.
 * 
 * @param {Object} dataset - Validated dataset containing staff, staffAttendance, metadata
 * @param {Object} [customDb] - Optional custom Firestore instance
 * @returns {Promise<Object>} Migration result summary
 */
export async function writePrototypeWorkforceDataset(dataset, customDb = null) {
  const activeDb = customDb || db;
  if (!activeDb) {
    throw new Error('Firestore instance not available.');
  }

  const { staff, staffAttendance, metadata } = dataset;
  let writesCount = 0;

  // Firestore batches have a limit of 500 operations.
  // We chunk the operations in batches of 400.
  const BATCH_SIZE = 400;
  const operations = [];

  // 1. Queue Staff operations
  for (const s of staff) {
    const ref = doc(activeDb, 'staff', s.staff_id);
    operations.push({ ref, data: s });
  }

  // 2. Queue Attendance operations
  for (const a of staffAttendance) {
    const ref = doc(activeDb, 'staff_attendance', a.attendance_id);
    operations.push({ ref, data: a });
  }

  // 3. Queue Metadata operation
  const metaRef = doc(activeDb, 'workforce_dataset_metadata', metadata.id || 'prototype_2026_09_14');
  operations.push({ ref, data: metadata, isMeta: true });

  // Execute chunked batches
  for (let i = 0; i < operations.length; i += BATCH_SIZE) {
    const chunk = operations.slice(i, i + BATCH_SIZE);
    const batch = writeBatch(activeDb);

    for (const op of chunk) {
      if (op.isMeta) {
        batch.set(metaRef, metadata);
      } else {
        batch.set(op.ref, op.data);
      }
      writesCount++;
    }

    await batch.commit();
  }

  return {
    success: true,
    totalStaffWritten: staff.length,
    totalAttendanceWritten: staffAttendance.length,
    metadataWritten: true,
    totalWrites: writesCount
  };
}
