Useful Resources for the AgentX Hackathon 📚
A curated collection of links to help you during the build sprint. We'll update this channel as new resources come in.
---
Assignment & Rules
#assignment — Full challenge description, technical requirements, and deliverables
#rules-and-guidelines — Official hackathon rules
#faq — Frequently asked questions (timezones, API keys, deliverables, navigation, e-commerce repos)
---
E-Commerce Repositories
.NET — eShop by Microsoft: https://github.com/dotnet/eShop
Ruby on Rails — Solidus: https://github.com/solidusio/solidus
Node.js — Reaction Commerce: https://github.com/reactioncommerce/reaction
---
LLM Providers (Free Tiers & Pay-as-You-Go)
Google Gemini API 
Groq
Mistral AI
OpenAI
Cloudflare Workers AI
Anthropic Claude
OpenRouter
---
Observability & Tracing
OpenTelemetry: https://opentelemetry.io/
Langfuse (LLM observability): https://langfuse.com/
LangSmith (LLM tracing): https://smith.langchain.com/
Arize Phoenix (open-source LLM tracing): https://github.com/Arize-ai/phoenix
---
Agent Frameworks & Tools
LangChain: https://python.langchain.com/
LangGraph: https://langchain-ai.github.io/langgraph
CrewAI: https://www.crewai.com/
Anthropic Agent SDK: https://github.com/anthropics/anthropic-sdk-python
OpenAI Agents SDK: https://github.com/openai/openai-agents-python
Pydantic AI: https://ai.pydantic.dev/
Convex Agents: https://www.convex.dev/components/agent

---
Docker
Docker Compose docs: https://docs.docker.com/compose
Docker getting started: https://docs.docker.com/get-started


Hackathon Context for AI Agents
You can find a set of .md files with all the relevant context that you can provide to your AI Agent.

Remember: Review and validate the files. Don't expose yourself to adversarial Prompt Injections 😉 

Thank you @iTzDiego for the innitiative! 🙌 


AGENTS_USE.md — Template & Instructions
Every team must include an AGENTS_USE.md file at the root of their repository. This file documents your agent implementation in a standardized format so evaluators can understand your solution without needing to run it.

The template is attached below this message. Copy it into your repo and fill in each section.

The provided information must be concise and text-based, unless explicitly required and except for Sections 6 (Observability) and 7 (Security). These should provide evidence  — screenshots, log samples, trace exports, or test results. Descriptions alone are not sufficient.

The file covers 9 sections:
Agent Overview — name, purpose, tech stack
Agents & Capabilities — structured description of each agent/sub-agent
Architecture & Orchestration — system design, data flow, error handling (include a diagram)
Context Engineering — how your agents source, filter, and manage context
Use Cases — step-by-step walkthroughs from trigger to resolution
Observability — logging, tracing, metrics
Security & Guardrails — prompt injection defense, input validation, tool safety
Scalability — capacity, approach, bottlenecks
Lessons Learned — what worked, what you'd change, key trade-offs

Remember: Sections 6 (Observability) and 7 (Security) require actual evidence — screenshots, log samples, trace exports, or test results. Descriptions alone are not sufficient.
# AGENTS_USE.md