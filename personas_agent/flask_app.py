"""
Privacy Shield Backend Server - INTEGRATED VERSION (FIXED)
Combines your existing PersonaSearchRecommender with new profile analysis features
NOW WITH WORKING PERSONA GENERATION! ✨
"""

from flask import Flask, jsonify, request, Response
from flask_cors import CORS

import os
import sys

# Ensure sibling modules are importable regardless of cwd
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from personas_agent import PersonaSearchRecommender
import threading
import random
import time
import queue
import json
from datetime import datetime
from collections import Counter
from typing import List, Dict, Any

app = Flask(__name__)
CORS(app)
recommender = PersonaSearchRecommender()

# Existing SSE functionality
approved_queries = []
approved_lock = threading.Lock()
sse_clients = []
sse_clients_lock = threading.Lock()

# Configuration for new features
PERSONA_COUNT = 3
CONFIDENCE_THRESHOLD = 0.6

# Category keywords for query analysis
CATEGORIES = {
    'technology': ['software', 'app', 'computer', 'phone', 'tech', 'coding', 'programming', 'AI', 'machine learning'],
    'entertainment': ['movie', 'music', 'game', 'netflix', 'spotify', 'concert', 'theater', 'show'],
    'shopping': ['buy', 'purchase', 'price', 'deal', 'discount', 'shop', 'store', 'amazon'],
    'food': ['recipe', 'restaurant', 'cook', 'food', 'meal', 'eat', 'dinner', 'lunch'],
    'travel': ['hotel', 'flight', 'vacation', 'trip', 'travel', 'destination', 'tour', 'visit'],
    'health': ['fitness', 'exercise', 'health', 'medical', 'doctor', 'hospital', 'workout', 'diet'],
    'finance': ['stock', 'investment', 'bank', 'loan', 'mortgage', 'credit', 'money', 'finance'],
    'education': ['course', 'learn', 'study', 'university', 'school', 'tutorial', 'education', 'class'],
    'news': ['news', 'politics', 'election', 'current events', 'breaking', 'headlines'],
    'sports': ['football', 'basketball', 'soccer', 'sports', 'game', 'team', 'score', 'match'],
    'fashion': ['fashion', 'clothing', 'style', 'outfit', 'dress', 'shoes', 'accessories'],
    'home': ['furniture', 'decor', 'home', 'garden', 'DIY', 'renovation', 'interior']
}

# Demographic inference patterns
AGE_PATTERNS = {
    '18-24': ['college', 'university', 'dorm', 'student', 'graduation', 'first job', 'tiktok', 'snapchat'],
    '25-34': ['career', 'apartment', 'dating', 'wedding', 'startup', 'linkedin', 'promotion'],
    '35-44': ['mortgage', 'kids', 'school', 'family car', 'retirement planning', 'parenting'],
    '45-54': ['college fund', 'middle age', 'empty nest', 'career peak', '401k'],
    '55+': ['retirement', 'grandkids', 'medicare', 'social security', 'estate planning']
}

GENDER_PATTERNS = {
    'male': ['men\'s', 'father', 'dad', 'husband', 'boyfriend', 'mens'],
    'female': ['women\'s', 'mother', 'mom', 'wife', 'girlfriend', 'womens', 'pregnancy', 'maternity'],
    'neutral': ['partner', 'spouse', 'parent', 'person']
}

PROFESSION_PATTERNS = {
    'tech': ['programming', 'developer', 'engineer', 'software', 'coding', 'IT', 'tech'],
    'healthcare': ['medical', 'doctor', 'nurse', 'hospital', 'patient', 'healthcare'],
    'education': ['teacher', 'professor', 'educator', 'teaching', 'classroom'],
    'business': ['marketing', 'sales', 'business', 'management', 'executive', 'corporate'],
    'creative': ['designer', 'artist', 'photographer', 'writer', 'creative'],
    'finance': ['accountant', 'financial', 'banker', 'investment', 'CPA'],
    'trades': ['electrician', 'plumber', 'carpenter', 'construction', 'mechanic'],
    'service': ['retail', 'restaurant', 'hospitality', 'customer service']
}

MARITAL_PATTERNS = {
    'single': ['dating', 'single', 'tinder', 'bumble', 'first date'],
    'relationship': ['boyfriend', 'girlfriend', 'dating', 'anniversary'],
    'married': ['wedding', 'marriage', 'spouse', 'husband', 'wife', 'married'],
    'divorced': ['divorce', 'separation', 'custody', 'child support'],
    'widowed': ['widower', 'widow', 'late husband', 'late wife']
}

# Persona mappings from your existing PERSONAS
PERSONA_MAPPINGS = {
    'outdoor_enthusiast': {'label': 'Outdoor Enthusiast', 'category': 'Active'},
    'home_cook': {'label': 'Home Cook', 'category': 'Creative'},
    'tech_reader': {'label': 'Tech Reader', 'category': 'Professional'},
    'news_follower': {'label': 'News Follower', 'category': 'Informed'},
    'fitness_buff': {'label': 'Fitness & Wellness', 'category': 'Active'},
    'diy_maker': {'label': 'DIY & Home', 'category': 'Creative'},
    'finance_watcher': {'label': 'Personal Finance', 'category': 'Professional'},
    'travel_dreamer': {'label': 'Travel Planner', 'category': 'Explorer'},
    'parent': {'label': 'Parent', 'category': 'Family'},
    'gamer': {'label': 'Gamer', 'category': 'Entertainment'}
}


# ========== EXISTING SSE FUNCTIONALITY ==========

def dispatcher_thread():
    """Background thread that dispatches approved queries to SSE clients"""
    while True:
        wait = random.uniform(2, 5)
        time.sleep(wait)

        with approved_lock:
            if not approved_queries:
                continue
            query = approved_queries.pop(0)

        event_data = json.dumps({"query": query})

        with sse_clients_lock:
            for client_queue in sse_clients:
                client_queue.put(event_data)


# Start the background dispatcher
thread = threading.Thread(target=dispatcher_thread, daemon=True)
thread.start()


# ========== PROFILE ANALYSIS CLASSES ==========

class ProfileAnalyzer:
    """Analyzes search history to create user profile"""
    
    def __init__(self, searches: List[Dict[str, Any]]):
        self.searches = searches
        self.queries = [s['query'].lower() for s in searches]
        self.all_text = ' '.join(self.queries)

    @staticmethod
    def _normalize_timestamp(ts) -> float:
        """Convert a timestamp to a numeric epoch-ms value.
        
        Handles:
          - int / float (already epoch-ms)
          - ISO-8601 date strings (e.g. Google Takeout's 'time' field)
          - Falls back to 0 on failure
        """
        if isinstance(ts, (int, float)):
            return float(ts)
        if isinstance(ts, str):
            try:
                from dateutil.parser import parse as parse_dt
                dt = parse_dt(ts)
                return dt.timestamp() * 1000  # convert seconds → ms
            except (ValueError, ImportError):
                pass
        return 0.0
        
    def analyze(self) -> Dict[str, Any]:
        """Perform complete profile analysis"""
        profile = {
            'demographics': {
                'age_range': self._infer_age(),
                'gender': self._infer_gender(),
                'profession': self._infer_profession(),
                'marital_status': self._infer_marital_status()
            },
            'interests': self._analyze_interests(),
            'behavior': self._analyze_behavior(),
            'search_patterns': self._analyze_patterns(),
            'metadata': {
                'total_searches': len(self.searches),
                'analyzed_at': datetime.now().isoformat(),
                'timespan': self._get_timespan()
            }
        }
        return profile
    
    def _infer_age(self) -> Dict[str, Any]:
        scores = {}
        for age_range, keywords in AGE_PATTERNS.items():
            score = sum(1 for kw in keywords if kw in self.all_text)
            scores[age_range] = score
        
        if not any(scores.values()):
            return {'range': 'unknown', 'confidence': 0.0}
        
        max_score = max(scores.values())
        age_range = max(scores, key=scores.get)
        confidence = min(max_score / 10, 1.0)
        
        return {'range': age_range, 'confidence': confidence, 'scores': scores}
    
    def _infer_gender(self) -> Dict[str, Any]:
        scores = {}
        for gender, keywords in GENDER_PATTERNS.items():
            score = sum(1 for kw in keywords if kw in self.all_text)
            scores[gender] = score
        
        if not any(scores.values()):
            return {'value': 'unknown', 'confidence': 0.0}
        
        max_score = max(scores.values())
        gender = max(scores, key=scores.get)
        confidence = min(max_score / 5, 1.0)
        
        return {'value': gender, 'confidence': confidence, 'scores': scores}
    
    def _infer_profession(self) -> Dict[str, Any]:
        scores = {}
        for profession, keywords in PROFESSION_PATTERNS.items():
            score = sum(1 for kw in keywords if kw in self.all_text)
            scores[profession] = score
        
        if not any(scores.values()):
            return {'field': 'unknown', 'confidence': 0.0}
        
        max_score = max(scores.values())
        profession = max(scores, key=scores.get)
        confidence = min(max_score / 8, 1.0)
        
        return {'field': profession, 'confidence': confidence, 'scores': scores}
    
    def _infer_marital_status(self) -> Dict[str, Any]:
        scores = {}
        for status, keywords in MARITAL_PATTERNS.items():
            score = sum(1 for kw in keywords if kw in self.all_text)
            scores[status] = score
        
        if not any(scores.values()):
            return {'status': 'unknown', 'confidence': 0.0}
        
        max_score = max(scores.values())
        status = max(scores, key=scores.get)
        confidence = min(max_score / 5, 1.0)
        
        return {'status': status, 'confidence': confidence, 'scores': scores}
    
    def _analyze_interests(self) -> Dict[str, Any]:
        interests = {}
        for category, keywords in CATEGORIES.items():
            count = sum(1 for kw in keywords if kw in self.all_text)
            if count > 0:
                interests[category] = {
                    'count': count,
                    'percentage': (count / len(self.queries)) * 100
                }
        
        sorted_interests = dict(sorted(interests.items(), key=lambda x: x[1]['count'], reverse=True))
        return {'categories': sorted_interests, 'top_interests': list(sorted_interests.keys())[:5]}
    
    def _analyze_behavior(self) -> Dict[str, Any]:
        return {
            'avg_query_length': sum(len(q.split()) for q in self.queries) / len(self.queries),
            'question_queries': sum(1 for q in self.queries if '?' in q),
            'specific_vs_broad': self._classify_specificity(),
            'temporal_patterns': self._analyze_temporal()
        }
    
    def _classify_specificity(self) -> Dict[str, int]:
        specific = sum(1 for q in self.queries if len(q.split()) > 4)
        return {'specific': specific, 'broad': len(self.queries) - specific}
    
    def _analyze_temporal(self) -> Dict[str, Any]:
        if not self.searches or 'timestamp' not in self.searches[0]:
            return {'available': False}
        timestamps = [self._normalize_timestamp(s.get('timestamp', 0)) for s in self.searches]
        timestamps = [t for t in timestamps if t > 0]
        if len(timestamps) < 2:
            return {'available': False}
        return {
            'available': True,
            'earliest': min(timestamps),
            'latest': max(timestamps),
            'span_days': (max(timestamps) - min(timestamps)) / (1000 * 60 * 60 * 24)
        }
    
    def _analyze_patterns(self) -> Dict[str, Any]:
        words = []
        for query in self.queries:
            words.extend(query.split())
        word_freq = Counter(words)
        common_words = [w for w, _ in word_freq.most_common(20) 
                       if len(w) > 3 and w not in ['what', 'where', 'when', 'how', 'the']]
        return {
            'common_terms': common_words[:10],
            'unique_queries': len(set(self.queries)),
            'repeated_queries': len(self.queries) - len(set(self.queries))
        }
    
    def _get_timespan(self) -> str:
        if not self.searches or 'timestamp' not in self.searches[0]:
            return 'unknown'
        timestamps = [self._normalize_timestamp(s.get('timestamp', 0)) for s in self.searches]
        timestamps = [t for t in timestamps if t > 0]
        if len(timestamps) < 2:
            return 'unknown'
        span_days = (max(timestamps) - min(timestamps)) / (1000 * 60 * 60 * 24)
        if span_days < 7:
            return f'{int(span_days)} days'
        elif span_days < 30:
            return f'{int(span_days / 7)} weeks'
        else:
            return f'{int(span_days / 30)} months'


class ProfileComparator:
    """Compares initial and updated profiles"""
    
    def __init__(self, initial_profile: Dict[str, Any], updated_profile: Dict[str, Any]):
        self.initial = initial_profile
        self.updated = updated_profile
    
    def compare(self) -> Dict[str, Any]:
        comparison = {
            'demographic_changes': self._compare_demographics(),
            'interest_changes': self._compare_interests(),
            'confidence_deltas': self._calculate_confidence_deltas(),
            'obfuscation_score': self._calculate_obfuscation_score(),
            'summary': self._generate_summary(),
            'compared_at': datetime.now().isoformat()
        }
        return comparison
    
    def _compare_demographics(self) -> Dict[str, Any]:
        initial_demo = self.initial['demographics']
        updated_demo = self.updated['demographics']
        changes = {}
        
        for key in initial_demo:
            initial_val = initial_demo[key]
            updated_val = updated_demo[key]
            if isinstance(initial_val, dict) and 'range' in initial_val:
                changes[key] = {
                    'initial': initial_val.get('range', initial_val.get('value', initial_val.get('field', initial_val.get('status')))),
                    'updated': updated_val.get('range', updated_val.get('value', updated_val.get('field', updated_val.get('status')))),
                    'changed': initial_val != updated_val
                }
        return changes
    
    def _compare_interests(self) -> Dict[str, Any]:
        initial_interests = set(self.initial['interests']['top_interests'])
        updated_interests = set(self.updated['interests']['top_interests'])
        return {
            'new_interests': list(updated_interests - initial_interests),
            'lost_interests': list(initial_interests - updated_interests),
            'maintained_interests': list(initial_interests & updated_interests),
            'diversity_increase': len(updated_interests) - len(initial_interests)
        }
    
    def _calculate_confidence_deltas(self) -> Dict[str, float]:
        deltas = {}
        demo_keys = ['age_range', 'gender', 'profession', 'marital_status']
        
        for key in demo_keys:
            initial_conf = self.initial['demographics'][key].get('confidence', 0)
            updated_conf = self.updated['demographics'][key].get('confidence', 0)
            delta = updated_conf - initial_conf
            deltas[key] = {
                'initial_confidence': round(initial_conf, 3),
                'updated_confidence': round(updated_conf, 3),
                'delta': round(delta, 3),
                'percentage_change': round((delta / max(initial_conf, 0.01)) * 100, 2)
            }
        return deltas
    
    def _calculate_obfuscation_score(self) -> float:
        scores = []
        for key in ['age_range', 'gender', 'profession', 'marital_status']:
            initial_conf = self.initial['demographics'][key].get('confidence', 0)
            updated_conf = self.updated['demographics'][key].get('confidence', 0)
            if initial_conf > 0:
                reduction = (initial_conf - updated_conf) / initial_conf
                scores.append(max(0, reduction))
        
        initial_count = len(self.initial['interests']['top_interests'])
        updated_count = len(self.updated['interests']['top_interests'])
        if initial_count > 0:
            interest_score = (updated_count - initial_count) / initial_count
            scores.append(max(0, interest_score))
        
        obfuscation_score = sum(scores) / len(scores) if scores else 0
        return round(obfuscation_score * 100, 2)
    
    def _generate_summary(self) -> Dict[str, Any]:
        demo_changes = self._compare_demographics()
        interest_changes = self._compare_interests()
        obfuscation = self._calculate_obfuscation_score()
        changed_count = sum(1 for v in demo_changes.values() if v.get('changed', False))
        
        return {
            'demographics_changed': changed_count,
            'new_interests_added': len(interest_changes['new_interests']),
            'obfuscation_effectiveness': obfuscation,
            'recommendation': self._get_recommendation(obfuscation)
        }
    
    def _get_recommendation(self, obfuscation_score: float) -> str:
        if obfuscation_score > 50:
            return "Excellent obfuscation. Your profile has been significantly diversified."
        elif obfuscation_score > 30:
            return "Good obfuscation. Consider executing more queries for better results."
        elif obfuscation_score > 15:
            return "Moderate obfuscation. Execute additional queries to improve effectiveness."
        else:
            return "Low obfuscation. More queries needed to effectively obscure your profile."


def select_inverse_personas(profile: Dict[str, Any], count: int = 3) -> List[str]:
    """
    Select persona IDs that are INVERSE/OPPOSITE to the user's profile
    This ensures the generated queries will obfuscate the user's actual interests
    """
    top_interests = profile.get('interests', {}).get('top_interests', [])
    
    # Map interests to personas we should AVOID (because they match user)
    interest_to_persona = {
        'technology': 'tech_reader',
        'food': 'home_cook',
        'health': 'fitness_buff',
        'sports': 'fitness_buff',
        'travel': 'travel_dreamer',
        'finance': 'finance_watcher',
        'news': 'news_follower',
        'home': 'diy_maker',
        'entertainment': 'gamer'
    }
    
    # Get personas to avoid (ones that match user's interests)
    avoid_personas = set()
    for interest in top_interests:
        if interest in interest_to_persona:
            avoid_personas.add(interest_to_persona[interest])
    
    # All available personas
    all_persona_ids = list(PERSONA_MAPPINGS.keys())
    
    # Select inverse personas (ones NOT in avoid list)
    inverse_personas = [p for p in all_persona_ids if p not in avoid_personas]
    
    # If we filtered too many, add some back randomly
    if len(inverse_personas) < count:
        inverse_personas = all_persona_ids
    
    # Randomly select the requested count
    selected = random.sample(inverse_personas, min(count, len(inverse_personas)))
    
    print(f"🎭 User interests: {top_interests}")
    print(f"🚫 Avoiding personas: {avoid_personas}")
    print(f"✅ Selected inverse personas: {selected}")
    
    return selected


# ========== API ENDPOINTS ==========

# --- EXISTING ENDPOINTS ---

@app.route("/api/recommendations", methods=["GET"])
def get_recommendations():
    """Your existing endpoint - uses PersonaSearchRecommender"""
    persona_id = request.args.get("persona_id")
    if not persona_id:
        return jsonify({"error": "Missing required query parameter: persona_id"}), 400

    try:
        queries = recommender.get_search_query_recommendations(persona_id)
        return jsonify({"persona_id": persona_id, "queries": queries})
    except ValueError as e:
        return jsonify({"error": str(e)}), 404
    except RuntimeError as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/approve", methods=["POST"])
def approve_queries():
    """Your existing endpoint - approves queries for SSE dispatch"""
    data = request.get_json()
    if not data or "queries" not in data:
        return jsonify({"error": "Missing 'queries' in request body"}), 400

    queries = data["queries"]
    if not isinstance(queries, list) or not all(isinstance(q, str) for q in queries):
        return jsonify({"error": "'queries' must be a list of strings"}), 400

    with approved_lock:
        approved_queries.extend(queries)

    return jsonify({
        "message": f"{len(queries)} queries approved and queued.",
        "total_queued": len(approved_queries)
    })


@app.route("/api/stream", methods=["GET"])
def stream():
    """Your existing SSE endpoint"""
    client_queue = queue.Queue()

    with sse_clients_lock:
        sse_clients.append(client_queue)

    def event_stream():
        try:
            while True:
                data = client_queue.get()
                yield f"data: {data}\n\n"
        except GeneratorExit:
            with sse_clients_lock:
                sse_clients.remove(client_queue)

    return Response(event_stream(), mimetype="text/event-stream", headers={
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no"
    })


# --- NEW ENDPOINTS (FIXED) ---

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({'status': 'healthy', 'timestamp': datetime.now().isoformat()})


@app.route('/api/analyze-profile', methods=['POST'])
def analyze_profile():
    """NEW: Analyze search history and generate profile"""
    try:
        data = request.json
        searches = data.get('searches', [])
        
        if not searches:
            return jsonify({'error': 'No search history provided'}), 400
        
        print(f"📊 Analyzing {len(searches)} searches...")
        
        analyzer = ProfileAnalyzer(searches)
        profile = analyzer.analyze()
        
        print(f"✅ Profile generated! Top interests: {profile['interests']['top_interests']}")
        
        return jsonify({'success': True, 'profile': profile})
        
    except Exception as e:
        print(f"❌ Error in analyze_profile: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/generate-personas', methods=['POST'])
def generate_personas():
    """
    NEW: Generate inverse personas based on profile
    NOW USES YOUR PersonaSearchRecommender TO GENERATE REAL QUERIES! 🎉
    """
    try:
        data = request.json
        profile = data.get('profile', {})
        count = data.get('count', PERSONA_COUNT)
        
        if not profile:
            return jsonify({'error': 'No profile provided'}), 400
        
        print(f"🎭 Generating {count} inverse personas...")
        
        # Select inverse persona IDs based on user's profile
        selected_persona_ids = select_inverse_personas(profile, count)
        
        personas = []
        for i, persona_id in enumerate(selected_persona_ids):
            print(f"  ⚙️  Generating queries for persona: {persona_id}")
            
            # Use YOUR EXISTING PersonaSearchRecommender to generate queries!
            try:
                queries = recommender.get_search_query_recommendations(persona_id)
                print(f"  ✅ Generated {len(queries)} queries for {persona_id}")
            except Exception as e:
                print(f"  ⚠️  Error generating queries for {persona_id}: {e}")
                queries = []
            
            # Get persona metadata
            persona_info = PERSONA_MAPPINGS.get(persona_id, {
                'label': f'Persona {i+1}',
                'category': 'General'
            })
            
            # Build complete persona object
            persona = {
                'id': f'persona_{i + 1}',
                'persona_id': persona_id,  # The actual persona type
                'title': persona_info['label'],
                'description': f"Queries generated to obfuscate your profile with {persona_info['label'].lower()} interests",
                'demographics': {
                    'age_range': 'varied',
                    'gender': 'varied',
                    'profession': 'varied',
                    'marital_status': 'varied'
                },
                'interests': [persona_id],
                'queries': queries,  # REAL QUERIES from your Ollama-powered recommender!
                'category': persona_info['category'],
                'created_at': datetime.now().isoformat()
            }
            personas.append(persona)
        
        print(f"✅ Successfully generated {len(personas)} personas with queries!")
        
        return jsonify({
            'success': True,
            'personas': personas,
            'count': len(personas)
        })
        
    except Exception as e:
        print(f"❌ Error in generate_personas: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/compare-profiles', methods=['POST'])
def compare_profiles():
    """NEW: Compare initial and updated profiles"""
    try:
        data = request.json
        initial_profile = data.get('initialProfile', {})
        updated_profile = data.get('updatedProfile', {})
        
        if not initial_profile or not updated_profile:
            return jsonify({'error': 'Both profiles required'}), 400
        
        comparator = ProfileComparator(initial_profile, updated_profile)
        comparison = comparator.compare()
        
        return jsonify({'success': True, 'comparison': comparison})
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/export-data', methods=['POST'])
def export_data():
    """NEW: Export all user data"""
    try:
        data = request.json
        export = {
            'initial_profile': data.get('initialProfile'),
            'updated_profile': data.get('updatedProfile'),
            'personas': data.get('personas'),
            'executed_queries': data.get('executedQueries'),
            'comparison': data.get('comparison'),
            'exported_at': datetime.now().isoformat()
        }
        return jsonify({'success': True, 'data': export})
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/')
def home():
    """Welcome page - no more 404s!"""
    return jsonify({
        "message": "🛡️ Privacy Shield API",
        "status": "running",
        "endpoints": {
            "health": "/health",
            "analyze": "/api/analyze-profile",
            "personas": "/api/generate-personas",
            "compare": "/api/compare-profiles",
            "recommendations": "/api/recommendations",
            "approve": "/api/approve",
            "stream": "/api/stream",
            "export": "/api/export-data"
        }
    })


if __name__ == "__main__":
    print("🛡️  Privacy Shield Backend Server (INTEGRATED + FIXED)")
    print("=" * 60)
    print("Starting Flask server with:")
    print("  ✅ Existing PersonaSearchRecommender (Ollama-powered)")
    print("  ✅ SSE query dispatch")
    print("  ✅ NEW: Profile analysis")
    print("  ✅ NEW: Inverse persona selection")
    print("  ✅ NEW: Real query generation using YOUR recommender!")
    print("  ✅ NEW: Profile comparison")
    print("API available at: http://localhost:5001")
    print("=" * 60)
    
    # threaded=True is required for SSE to work properly
    app.run(debug=True, threaded=True, host='0.0.0.0', port=5001)