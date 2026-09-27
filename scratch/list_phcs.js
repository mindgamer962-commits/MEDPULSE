import { getPHCs } from '../src/services/db.js';

async function run() {
  try {
    const phcs = await getPHCs();
    console.log(`Total PHCs: ${phcs.length}`);
    phcs.forEach(phc => {
      console.log(`${phc.phc_id} | ${phc.name} | ${phc.state} | ${phc.district} | ${phc.address || ''}`);
    });
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

run();
