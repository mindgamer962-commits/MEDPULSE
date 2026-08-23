# MedPulse AI — MVP Specification

## 1. Project Goal

MedPulse is an AI-powered healthcare supply-chain platform for Primary Health Centres (PHCs).

The core goal is to predict medicine shortages before they happen and recommend safe redistribution of medicine from nearby PHCs with surplus stock.

## 2. Core Innovation

MedPulse changes healthcare inventory management from reactive to predictive:

> Predict the shortage before it happens, then recommend where the stock should come from.

Core flow:

PHC inventory + patient footfall
        ↓
AI demand forecasting
        ↓
Stock-out prediction
        ↓
Nearby surplus detection
        ↓
Transfer recommendation
        ↓
Health officer approval
        ↓
Inventory update

## 3. MVP Scope

### Must Have

1. Stock received
2. Stock used
3. Current stock
4. Patient footfall
5. AI demand forecast
6. Stock-out prediction
7. Nearby PHC surplus detection
8. Transfer recommendation
9. Transport / lead time
10. Human approval

### Nice to Have

- Medicine expiry
- Safety stock
- Incoming shipment
- Data freshness indicator
- Emergency simulation mode

### Explicitly Out of Scope

Do NOT build these in the MVP unless the core flow is already complete:

- Patient medical records
- Disease diagnosis
- Bed management
- Medical staff attendance
- Ambulance tracking
- Full procurement system
- Blockchain
- Healthcare chatbot
- Full BRICS deployment
- Mobile applications for every stakeholder

## 4. Day 1 Scope

Day 1 focuses only on the data and inventory foundation.

Build:

- PHC management
- Medicine management
- Stock received
- Stock used
- Current stock calculation
- Patient footfall recording
- Basic dashboard

Do NOT build AI forecasting, stock-out prediction, redistribution, chatbot, or federated learning on Day 1.

## 5. Critical Data Architecture Rule

### Database is the single source of truth.

Demo/seed data must ONLY populate the database with realistic starting records.

Demo data MUST NOT be hardcoded inside:

- AI prompts
- AI prediction logic
- Stock calculation logic
- Redistribution logic
- Frontend business logic

The application must fetch the latest data from the database at runtime.

If a user changes stock received, stock used, or patient footfall, the next calculation or prediction must use the updated database values.

Example:

Initial:
- PHC A stock = 500

User records 200 units used.

The application must then show:
- PHC A stock = 300

The system must never continue using the hardcoded value of 500.

## 6. User Roles

### PHC Operator

Can:
- View medicine inventory
- Record stock received
- Record stock used
- Record daily patient footfall

### Health Officer

Can:
- View PHC network
- View stock-out alerts
- Review AI recommendations
- Approve or reject redistribution

For the MVP, authentication can be simplified if necessary, but permissions should be represented in the application architecture.

## 7. Database Schema

### PHC

Fields:

- phc_id
- name
- district
- latitude
- longitude
- last_updated

### Medicine

Fields:

- medicine_id
- name
- unit

### Stock Transaction

Fields:

- transaction_id
- phc_id
- medicine_id
- transaction_type
- quantity
- timestamp

Transaction types:

- RECEIVED
- USED
- TRANSFER_IN
- TRANSFER_OUT

### Daily Footfall

Fields:

- footfall_id
- phc_id
- date
- patient_count

### Optional: Shipment

Fields:

- shipment_id
- phc_id
- medicine_id
- quantity
- expected_arrival
- status

### Optional: Medicine Batch

Fields:

- batch_id
- phc_id
- medicine_id
- quantity
- expiry_date

## 8. Inventory Logic

For the basic MVP:

Current Stock = Previous Stock + Received - Used

When redistribution is implemented:

Current Stock = Previous Stock + Received + Transfer In - Used - Transfer Out

Inventory calculations must happen in backend/business logic, not inside an AI prompt.

The frontend displays the calculated result.

## 9. Patient Footfall

Record aggregated daily patient counts per PHC.

Do NOT store patient names, individual medical records, or personally identifiable patient information in the MVP.

Example:

PHC-01
Date: 2026-08-19
Patients: 185

Patient footfall will later be used as an input to demand forecasting.

## 10. AI Architecture

AI should be used meaningfully.

### AI responsibilities

- Forecast future medicine demand
- Identify increasing/decreasing demand patterns
- Estimate stock-out timing
- Explain why a PHC is at risk

### Backend responsibilities

- Calculate current stock
- Calculate usable stock
- Calculate safety stock when enabled
- Calculate safe surplus
- Calculate transport/lead time
- Find eligible nearby PHCs
- Execute approved transfers
- Validate recommendations

Do NOT ask an LLM to perform critical inventory arithmetic that can be handled deterministically by backend code.

## 11. Runtime AI Data Flow

The AI must NOT receive hardcoded demo values.

Correct flow:

Database
   ↓
Fetch latest PHC + medicine + usage + footfall data
   ↓
Create AI input/features
   ↓
Demand forecasting model
   ↓
Forecast result
   ↓
Stock-out risk calculation
   ↓
Recommendation engine
   ↓
Gemini explanation

The AI input must always be generated from current database data.

## 12. Redistribution Logic

When a PHC is predicted to face a shortage:

1. Find nearby PHCs.
2. Check the same medicine.
3. Calculate each source PHC's safe surplus.
4. Check transport distance.
5. Check transport lead time.
6. Do not recommend a source that would create another shortage.
7. Select the best eligible source.
8. Recommend a transfer quantity.
9. Require health officer approval.

Example:

Destination PHC:
- Current stock: 270
- Forecast demand: 340
- Required quantity: 70

Source PHC:
- Current stock: 800
- Forecast demand: 400
- Safety stock: 150
- Safe surplus: 250

Possible recommendation:
- Transfer 70 units.

## 13. Human Approval

AI recommendations must never automatically execute a transfer.

The workflow is:

AI recommendation
    ↓
Health Officer reviews
    ↓
APPROVE / REJECT
    ↓
If approved:
Create TRANSFER_OUT transaction
Create TRANSFER_IN transaction
Update inventory
Record approval

## 14. Error and Edge Cases

The system should handle:

### No nearby surplus

Show:

> No safe redistribution source found.

Do not invent a source.

### Stale data

Show:

> Data is stale. Prediction confidence is reduced.

### Transport too slow

If stock-out is expected before the transfer can arrive:

> Transfer may arrive too late. Escalation required.

### Source would become low-stock

Do not recommend transferring stock if the source PHC would fall below its required stock level.

### Insufficient historical data

Show:

> Insufficient historical data for reliable forecasting.

Do not fabricate a confident prediction.

## 15. Demo Data

Create realistic seed data for the MVP.

Recommended starting dataset:

- 20–50 PHCs
- 2–3 districts
- 5 essential medicines
- 30–60 days of historical stock usage
- 30–60 days of patient footfall
- Several PHCs with surplus
- Several PHCs with shortage risk
- A small number of emergency/outbreak scenarios

Seed data must be inserted into the database as normal records.

After seeding, the application must treat it exactly like user-entered data.

## 16. Dashboard

### Network Overview

Display:

- Total PHCs
- Medicines monitored
- Critical PHCs
- At-risk PHCs
- Healthy PHCs
- Top stock-out alerts

### PHC Details

Display:

- Current stock
- Recent usage
- Patient footfall
- Forecast demand
- Estimated stock-out date
- Risk level
- Last data update

### Recommendation

Display:

- Destination PHC
- Medicine
- Required quantity
- Source PHC
- Safe surplus
- Distance
- Transport time
- Reason for recommendation
- Approve / Reject

## 17. Emergency Simulation

If implemented, provide a button:

> Simulate Health Emergency

The simulation should increase patient footfall and/or medicine consumption in selected PHCs.

The application must then recalculate predictions from the database.

Do not create a separate hardcoded AI response for emergency mode.

## 18. Technology

Preferred stack:

Frontend:
- React / Next.js

Backend:
- Python / FastAPI

Database:
- Firebase Firestore

AI:
- Google Vertex AI
- Gemini

Deployment:
- Google Cloud Run

Use the simplest implementation that produces a reliable end-to-end demo.

## 19. Build Principles

1. Working functionality is more important than feature count.
2. Database is the single source of truth.
3. Demo data is seed data, not hardcoded AI knowledge.
4. AI forecasts; backend validates and calculates.
5. Human approves resource transfers.
6. No unnecessary healthcare features.
7. Every major action should be demonstrable in the UI.
8. All predictions must be reproducible from database state.
9. Do not expose sensitive patient information.
10. Design APIs and data models so the system can later support multiple countries.

## 20. Acceptance Criteria

The MVP is considered functional when the following works end-to-end:

### Test A — Inventory

1. Create PHC.
2. Add medicine.
3. Record stock received.
4. Record stock used.
5. Current stock updates correctly.

### Test B — Demand

1. Record daily patient footfall.
2. Record medicine usage.
3. Run forecast.
4. Forecast uses database data.

### Test C — Stock-out

1. Reduce stock or increase demand.
2. Run prediction.
3. System detects increased stock-out risk.

### Test D — Redistribution

1. PHC A becomes high risk.
2. PHC B has safe surplus.
3. System checks distance and lead time.
4. System recommends a transfer.

### Test E — Approval

1. Health officer reviews recommendation.
2. Officer approves.
3. Transfer transactions are created.
4. Both PHC inventories update.

### Test F — Dynamic Data

Change database values after the demo dataset has been seeded.

The AI prediction and recommendation MUST change according to the new data.

## 21. Final Product Principle

MedPulse is NOT primarily an inventory dashboard.

The dashboard is only the interface.

The core innovation is:

> Predict the shortage before it happens and recommend the safest way to prevent it.

Build the smallest reliable system that demonstrates this loop end-to-end.
