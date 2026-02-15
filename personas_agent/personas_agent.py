import os
import sys
import json

# Ensure sibling modules are importable regardless of cwd
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from utils import query_ollama

PERSONAS = [
    { "id": "outdoor_enthusiast", "label": "Outdoor Enthusiast", "description": "hiking, camping, backpacking, trail running, climbing, national parks, gear reviews" },
    { "id": "home_cook", "label": "Home Cook", "description": "recipes, cooking techniques, baking, food science, kitchen equipment, meal prep, restaurants" },
    { "id": "tech_reader", "label": "Tech Reader", "description": "gadgets, software, AI tools, programming tutorials, consumer electronics, tech news, apps" },
    { "id": "news_follower", "label": "News Follower", "description": "world news, politics, economics, investigative journalism, local news, opinion pieces" },
    { "id": "fitness_buff", "label": "Fitness & Wellness", "description": "workout routines, nutrition, running plans, yoga, supplements, weight training, recovery" },
    { "id": "diy_maker", "label": "DIY & Home", "description": "home improvement, woodworking, plumbing, electrical, interior design, gardening, tools" },
    { "id": "finance_watcher", "label": "Personal Finance", "description": "investing, budgeting, retirement planning, index funds, credit cards, mortgages, taxes" },
    { "id": "travel_dreamer", "label": "Travel Planner", "description": "travel destinations, hotels, flights, itineraries, travel tips, visas, packing lists" },
    { "id": "parent", "label": "Parent", "description": "parenting advice, child development, kids activities, school choices, family travel, toys" },
    { "id": "gamer", "label": "Gamer", "description": "video game reviews, walkthroughs, gaming hardware, esports, indie games, game deals" },
]


class PersonaSearchRecommender:

    def __init__(self, model: str = "llama3.2"):
        self.model = model
        # Build a lookup dict so we can find a persona by id quickly
        self._persona_map = {p["id"]: p for p in PERSONAS}

    def get_search_query_recommendations(self, persona_id: str) -> list[str]:
        """
        Given a persona id, returns a list of 10 Google search queries
        that person would realistically make.
        """
        persona = self._persona_map.get(persona_id)
        if persona is None:
            raise ValueError(
                f"Unknown persona id '{persona_id}'. "
                f"Valid ids: {list(self._persona_map.keys())}"
            )

        prompt = f"""
You are generating realistic Google search queries for a specific type of reader.

Persona: {persona["label"]}
Interests: {persona["description"]}

Generate exactly 10 Google search queries this person would realistically type into Google.
Keep each query natural and concise — the way a real person would search, not a full sentence.

Respond with ONLY a valid JSON array of 10 strings. No explanation, no markdown, no extra text.

Example format:
["query one", "query two", "query three", ...]
"""

        raw_response = query_ollama(prompt, model=self.model)

        try:
            queries = json.loads(raw_response.strip())
            if not isinstance(queries, list):
                raise ValueError("Response was not a JSON array.")
            # Ensure we always return exactly 10 strings
            queries = [str(q) for q in queries[:10]]
        except (json.JSONDecodeError, ValueError) as e:
            raise RuntimeError(
                f"Failed to parse search queries from model response.\n"
                f"Error: {e}\n"
                f"Raw response: {raw_response}"
            )

        return queries