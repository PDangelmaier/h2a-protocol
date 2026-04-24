# H2A CrewAI Adapter

Expose CrewAI multi-agent crews via the H2A protocol.

## Install

```bash
pip install h2a[fastapi] crewai
```

## Usage

```python
from crewai import Crew, Agent, Task
from h2a_crewai import H2ACrewAgent

researcher = Agent(role="Researcher", goal="Find information", backstory="...")
writer = Agent(role="Writer", goal="Write content", backstory="...")

research_task = Task(description="Research {input}", agent=researcher)
write_task = Task(description="Write about {input}", agent=writer)

crew = Crew(agents=[researcher, writer], tasks=[research_task, write_task])

h2a_agent = H2ACrewAgent(crew=crew, name="Research Team")
app = h2a_agent.create_app()

# uvicorn app:app --port 8100
```

## How It Works

1. User sends a message via H2A
2. Presence transitions: `conversing` → `orchestrating` (crew running) → `conversing` (results) → `rest`
3. Each crew agent gets a `tool_card` frame showing its status
4. Final output is streamed as text frames

## H2A Frame Mapping

| CrewAI Event | H2A Frame | Presence |
|-------------|-----------|----------|
| Crew kickoff | — | `orchestrating` |
| Agent starts | `tool_card` (running) | `orchestrating` |
| Agent completes | `tool_card` (completed) | `orchestrating` |
| Crew result | `text` (streaming) | `conversing` |
| Done | `end` | `rest` |

## License

MIT
