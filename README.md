# 🛡️ blurB - Profile Obfuscation Extension

A Chrome extension that protects your digital footprint by generating and executing inverse search patterns to obfuscate your online profile.

## 📋 Overview

blurB analyzes your search history to create a profile, then generates inverse personas with opposing characteristics. By executing these inverse search queries, it obscures the accuracy of any profile that advertisers or data brokers might build about you.

## 🌟 Features

### ✅ Completed Features

1. **Profile Analysis**
   - Upload search history JSON
   - Demographic inference (age, gender, profession, marital status)
   - Interest categorization
   - Confidence scoring

2. **Inverse Persona Generation**
   - Generate 3+ contrasting personas
   - Automatic query generation (15-50 queries per persona)
   - Smart category-based query creation

3. **Query Execution System**
   - Visual persona selector interface
   - Batch query execution
   - Background processing
   - Progress tracking

4. **Profile Comparison Dashboard**
   - Before/after demographic comparison
   - Confidence delta calculations
   - Interest diversity tracking
   - Obfuscation effectiveness score
   - Interactive charts and visualizations

5. **Auto Mode**
   - Scheduled automatic query execution
   - Customizable intervals
   - Background operation

## 🏗️ Architecture

### Frontend (Chrome Extension)
```
├── manifest.json          # Extension configuration
├── popup.html            # Main UI
├── popup.js              # UI logic
├── background.js         # Service worker
├── persona-selector.html # Persona selection UI
├── persona-selector.js   # Selection logic
├── dashboard.html        # Analytics dashboard
└── dashboard.js          # Dashboard logic
```

### Backend (Python Flask)
```
├── server.py             # Flask API server
├── requirements.txt      # Python dependencies
└── personas_agent/       # (Your existing code)
```

## 🚀 Installation & Setup

### Prerequisites
- Python 3.8+
- Chrome Browser
- pip (Python package manager)

### Backend Setup

1. **Install Python dependencies:**
```bash
pip install -r requirements.txt
```

2. **Start the Flask server:**
```bash
python server.py
```

The server will start on `http://localhost:5000`

### Extension Setup

1. **Open Chrome Extensions page:**
   - Navigate to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top right)

2. **Load the extension:**
   - Click "Load unpacked"
   - Select the project directory

3. **Verify installation:**
   - Extension icon should appear in toolbar
   - Click icon to open popup

## 📖 Usage Guide

### Step 1: Upload Search History

1. Export your Google search history:
   - Go to [Google Takeout](https://takeout.google.com/)
   - Select "My Activity" → "Search"
   - Download as JSON

2. In the extension popup:
   - Click the upload area
   - Select your downloaded JSON file
   - Click "Analyze & Generate Profile"

### Step 2: Select Queries

1. After analysis completes:
   - Click "Select Queries to Execute"
   - Browse generated personas
   - Click "View Queries" to expand each persona
   - Select queries you want to execute
   - Click "Confirm Selection"

### Step 3: Execute Queries

1. In the popup:
   - Click "Execute Selected Queries"
   - Queries will run in background tabs
   - Monitor progress in the popup

### Step 4: View Results

1. Click "📈 Dashboard" to see:
   - Obfuscation score
   - Demographic confidence changes
   - Interest distribution
   - Activity timeline

## 🔧 Configuration

### Extension Settings

Access via popup → ⚙️ Settings:

- **Search Engine:** Google or Bing
- **Query Delay:** Time between queries (default: 3 seconds)
- **Queries Per Session:** Batch size (default: 10)
- **Auto Mode Interval:** Frequency for automatic execution

### Backend Configuration

Edit `server.py`:

```python
PERSONA_COUNT = 3  # Number of personas to generate
CONFIDENCE_THRESHOLD = 0.6  # Minimum confidence for demographic inference
```

## 📊 API Endpoints

### `POST /api/analyze-profile`
Analyze search history and generate user profile.

**Request:**
```json
{
  "searches": [
    {
      "query": "best programming tutorials",
      "timestamp": 1234567890
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "profile": {
    "demographics": {...},
    "interests": {...},
    "behavior": {...}
  }
}
```

### `POST /api/generate-personas`
Generate inverse personas based on profile.

**Request:**
```json
{
  "profile": {...},
  "count": 3
}
```

**Response:**
```json
{
  "success": true,
  "personas": [
    {
      "id": "persona_1",
      "title": "...",
      "demographics": {...},
      "queries": [...]
    }
  ]
}
```

### `POST /api/compare-profiles`
Compare initial and updated profiles.

**Request:**
```json
{
  "initialProfile": {...},
  "updatedProfile": {...}
}
```

**Response:**
```json
{
  "success": true,
  "comparison": {
    "demographic_changes": {...},
    "confidence_deltas": {...},
    "obfuscation_score": 45.67
  }
}
```

## 🎯 How It Works

### Profile Analysis

The system analyzes search queries using keyword matching and pattern recognition to infer:

- **Age Range:** Based on terms like "college", "retirement", "kids"
- **Gender:** Based on terms like "men's", "women's", "maternity"
- **Profession:** Based on industry-specific keywords
- **Marital Status:** Based on relationship terms
- **Interests:** Categorized into 12+ categories

### Persona Generation

For each demographic attribute, the system:

1. Identifies the user's inferred value
2. Selects an opposite value from available options
3. Generates queries that would be typical for that persona
4. Combines demographic and interest-based queries

### Query Generation

Queries are generated using templates:

- Demographic-based: `"best X for age_range"`
- Interest-based: `"how to get started with category"`
- Behavioral: `"category for profession professionals"`

### Obfuscation Scoring

Score calculated based on:

- Reduction in demographic confidence scores
- Increase in interest diversity
- Number of new category appearances

Formula:
```
Obfuscation Score = (Confidence Reduction + Interest Diversification) / 2 × 100
```

## 🔒 Privacy & Security

- **No data sent to external servers** (except your chosen backend)
- **No tracking or analytics**
- **All data stored locally** in browser storage
- **Open source** - inspect all code
- **Backend runs locally** on your machine

## 🐛 Troubleshooting

### Backend Won't Start

```bash
# Check if port 5000 is available
lsof -i :5000

# Try a different port
# Edit server.py, change: app.run(port=5001)
# Edit popup.js, change: API_BASE_URL = 'http://localhost:5001'
```

### Extension Not Loading

1. Check Chrome console for errors:
   - Right-click extension icon → "Inspect popup"
   - Look for red error messages

2. Verify manifest.json is valid:
   ```bash
   # Use JSON validator
   python -m json.tool manifest.json
   ```

### Queries Not Executing

1. Check background service worker:
   - Go to `chrome://extensions/`
   - Click "Inspect views: service worker"
   - Look for errors in console

2. Verify permissions in manifest.json:
   - `tabs`, `storage`, `alarms` should all be present

### Dashboard Shows No Data

1. Open browser console (F12)
2. Check if data exists:
   ```javascript
   chrome.storage.local.get(null, console.log)
   ```
3. Verify queries have been executed
4. Try refreshing dashboard

## 📈 Future Enhancements

- [ ] Machine learning-based profile analysis
- [ ] More sophisticated persona generation
- [ ] Integration with more search engines
- [ ] Cloud sync (optional)
- [ ] Team/family accounts
- [ ] Custom persona templates
- [ ] Advanced scheduling options
- [ ] Export reports as PDF

## 🤝 Contributing

This project was created for HackNC State 2026. Contributions welcome!

## 📄 License

MIT License - feel free to use and modify

## 👥 Team

Mahika (mahika25) - HackNC State 2026

## 🙏 Acknowledgments

- Chrome Extension documentation
- Flask framework
- Chart.js for visualizations
- Google Takeout for data export

## 📞 Support

For issues or questions:
- Open an issue on GitHub
- Check troubleshooting section above
- Review code comments for implementation details

---

**Note:** This tool is for privacy protection and research purposes. Use responsibly and in accordance with search engine terms of service.
