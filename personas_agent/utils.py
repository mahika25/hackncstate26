import requests
from typing import Optional, Dict, Any

OLLAMA_URL = "http://localhost:11434/api/generate"


class OllamaError(Exception):
    pass


def query_ollama(
    prompt: str,
    model: str = "llama3.2",
    system: Optional[str] = None,
    temperature: float = 0.7,
    stream: bool = False,
    timeout: int = 120,
    extra_options: Optional[Dict[str, Any]] = None) -> str:

    payload = {
        "model": model,
        "prompt": prompt,
        "stream": stream,
        "options": {
            "temperature": temperature,
        },
    }

    if system:
        payload["system"] = system

    if extra_options:
        payload["options"].update(extra_options)

    try:
        response = requests.post(
            OLLAMA_URL,
            json=payload,
            timeout=timeout,
        )
    except requests.exceptions.RequestException as e:
        raise OllamaError(f"Ollama request failed: {e}")

    if response.status_code != 200:
        raise OllamaError(
            f"Ollama returned status {response.status_code}: {response.text}"
        )

    data = response.json()

    if "response" not in data:
        raise OllamaError(f"Unexpected Ollama response format: {data}")

    return data["response"]
