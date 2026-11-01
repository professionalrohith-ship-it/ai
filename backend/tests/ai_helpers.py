"""Shared helpers for the AI tests. FakeProvider is a test double that records what it is sent; the application
itself never ships canned AI answers."""
import pytest
from fastapi.testclient import TestClient

from app.ai.providers import LLMResponse, ProviderError
from app.main import create_app

from .conftest import register, scan, write
from .test_code_intelligence import run_parse


class FakeProvider:
    name = "fake"
    model = "fake-model"

    def __init__(self, reply="Answer based on the evidence [E1]."):
        self.reply = reply
        self.error = None
        self.calls = []

    def complete(self, system, messages, max_tokens, temperature):
        self.calls.append({"system": system, "messages": messages, "max_tokens": max_tokens, "temperature": temperature})
        if self.error:
            raise ProviderError(self.error)
        text = self.reply(system, messages) if callable(self.reply) else self.reply
        return LLMResponse(text, self.model)

    def check(self):
        return "fake provider is reachable"

    @property
    def last_prompt(self):
        return self.calls[-1]["messages"][-1]["content"]


@pytest.fixture
def fake():
    return FakeProvider()


@pytest.fixture
def ai_client(settings, fake):
    with TestClient(create_app(settings, ai_provider=fake)) as c:
        yield c


def prepare(client, root, parse=True):
    repo = register(client, root)
    scan(client, repo["id"])
    if parse:
        assert run_parse(client, repo["id"])["status"] == "completed"
    return repo["id"]


@pytest.fixture
def bugrepo(tmp_path):
    root = tmp_path / "bugrepo"
    write(root, "main.py", "from app.service import run\n\nrun({})\n")
    write(root, "app/__init__.py", "")
    write(root, "app/service.py",
          "def load(data):\n    value = data[\"name\"]\n    return value.upper()\n\n"
          "def parse_payload_data(raw):\n    return raw\n\n"
          "def run(payload):\n    if not payload:\n        raise ValueError(\"payload must not be empty\")\n    return load(payload)\n")
    write(root, "app/callers.py", "from app.service import run\n\ndef handler(event):\n    return run(event)\n")
    return root


TRACE = (
    "Traceback (most recent call last):\n"
    "  File \"/home/dev/proj/main.py\", line 3, in <module>\n    run({})\n"
    "  File \"/home/dev/proj/app/service.py\", line 10, in run\n    raise ValueError(\"payload must not be empty\")\n"
    "ValueError: payload must not be empty\n"
)


@pytest.fixture
def apirepo(tmp_path):
    root = tmp_path / "apirepo"
    write(root, "api/routes.py",
          "from fastapi import APIRouter\nrouter = APIRouter(prefix=\"/api\", tags=[\"x\"])\n\n"
          "@router.get(\"/items\")\ndef list_items():\n    pass\n\n"
          "@router.post(\"/items/{item_id}\", status_code=201)\ndef create_item(item_id):\n    pass\n")
    write(root, "flask_app.py", "from flask import Flask\napp = Flask(__name__)\n\n@app.route(\"/ping\", methods=[\"GET\", \"POST\"])\ndef ping():\n    pass\n")
    write(root, "server.js", "const express = require('express');\nconst app = express();\napp.get('/health', (req, res) => {});\napp.post('/users', createUser);\n")
    write(root, "client.js", "const axios = require('axios');\naxios.get('/api/should-not-count');\n")
    write(root, "src/main/java/UserController.java",
          "@RestController\n@RequestMapping(\"/users\")\npublic class UserController {\n  @GetMapping(\"/{id}\")\n  public String get() { return \"\"; }\n"
          "  @PostMapping\n  public void add() {}\n}\n")
    write(root, "main.go", "package main\n\nfunc main() {\n\tr.GET(\"/gin\", ginHandler)\n\thttp.HandleFunc(\"/legacy\", legacy)\n}\n")
    write(root, "Items.cs", "[Route(\"api/[controller]\")]\npublic class ItemsController {\n  [HttpGet(\"{id}\")]\n  public void Get() {}\n}\n")
    return root
