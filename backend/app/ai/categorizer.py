import json
import re
from typing import List, Dict, Any

from app.config import OLLAMA_MODEL
from app.ai.ollama_service import query_ollama, OllamaServiceError

# The 10 strict allowed categories required by Tab Bankruptcy
ALLOWED_CATEGORIES = [
    "Development",
    "Study",
    "Research",
    "Work",
    "Shopping",
    "News",
    "Entertainment",
    "Social",
    "Finance",
    "Other",
]

# Canonical lookup map (lowercased -> canonical TitleCase)
CATEGORY_LOOKUP = {cat.lower(): cat for cat in ALLOWED_CATEGORIES}

# Batch size: 10 tabs per AI request (ensures manageable prompts and fast local inference)
BATCH_SIZE = 10


def validate_category(raw_category: str) -> str:
    """
    Validates a category string against the 10 allowed categories.
    Returns canonical title-case category or 'Other' if unrecognized.
    """
    if not raw_category:
        return "Other"
    clean_cat = raw_category.strip().lower()
    return CATEGORY_LOOKUP.get(clean_cat, "Other")


def build_batch_prompt(tabs_batch: List[Dict[str, Any]]) -> str:
    """
    Builds a strict, structured prompt instructing the model to classify
    each tab using only the 10 allowed categories.
    """
    tab_lines = []
    for idx, tab in enumerate(tabs_batch):
        title = (tab.get("title") or "Untitled").strip()
        url = (tab.get("url") or "").strip()
        tab_lines.append(f"[{idx}] Title: {title} | URL: {url}")

    tabs_text = "\n".join(tab_lines)

    categories_list = "\n".join([f"- {cat}" for cat in ALLOWED_CATEGORIES])

    prompt = f"""You are an expert AI browser tab classifier.
Categorize each website into EXACTLY ONE of the following 10 allowed categories:
{categories_list}

Category Guide:
- Development: Coding, GitHub, StackOverflow, APIs, tech docs, software tools
- Study: Courses, tutorials, educational portals, school homework, learning sites
- Research: Scientific papers, Wikipedia, encyclopedias, scholarly articles, documentation
- Work: Office apps, email/Gmail, Slack, Jira, Trello, project management, business tools
- Shopping: E-commerce, Amazon, retail stores, product catalogs
- News: Newspapers, journalism, current events, magazines
- Entertainment: Video streaming, YouTube, games, movies, music, humor
- Social: Social networks, Twitter/X, LinkedIn, Reddit, Instagram, Facebook
- Finance: Banking, crypto, investments, stocks, taxes, payments
- Other: Anything that does not clearly fit into the above

CRITICAL RULES:
1. Choose ONLY from the 10 allowed categories above. Do NOT invent new categories.
2. Return ONLY a valid JSON array of objects.
3. Each object must have "index" (matching the bracketed number) and "category" (from allowed list).
4. Do NOT output markdown code blocks (```json) or any additional text.

Input Tabs:
{tabs_text}

JSON Output:"""

    return prompt


def parse_batch_response(raw_text: str, expected_count: int) -> Dict[int, str]:
    """
    Parses the raw JSON response from Qwen.
    Strips markdown formatting, extracts JSON array, validates categories,
    and falls back to 'Other' for missing or invalid items.
    """
    results: Dict[int, str] = {}
    cleaned = raw_text.strip()

    # Strip markdown code blocks if the model included them
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r"\s*```$", "", cleaned)
    cleaned = cleaned.strip()

    # Attempt to extract JSON array
    match = re.search(r"\[\s*\{.*\}\s*\]", cleaned, flags=re.DOTALL)
    json_str = match.group(0) if match else cleaned

    try:
        data = json.loads(json_str)
        if isinstance(data, list):
            for item in data:
                if isinstance(item, dict) and "index" in item:
                    try:
                        idx = int(item["index"])
                        raw_cat = str(item.get("category", "")).strip()
                        canonical_cat = validate_category(raw_cat)
                        results[idx] = canonical_cat
                    except (ValueError, TypeError):
                        continue
    except Exception as e:
        print(f"[Tab Bankruptcy AI] Warning: Failed to parse batch JSON response ({e}). Raw snippet:\n{raw_text[:300]}")

    # Ensure every index from 0 to expected_count - 1 has a category
    for i in range(expected_count):
        if i not in results:
            results[i] = "Other"

    return results


def categorize_tabs(tabs: List[Dict[str, Any]], model: str = OLLAMA_MODEL) -> List[Dict[str, Any]]:
    """
    Categorizes a list of tabs by batching them into groups of 10.
    Returns list of dicts with 'id', 'title', 'url', and 'category'.
    """
    if not tabs:
        return []

    categorized_tabs: List[Dict[str, Any]] = []

    # Process in batches of 10
    total_tabs = len(tabs)
    for start_idx in range(0, total_tabs, BATCH_SIZE):
        batch = tabs[start_idx : start_idx + BATCH_SIZE]
        prompt = build_batch_prompt(batch)

        print(
            f"[Tab Bankruptcy AI] Categorizing batch {start_idx // BATCH_SIZE + 1} "
            f"({len(batch)} tabs) using {model}..."
        )

        try:
            ai_result = query_ollama(prompt=prompt, model=model)
            raw_response = ai_result.get("response", "")
            batch_categories = parse_batch_response(raw_response, len(batch))
        except OllamaServiceError as e:
            print(f"[Tab Bankruptcy AI] Ollama error during batch categorization: {e.message}")
            raise e
        except Exception as e:
            print(f"[Tab Bankruptcy AI] Unexpected error during batch: {e}")
            # Fallback to Other for this batch
            batch_categories = {i: "Other" for i in range(len(batch))}

        for idx, tab in enumerate(batch):
            assigned_cat = batch_categories.get(idx, "Other")
            categorized_tabs.append({
                "id": tab.get("id"),
                "title": tab.get("title", "Untitled"),
                "url": tab.get("url", ""),
                "category": assigned_cat,
            })

    return categorized_tabs
