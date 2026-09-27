import fs from 'fs';
import { execSync } from 'child_process';

async function deployRules() {
  const token = execSync('gcloud auth print-access-token').toString().trim();
  const rulesContent = fs.readFileSync('firestore.rules', 'utf8');

  console.log('1. Creating new ruleset on projects/medpulse-43e02...');
  const createRes = await fetch('https://firebaserules.googleapis.com/v1/projects/medpulse-43e02/rulesets', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'x-goog-user-project': 'medpulse-43e02',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      source: {
        files: [
          {
            name: 'firestore.rules',
            content: rulesContent
          }
        ]
      }
    })
  });

  const createJson = await createRes.json();
  if (!createRes.ok) {
    console.error('Failed to create ruleset:', createJson);
    process.exit(1);
  }

  const rulesetName = createJson.name;
  console.log('Created ruleset:', rulesetName);

  console.log('2. Releasing ruleset to projects/medpulse-43e02/releases/cloud.firestore...');
  const releaseRes = await fetch('https://firebaserules.googleapis.com/v1/projects/medpulse-43e02/releases/cloud.firestore', {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${token}`,
      'x-goog-user-project': 'medpulse-43e02',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      release: {
        name: 'projects/medpulse-43e02/releases/cloud.firestore',
        rulesetName: rulesetName
      }
    })
  });

  const releaseJson = await releaseRes.json();
  if (!releaseRes.ok) {
    console.error('Failed to update release:', releaseJson);
    process.exit(1);
  }

  console.log('Successfully released ruleset:', releaseJson);
}

deployRules();
