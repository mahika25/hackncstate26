from flask import Flask, jsonify, request, Response
from flask_cors import CORS 
from personas_agent import PersonaSearchRecommender
import threading
import random
import time
import queue
import json

app = Flask(__name__)
CORS(app)
recommender = PersonaSearchRecommender()

# Stores approved queries yet to be dispatched
approved_queries = []
approved_lock = threading.Lock()

# Each connected SSE client gets their own queue
sse_clients = []
sse_clients_lock = threading.Lock()


def dispatcher_thread():
    """
    Background thread that picks a random approved query every few seconds
    and pushes it to all connected SSE clients.
    """
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


# --- Endpoints ---

@app.route("/api/recommendations", methods=["GET"])
def get_recommendations():
    persona_id = request.args.get("persona_id")

    if not persona_id:
        return jsonify({"error": "Missing required query parameter: persona_id"}), 400

    try:
        queries = recommender.get_search_query_recommendations(persona_id)
        return jsonify({
            "persona_id": persona_id,
            "queries": queries
        })
    except ValueError as e:
        return jsonify({"error": str(e)}), 404
    except RuntimeError as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/approve", methods=["POST"])
def approve_queries():
    """
    Receives the list of user-approved queries from the extension.
    Expected body: { "queries": ["query one", "query two", ...] }
    """
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
    """
    SSE endpoint. The extension connects here and listens for queries to open.
    """
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
        "X-Accel-Buffering": "no"  # Important if running behind nginx
    })


if __name__ == "__main__":
    # threaded=True is required for SSE to work properly
    app.run(debug=True, threaded=True)