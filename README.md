# blurB - Profile Protection Extension

A Chrome extension that protects your digital privacy by making your online profile unreliable through strategic noise injection.

## The Problem

Every search you make contributes to a detailed profile that data brokers build and sell. These profiles include your age, gender, income level, political views, health concerns, and personal interests. This data is used to manipulate prices, filter job opportunities, calculate insurance premiums, and target you with ads.

Traditional privacy tools like VPNs and ad blockers don't solve this because they don't address behavioral profiling. Even in incognito mode, your search patterns still build a profile of who you are.

## Our Solution

blurB takes a different approach. Instead of hiding your searches, we add strategic noise by injecting contradictory queries. When your digital footprint contains searches from a college student, a retiree, a parent, and a professional all at once, the profile becomes unreliable and worthless.

Data brokers rely on consistency to build confidence. When they see searches about both retirement planning AND college admissions, luxury travel AND budget camping, their algorithms can't determine which signals are real. Confidence scores drop and the data becomes unprofitable.

## Core Features

### Profile Analysis
Upload your Google search history and see exactly what algorithms infer about you - age range, gender, profession, marital status, and interests. Each inference includes a confidence score showing how certain the system is.

### Inverse Persona Generation
The system automatically creates 3-5 personas with opposite characteristics. If you're identified as a 25-year-old male software engineer, personas might include a 55-year-old female teacher, a retired artist, or a college biology student. Each persona gets 15-50 realistic queries.

### Automated Execution
Select personas to activate and blurB handles the rest. Queries execute in background tabs with customizable delays, batch sizes, and scheduling. You can pause, resume, or stop anytime.

### Protection Dashboard
Real-time dashboard showing your protection score (0-100%), before/after demographic comparisons, confidence level changes, and activity timeline. When you see "Unknown" in current demographics, the system can no longer profile you - that's success.

## Installation

### Backend Setup
```bash
pip install -r requirements.txt
python server.py
```
Server runs on http://localhost:5000

### Extension Setup
1. Open chrome://extensions/
2. Enable "Developer mode"
3. Click "Load unpacked" and select project directory
4. blurB icon appears in toolbar

## Usage

### Step 1: Get Your Search History
1. Go to https://takeout.google.com/
2. Select only "My Activity" then "Search"
3. Choose JSON format and download

### Step 2: Analyze Your Profile
1. Click blurB extension icon
2. Upload your JSON file
3. Click "Analyze & Generate Profile"
4. Review your inferred demographics and generated personas

### Step 3: Select and Execute
1. Click "Select Queries to Execute"
2. Browse personas and check boxes for ones to activate
3. Click "Confirm Selection"
4. Click "Execute Selected Queries"
5. Queries run automatically in background

### Step 4: Monitor Protection
Open the dashboard to see your protection score, confidence changes, and which demographics are now "Unknown". The more unknowns, the better protected you are.

## Architecture

### Extension Components

**manifest.json** - Defines permissions (tabs, storage, alarms) and extension configuration

**popup.html/js** - Main UI for file upload, profile display, and execution control

**background.js** - Service worker managing query execution, scheduling, and data persistence in Chrome local storage

**persona-selector.html/js** - Visual interface for reviewing and selecting which personas to activate

**dashboard.html/js** - Analytics showing protection metrics, demographic changes, and timeline (auto-refreshes every 3 seconds)

### Backend Components

**server.py** - Flask API with three endpoints:
- /api/analyze-profile - Processes search history, generates demographic inferences
- /api/generate-personas - Creates inverse personas with contradicting characteristics  
- /api/compare-profiles - Calculates protection metrics by comparing profiles

**personas_agent/** - Core logic for profile analysis and persona generation using keyword matching and pattern recognition

### Data Flow
User uploads history → Backend analyzes → Returns profile + personas → User selects personas → Extension stores locally → Background worker executes queries → User uploads new history → Backend compares → Returns protection metrics → Dashboard displays

## Design Decisions

### Local Backend
We use a local Flask server instead of cloud services to ensure no user data ever leaves their machine. Complete transparency and zero trust requirements, though it adds setup complexity.

### Real Search Engines
Queries execute on Google (not simulated) because real searches create real data in real profiles. Simulated traffic would be detectable and filtered. We can verify effectiveness by re-analyzing history.

### Rule-Based Analysis
Profile analysis uses pattern matching rather than ML models for transparency, speed on consumer hardware, and explainability. Users can understand exactly what's being detected.

### Manual Persona Selection
Users choose which personas to activate for transparency (see exactly what will be searched), control (avoid inappropriate queries), and customization (pick personas that make sense).

## Configuration

In extension popup:
- Query Delay: Seconds between searches (default: 3)
- Queries Per Session: Batch size (default: 10)
- Auto Mode Interval: Scheduled execution frequency

In server.py:
```python
PERSONA_COUNT = 3  # Number of personas to generate
MIN_QUERIES_PER_PERSONA = 15
MAX_QUERIES_PER_PERSONA = 50
CONFIDENCE_THRESHOLD = 0.6  # Minimum confidence to show inference
```

## Understanding Protection Metrics

**Protection Score (0-100%)**: Overall profile degradation measure
- 0-25%: Minimal protection, add more queries
- 25-50%: Moderate protection, profile unclear
- 50-75%: Good protection, significant uncertainty
- 75-100%: Excellent protection, highly unreliable

**Confidence Changes**: For each attribute shows initial confidence, current confidence, and delta. Negative delta is good, positive means add more queries.

**Unknown Demographics**: When current shows "Unknown", the system cannot confidently determine that attribute. This is the goal - being unprofitable.

## Privacy & Security

**Data that leaves your machine:**
- Search history sent to localhost:5000 only
- Search queries sent to Google when executing

**Data that stays local:**
- All profile data
- All persona data  
- All execution history
- All settings

**What we collect:** Nothing. No analytics, tracking, or telemetry.

**Open Source:** All code is visible and auditable.

## API Reference

### POST /api/analyze-profile
Analyzes search history and generates demographic profile.

Request:
```json
{
  "searches": [
    {"query": "python tutorial", "timestamp": 1234567890}
  ]
}
```

Response:
```json
{
  "success": true,
  "profile": {
    "demographics": {"age_range": "24-35", "gender": "male"},
    "interests": {"technology": 0.85},
    "confidence_scores": {"age_range": 0.78}
  }
}
```

### POST /api/generate-personas
Creates inverse personas based on profile.

Request:
```json
{
  "profile": {...},
  "count": 3
}
```

Response:
```json
{
  "success": true,
  "personas": [
    {
      "id": "persona_1",
      "title": "Retired Artist",
      "demographics": {"age_range": "55-65", "gender": "female"},
      "queries": ["watercolor techniques for beginners", ...]
    }
  ]
}
```

### POST /api/compare-profiles
Compares initial and updated profiles to calculate protection metrics.

Request:
```json
{
  "initialProfile": {...},
  "updatedProfile": {...}
}
```

Response:
```json
{
  "success": true,
  "comparison": {
    "demographic_changes": {
      "age_range": {"initial": "24-35", "updated": "Unknown"}
    },
    "confidence_deltas": {
      "age_range": {"initial_confidence": 0.78, "updated_confidence": 0.15, "delta": -0.63}
    },
    "protection_score": 67.5
  }
}
```

## License

MIT License - Created for HackNC State 2026
