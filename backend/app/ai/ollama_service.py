import json
import urllib.error
import urllib.request
from typing import Dict, Any

from app.config import OLLAMA_BASE_URL, OLLAMA_MODEL


class OllamaServiceError(Exception):
    def __init__(self, message: str, status_code: int = 500):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


def query_ollama(prompt: str, model: str = OLLAMA_MODEL) -> Dict[str, Any]:
    """
    Sends a generation prompt to the local Ollama instance.
    Communicates via the Ollama REST API: POST /api/generate with stream=false.
    """
    url = f"{OLLAMA_BASE_URL}/api/generate"
    payload = {
        "model": model,
        "prompt": prompt,
        "stream": False,
    }
    data_bytes = json.dumps(payload).encode("utf-8")

    req = urllib.request.Request(
        url,
        data=data_bytes,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        # 60s timeout for local inference on CPU/GPU
        with urllib.request.urlopen(req, timeout=60) as response:
            if response.status != 200:
                raise OllamaServiceError(
                    f"Ollama server returned HTTP {response.status}",
                    status_code=response.status,
                )
            raw_response = response.read().decode("utf-8")
            result = json.loads(raw_response)
            return result

    except urllib.error.HTTPError as e:
        error_body = e.read().decode("utf-8", errors="ignore")
        if e.code == 404:
            raise OllamaServiceError(
                f"Model '{model}' was not found in Ollama. Please run 'ollama pull {model}' to download it.",
                status_code=404,
            )
        raise OllamaServiceError(
            f"Ollama error (HTTP {e.code}): {error_body or e.reason}",
            status_code=e.code,
        )

    except urllib.error.URLError as e:
        # Connection refused / Ollama daemon not running
        raise OllamaServiceError(
            "Ollama is not running. Start Ollama and try again.",
            status_code=503,
        )

    except TimeoutError:
        raise OllamaServiceError(
            "Request to Ollama timed out. Local model took too long to respond.",
            status_code=504,
        )

    except Exception as e:
        raise OllamaServiceError(
            f"Unexpected error communicating with Ollama: {str(e)}",
            status_code=500,
        )
